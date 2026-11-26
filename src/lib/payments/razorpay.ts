/**
 * src/lib/payments/razorpay.ts
 *
 * Razorpay Payment Links & Webhooks Engine (Test & Live Compatible)
 * Best Auto Parts — Kailashpur, Saharanpur, UP 247001 (+91 96347 22174)
 */

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { engineSendText } from '@/lib/flows/meta-send';
import { normalizePhone, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import { deductStockForSale } from '@/lib/inventory/stock-deduction';

export interface CreatePaymentLinkInput {
  orderId?: string;
  customerName?: string;
  customerPhone: string;
  partDetails: string;
  amount: number;
  accountId?: string;
  userId?: string;
  conversationId?: string;
}

export interface PaymentLinkRecord {
  id?: string;
  account_id?: string;
  order_id: string;
  merchant_transaction_id: string;
  customer_name?: string;
  customer_phone: string;
  part_details: string;
  amount: number;
  paid_amount?: number;
  remaining_amount?: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED';
  delivery_status?: 'Confirmed' | 'Packed / Ready' | 'Out for Delivery (Local Rider)' | 'Delivered';
  rider_name?: string;
  rider_phone?: string;
  delivered_at?: string;
  delivery_notes?: string;
  razorpay_payment_link_id?: string;
  razorpay_payment_link_url?: string;
  razorpay_payment_id?: string;
  phonepe_redirect_url?: string; // backwards compatibility
  phonepe_transaction_id?: string; // backwards compatibility
  payment_mode?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RazorpayLinkResult {
  success: boolean;
  paymentLink: string;
  shortUrl: string;
  paymentLinkId: string;
  merchantTransactionId: string;
  orderId: string;
  amount: number;
}

// In-memory fallback cache for instant lookup & mock support
const localLinkCache = new Map<string, PaymentLinkRecord>();

export function getRazorpayConfig() {
  const keyId =
    process.env.RAZORPAY_KEY_ID ||
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
    '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://best-auto-parts-one.vercel.app'
  ).replace(/\/+$/, '');

  return {
    keyId: keyId.trim(),
    keySecret: keySecret.trim(),
    webhookSecret: webhookSecret.trim(),
    appUrl,
    isConfigured: Boolean(keyId.trim() && keySecret.trim()),
  };
}

/**
 * Creates a live Razorpay Payment Link (https://api.razorpay.com/v1/payment_links)
 * Test & Live compatible with automated fallback.
 */
export async function createRazorpayPaymentLink(
  input: CreatePaymentLinkInput
): Promise<RazorpayLinkResult> {
  const { keyId, keySecret, appUrl, isConfigured } = getRazorpayConfig();
  const db = supabaseAdmin();

  const rawOrderId =
    input.orderId?.trim() ||
    `ORD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const cleanOrderId = rawOrderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const amount = Number(input.amount);
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Invalid payment amount. Amount must be a positive number.');
  }

  const phoneDigits = sanitizePhoneForMeta(input.customerPhone);
  const normalizedPhone = phoneDigits ? `+91${phoneDigits.slice(-10)}` : '+919634722174';
  const amountInPaise = Math.round(amount * 100);
  const cleanCustomerName = input.customerName?.trim() || 'Valued Customer';
  const cleanDescription = (input.partDetails || 'Two-Wheeler Spare Parts Order').slice(0, 255);

  let paymentLinkId = `plink_${cleanOrderId.toLowerCase()}_${Date.now()}`;
  let shortUrl = `${appUrl}/pay?order=${encodeURIComponent(cleanOrderId)}&amount=${amount}&name=${encodeURIComponent(cleanCustomerName)}`;

  // 1. Call Razorpay API to generate live payment link
  if (isConfigured) {
    try {
      const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          accept_partial: false,
          reference_id: cleanOrderId,
          description: cleanDescription,
          customer: {
            name: cleanCustomerName,
            contact: normalizedPhone,
            email: 'care@bestautoparts.in',
          },
          notify: {
            sms: false,
            email: false,
          },
          reminder_enable: true,
          notes: {
            store: 'Best Auto Parts',
            address: 'Kailashpur, Saharanpur, UP 247001',
            order_id: cleanOrderId,
          },
          callback_url: `${appUrl}/pay/${cleanOrderId}`,
          callback_method: 'get',
        }),
      });

      const data = await response.json();
      if (response.ok && data?.short_url) {
        shortUrl = data.short_url;
        paymentLinkId = data.id || paymentLinkId;
      } else {
        console.warn('[Razorpay] Payment link API notice:', data?.error?.description || data);
        if (data?.short_url) {
          shortUrl = data.short_url;
        }
      }
    } catch (err: unknown) {
      console.warn('[Razorpay] Payment link API fetch warning, using fallback link:', err);
    }
  }

  // 2. Resolve Account ID
  let accountId = input.accountId;
  if (!accountId) {
    try {
      const { data: acc } = await db.from('accounts').select('id').limit(1).maybeSingle();
      accountId = acc?.id;
    } catch {
      // ignore
    }
  }

  const record: PaymentLinkRecord = {
    account_id: accountId,
    order_id: cleanOrderId,
    merchant_transaction_id: cleanOrderId,
    customer_name: cleanCustomerName,
    customer_phone: input.customerPhone.trim(),
    part_details: input.partDetails.trim(),
    amount,
    status: 'PENDING',
    razorpay_payment_link_id: paymentLinkId,
    razorpay_payment_link_url: shortUrl,
    phonepe_redirect_url: shortUrl, // Keep for backward-compat
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 3. Save to Database
  try {
    const { error: insertErr } = await db.from('payment_links').insert(record);
    if (insertErr) {
      // Fallback without razorpay-specific columns if migration not run yet
      const fallbackRecord = { ...record };
      delete fallbackRecord.razorpay_payment_link_id;
      delete fallbackRecord.razorpay_payment_link_url;
      delete fallbackRecord.razorpay_payment_id;
      await db.from('payment_links').insert(fallbackRecord);
    }
  } catch (dbErr) {
    console.warn('[Razorpay] DB insert notice:', dbErr);
  }

  // In-memory cache fallback
  localLinkCache.set(cleanOrderId, record);
  if (paymentLinkId) {
    localLinkCache.set(paymentLinkId, record);
  }

  return {
    success: true,
    paymentLink: shortUrl,
    shortUrl,
    paymentLinkId,
    merchantTransactionId: cleanOrderId,
    orderId: cleanOrderId,
    amount,
  };
}

/**
 * Verifies Razorpay Webhook Signature using HMAC SHA256.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  customSecret?: string
): boolean {
  if (!rawBody || !signature) return false;
  const secret = customSecret || getRazorpayConfig().webhookSecret;
  if (!secret) return false;

  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(signature.trim(), 'utf8');

    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (err) {
    console.warn('[Razorpay] Webhook signature verification error:', err);
    return false;
  }
}

/**
 * Finds payment link record by Order ID, merchantTransactionId, or Razorpay paymentLinkId.
 */
export async function getPaymentLinkByTxnId(
  txnId: string
): Promise<PaymentLinkRecord | null> {
  const db = supabaseAdmin();
  const clean = txnId.trim();

  try {
    const { data, error } = await db
      .from('payment_links')
      .select('*')
      .or(
        `merchant_transaction_id.eq.${clean},order_id.eq.${clean},razorpay_payment_link_id.eq.${clean}`
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as PaymentLinkRecord;
    }
  } catch {
    // fallback
  }

  return localLinkCache.get(clean) || null;
}

/**
 * Marks payment as PAID, updates orders & payment_links, deducts stock, and sends WhatsApp receipt.
 */
export async function markPaymentAsPaid(args: {
  merchantTransactionId?: string;
  orderId?: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId?: string;
  paymentMode?: string;
  paidAt?: string;
  amount?: number;
}): Promise<PaymentLinkRecord | null> {
  const db = supabaseAdmin();
  const nowIso = args.paidAt || new Date().toISOString();
  const targetId =
    args.orderId ||
    args.merchantTransactionId ||
    args.razorpayPaymentLinkId ||
    '';

  const record = await getPaymentLinkByTxnId(targetId);

  const updates: Record<string, unknown> = {
    status: 'PAID',
    razorpay_payment_id: args.razorpayPaymentId,
    phonepe_transaction_id: args.razorpayPaymentId, // Keep for backward-compat
    payment_mode: args.paymentMode || 'Razorpay / UPI',
    paid_at: nowIso,
    updated_at: nowIso,
  };

  if (args.razorpayPaymentLinkId) {
    updates.razorpay_payment_link_id = args.razorpayPaymentLinkId;
  }

  // Update payment_links in DB
  try {
    let q = db.from('payment_links').update(updates);
    if (record?.id) {
      q = q.eq('id', record.id);
    } else if (targetId) {
      q = q.or(
        `order_id.eq.${targetId},merchant_transaction_id.eq.${targetId},razorpay_payment_link_id.eq.${targetId}`
      );
    }
    const { error: updErr } = await q;
    if (updErr) {
      // Fallback without razorpay-specific columns if migration not run yet
      const fallbackUpdates = { ...updates };
      delete fallbackUpdates.razorpay_payment_id;
      delete fallbackUpdates.razorpay_payment_link_id;
      let qFb = db.from('payment_links').update(fallbackUpdates);
      if (record?.id) qFb = qFb.eq('id', record.id);
      else if (targetId) qFb = qFb.or(`order_id.eq.${targetId},merchant_transaction_id.eq.${targetId}`);
      await qFb;
    }
  } catch (err) {
    console.warn('[Razorpay] payment_links update notice:', err);
  }

  // Update cache
  if (record) {
    Object.assign(record, updates);
    if (record.order_id) localLinkCache.set(record.order_id, record);
    if (record.merchant_transaction_id) localLinkCache.set(record.merchant_transaction_id, record);
  }

  // Update orders table if order exists
  const effectiveOrderId = record?.order_id || args.orderId;
  if (effectiveOrderId) {
    try {
      await db
        .from('orders')
        .update({
          order_status: 'paid',
          updated_at: nowIso,
        })
        .or(`id.eq.${effectiveOrderId},metadata->>order_id.eq.${effectiveOrderId},catalog_order_id.eq.${effectiveOrderId}`);
    } catch {
      // non-fatal
    }
  }

  // Deduct inventory stock in parts_catalog and log in stock_movements
  const targetRecord = record || (await getPaymentLinkByTxnId(targetId));
  if (targetRecord) {
    await deductStockForPaidOrder(targetRecord, db).catch((err) => {
      console.warn('[Razorpay] Stock deduction error:', err);
    });
  }

  // Trigger WhatsApp payment receipt confirmation to customer
  if (targetRecord && targetRecord.customer_phone) {
    await sendWhatsAppPaymentConfirmation(targetRecord, args.razorpayPaymentId).catch((err) => {
      console.warn('[Razorpay] WhatsApp confirmation send failed:', err);
    });
  }

  return targetRecord;
}

/**
 * Deducts sold quantity from parts_catalog and records in stock_movements.
 */
export async function deductStockForPaidOrder(
  record: PaymentLinkRecord,
  db = supabaseAdmin()
): Promise<{ deducted: boolean }> {
  try {
    const rawName = record.part_details?.trim() || '';
    if (!rawName) return { deducted: false };

    const res = await deductStockForSale(db, {
      accountId: record.account_id,
      orderId: record.order_id,
      itemDescription: rawName,
      referenceId: record.order_id || record.merchant_transaction_id,
      reason: `Customer Sale (Order #${record.order_id} via Razorpay)`,
    });

    return { deducted: Boolean(res.alreadyDeducted || res.deductedCount > 0) };
  } catch (err) {
    console.warn('[Razorpay] deductStockForPaidOrder error:', err);
    return { deducted: false };
  }
}

/**
 * Sends formatted WhatsApp payment confirmation receipt to customer.
 */
export async function sendWhatsAppPaymentConfirmation(
  record: PaymentLinkRecord,
  paymentId?: string
): Promise<void> {
  const db = supabaseAdmin();
  const phone = record.customer_phone;
  const cleanPhone = normalizePhone(phone);

  // 1. Resolve contact
  interface ContactRow {
    id: string;
    account_id?: string;
    user_id?: string;
    phone?: string;
  }
  let contact: ContactRow | null = null;
  try {
    const { data: existingContact } = await db
      .from('contacts')
      .select('id, account_id, user_id, phone')
      .eq('phone_normalized', cleanPhone)
      .limit(1)
      .maybeSingle();

    contact = existingContact as ContactRow | null;
  } catch {}

  if (!contact) {
    try {
      const { data: fallbackContact } = await db
        .from('contacts')
        .select('id, account_id, user_id, phone')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle();

      contact = fallbackContact as ContactRow | null;
    } catch {}
  }

  // 2. Resolve account and user
  let accountId = record.account_id || contact?.account_id;
  let userId = contact?.user_id;
  if (!accountId) {
    const { data: acc } = await db
      .from('accounts')
      .select('id, owner_user_id')
      .limit(1)
      .maybeSingle();
    accountId = acc?.id;
    userId = userId || acc?.owner_user_id;
  }

  // 3. Find or create conversation
  let conversationId: string | undefined;
  if (contact?.id && accountId) {
    try {
      const { data: conv } = await db
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('account_id', accountId)
        .limit(1)
        .maybeSingle();

      conversationId = conv?.id;
    } catch {}
  }

  const amtFormatted = `₹${record.amount.toFixed(2)}`;
  const dateFormatted = record.paid_at
    ? new Date(record.paid_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

  const resolvedPaymentId =
    paymentId || record.razorpay_payment_id || record.phonepe_transaction_id || 'VERIFIED';

  const rawOrderId = record.order_id || record.merchant_transaction_id || 'ORDER';
  const displayOrderId = rawOrderId.startsWith('#') ? rawOrderId : `#${rawOrderId}`;

  const confirmationText =
    `✅ *PAYMENT RECEIPT — BEST AUTO PARTS* 🏍️\n` +
    `📦 *DELIVERY ORDER ID:* *${displayOrderId}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Delivery Order ID:* *${displayOrderId}*\n` +
    `• *Item / Part:* ${record.part_details}\n` +
    `• *Amount Paid:* ${amtFormatted} (Full Payment Received ✅)\n` +
    `• *Payment Mode:* ${record.payment_mode || 'Razorpay / UPI'}\n` +
    `• *Razorpay Payment ID:* ${resolvedPaymentId}\n` +
    `• *Date & Time:* ${dateFormatted}\n` +
    `• *Dispatch & Delivery:* Confirmed for Local Rider Delivery 🛵\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Thank you for your payment! Your transaction is verified via Razorpay.\n\n` +
    `🛵 *Local Rider Delivery & Dispatch Info:*\n` +
    `Your order is confirmed for Local Rider Delivery in Kailashpur / Saharanpur (or Store Pickup at Best Auto Parts, Kailashpur, Saharanpur, UP 247001; Support: +91 96347 22174). Our local rider will deliver your package shortly.\n\n` +
    `📍 *Store Address:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
    `🕒 *Timings:* 09:00 AM – 09:00 PM (Daily)\n` +
    `📞 *Direct Helpline:* Saud Khan (+91 96347 22174)`;

  if (contact?.id && accountId && userId && conversationId) {
    await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId: contact.id,
      text: confirmationText,
    });
  } else {
    console.log('[Razorpay] Payment confirmation for', phone, ':\n', confirmationText);
  }
}

/**
 * Verify payment with Razorpay or local database.
 */
export async function verifyAndSyncPaymentStatus(txnId: string): Promise<{
  status: 'PAID' | 'PENDING' | 'PARTIAL' | 'FAILED';
  record: PaymentLinkRecord | null;
  razorpayData?: Record<string, unknown>;
}> {
  const record = await getPaymentLinkByTxnId(txnId);
  if (record && record.status === 'PAID') {
    return { status: 'PAID', record };
  }

  const { keyId, keySecret, isConfigured } = getRazorpayConfig();

  if (isConfigured && record?.razorpay_payment_link_id) {
    try {
      const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch(
        `https://api.razorpay.com/v1/payment_links/${record.razorpay_payment_link_id}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const json = await res.json();
      if (json?.status === 'paid') {
        const payments = Array.isArray(json.payments) ? json.payments : [];
        const latestPayment = payments[payments.length - 1];
        const paymentId = latestPayment?.payment_id || `pay_${Date.now()}`;
        const paymentMode = latestPayment?.method || 'UPI';

        await markPaymentAsPaid({
          orderId: record.order_id,
          merchantTransactionId: record.merchant_transaction_id,
          razorpayPaymentId: paymentId,
          razorpayPaymentLinkId: record.razorpay_payment_link_id,
          paymentMode,
        });

        const updated = await getPaymentLinkByTxnId(txnId);
        return { status: 'PAID', record: updated, razorpayData: json };
      }
      return { status: record?.status || 'PENDING', record, razorpayData: json };
    } catch (err) {
      console.warn('[Razorpay] Status API check error:', err);
    }
  }

  return { status: record?.status || 'PENDING', record };
}
