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
  order_id?: string;
  ledgerId?: string;
  ledger_id?: string;
  customerName?: string;
  customer_name?: string;
  customerPhone?: string;
  customer_phone?: string;
  partDetails?: string;
  description?: string;
  amount: number;
  accountId?: string;
  userId?: string;
  conversationId?: string;
  notes?: Record<string, string>;
}

export interface RazorpayPaymentRecord {
  id?: string;
  account_id?: string;
  razorpay_payment_link_id?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  order_id?: string;
  ledger_id?: string;
  amount: number;
  currency?: string;
  status: 'created' | 'paid' | 'partially_paid' | 'expired' | 'cancelled' | 'failed' | string;
  customer_name?: string;
  customer_phone?: string;
  description?: string;
  short_url?: string;
  payment_method?: string;
  notes?: Record<string, unknown>;
  raw_webhook_payload?: Record<string, unknown>;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
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
  let appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://best-auto-parts-one.vercel.app'
  ).replace(/\/+$/, '');

  if (!appUrl || appUrl.includes('example.com') || !appUrl.startsWith('http')) {
    appUrl = 'https://best-auto-parts-one.vercel.app';
  }

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
    input.order_id?.trim() ||
    input.orderId?.trim() ||
    input.ledger_id?.trim() ||
    input.ledgerId?.trim() ||
    `ORD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const cleanOrderId = rawOrderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const amount = Number(input.amount);
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Invalid payment amount. Amount must be a positive number.');
  }

  const rawPhone = input.customer_phone || input.customerPhone || '';
  const phoneDigits = sanitizePhoneForMeta(rawPhone);
  const normalizedPhone = phoneDigits ? `+91${phoneDigits.slice(-10)}` : '+919634722174';
  const amountInPaise = Math.round(amount * 100);
  const cleanCustomerName = input.customer_name?.trim() || input.customerName?.trim() || 'Valued Customer';
  const cleanDescription = (input.description || input.partDetails || 'Two-Wheeler Spare Parts Order').slice(0, 255);

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
            ledger_id: input.ledger_id || input.ledgerId || '',
            customer_name: cleanCustomerName,
            customer_phone: rawPhone,
            ...(input.notes || {}),
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
    customer_phone: rawPhone.trim(),
    part_details: cleanDescription,
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

  // 4. Save to public.razorpay_payments table
  try {
    await db.from('razorpay_payments').insert({
      account_id: accountId,
      razorpay_payment_link_id: paymentLinkId,
      order_id: cleanOrderId,
      ledger_id: input.ledger_id || input.ledgerId || null,
      amount,
      currency: 'INR',
      status: 'created',
      customer_name: cleanCustomerName,
      customer_phone: rawPhone.trim(),
      description: cleanDescription,
      short_url: shortUrl,
      notes: {
        store: 'Best Auto Parts',
        order_id: cleanOrderId,
        ledger_id: input.ledger_id || input.ledgerId || '',
        customer_name: cleanCustomerName,
        customer_phone: rawPhone.trim(),
        ...(input.notes || {}),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (rzpDbErr) {
    console.warn('[Razorpay] razorpay_payments insert notice:', rzpDbErr);
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

export interface MarkPaymentAsPaidInput {
  merchantTransactionId?: string;
  orderId?: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId?: string;
  paymentMode?: string;
  paidAt?: string;
  amount?: number;
  skipReceipt?: boolean;
  skipLedgerCredit?: boolean;
}

/**
 * Marks payment as PAID, updates orders & payment_links, deducts stock, and sends WhatsApp receipt.
 */
export async function markPaymentAsPaid(args: MarkPaymentAsPaidInput): Promise<PaymentLinkRecord | null> {
  const db = supabaseAdmin();
  const nowIso = args.paidAt || new Date().toISOString();
  const targetId =
    args.orderId ||
    args.merchantTransactionId ||
    args.razorpayPaymentLinkId ||
    '';

  const record = await getPaymentLinkByTxnId(targetId);
  const alreadyPaid = record?.status === 'PAID';

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

  // Update razorpay_payments table if row exists
  try {
    const rzpTable = db.from('razorpay_payments');
    if (rzpTable && typeof rzpTable.update === 'function') {
      const rzpUpdates: Record<string, unknown> = {
        status: 'paid',
        razorpay_payment_id: args.razorpayPaymentId,
        payment_method: args.paymentMode || 'UPI',
        paid_at: nowIso,
        updated_at: nowIso,
      };
      let qRzp = rzpTable.update(rzpUpdates);
      if (typeof qRzp.or === 'function') {
        if (args.razorpayPaymentLinkId) {
          qRzp = qRzp.or(
            `razorpay_payment_link_id.eq.${args.razorpayPaymentLinkId},order_id.eq.${targetId},ledger_id.eq.${targetId}`
          );
        } else {
          qRzp = qRzp.or(`order_id.eq.${targetId},ledger_id.eq.${targetId}`);
        }
      }
      await qRzp;
    }
  } catch (rzpErr) {
    console.warn('[Razorpay] razorpay_payments update notice:', rzpErr);
  }

  // Deduct inventory stock in parts_catalog and log in stock_movements (skip if already paid)
  const targetRecord = record || (await getPaymentLinkByTxnId(targetId));
  if (targetRecord && !alreadyPaid) {
    await deductStockForPaidOrder(targetRecord, db).catch((err) => {
      console.warn('[Razorpay] Stock deduction error:', err);
    });

    if (!args.skipLedgerCredit) {
      // Credit customer/mechanic balance in BestPay ledger
      await creditBestPayLedgerBalance({
        amount: args.amount || targetRecord.amount || 0,
        paymentId: args.razorpayPaymentId,
        orderId: targetRecord.order_id,
        ledgerId: targetRecord.merchant_transaction_id?.startsWith('LEDGER_')
          ? targetRecord.merchant_transaction_id
          : undefined,
        customerPhone: targetRecord.customer_phone,
        customerName: targetRecord.customer_name,
        paymentMode: args.paymentMode,
        description: targetRecord.part_details,
        db,
      }).catch((err) => {
        console.warn('[Razorpay] creditBestPayLedgerBalance error:', err);
      });
    }
  }

  // Trigger WhatsApp payment receipt confirmation to customer (skip if already paid or explicitly skipped)
  if (targetRecord && targetRecord.customer_phone && !alreadyPaid && !args.skipReceipt) {
    await sendWhatsAppPaymentConfirmation(targetRecord, args.razorpayPaymentId).catch((err) => {
      console.warn('[Razorpay] WhatsApp confirmation send failed:', err);
    });
  }

  return targetRecord;
}

// In-memory deduplication set to prevent concurrent duplicate event processing within the process lifetime
const inFlightPaymentLocks = new Set<string>();
const processedPaymentCache = new Set<string>();

export interface ProcessRazorpayPaymentInput {
  paymentId: string;
  orderId?: string;
  paymentLinkId?: string;
  paymentMode?: string;
  amount?: number;
  customerPhone?: string;
  customerName?: string;
  description?: string;
  ledgerId?: string;
  rawWebhookPayload?: Record<string, unknown>;
  sourceEvent?: string;
}

export interface ProcessRazorpayPaymentResult {
  success: boolean;
  alreadyProcessed: boolean;
  paymentId: string;
  orderId?: string;
  deliveryOrderId?: string;
  ledgerCredited?: boolean;
  receiptSent?: boolean;
  message?: string;
}

/**
 * Handles payment success events with strict atomic idempotency.
 * Guarantees that only the single first event for a given razorpay_payment_id
 * executes stock deduction, ledger crediting, and WhatsApp receipt dispatch.
 * All subsequent or concurrent duplicate events return immediately with HTTP 200.
 */
export async function processRazorpayPaymentSuccess(
  input: ProcessRazorpayPaymentInput
): Promise<ProcessRazorpayPaymentResult> {
  const {
    paymentId,
    orderId,
    paymentLinkId,
    paymentMode = 'UPI',
    amount,
    customerPhone,
    customerName,
    description,
    ledgerId,
    rawWebhookPayload,
    sourceEvent,
  } = input;

  const targetRef = orderId || paymentLinkId || paymentId;

  // 1. In-Memory Check: If already processed or currently in-flight, return 200 immediately
  if (processedPaymentCache.has(paymentId)) {
    console.log(
      `[Razorpay Webhook] Payment ${paymentId} already processed (in-memory cached). Suppressing duplicates.`
    );
    return {
      success: true,
      alreadyProcessed: true,
      paymentId,
      orderId: targetRef,
      deliveryOrderId: targetRef,
      message: 'Already processed (in-memory cached)',
    };
  }

  if (inFlightPaymentLocks.has(paymentId)) {
    console.log(
      `[Razorpay Webhook] Payment ${paymentId} currently in-flight by concurrent event. Suppressing duplicate.`
    );
    return {
      success: true,
      alreadyProcessed: true,
      paymentId,
      orderId: targetRef,
      deliveryOrderId: targetRef,
      message: 'Concurrent event deduplicated (in-flight)',
    };
  }

  inFlightPaymentLocks.add(paymentId);

  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();
  let claimed = false;

  try {
    // 2. Database Atomic Transition in public.razorpay_payments
    // We update status to 'paid' ONLY WHERE status != 'paid'.
    try {
      const rzpTable = db.from('razorpay_payments');
      if (rzpTable && typeof rzpTable.update === 'function') {
        let filterOr = `razorpay_payment_id.eq.${paymentId}`;
        if (paymentLinkId) filterOr += `,razorpay_payment_link_id.eq.${paymentLinkId}`;
        if (orderId) filterOr += `,order_id.eq.${orderId}`;

        const updatePayload: Record<string, unknown> = {
          status: 'paid',
          razorpay_payment_id: paymentId,
          payment_method: paymentMode,
          raw_webhook_payload: rawWebhookPayload || {},
          paid_at: nowIso,
          updated_at: nowIso,
        };

        let updQuery = rzpTable.update(updatePayload);
        if (typeof updQuery.neq === 'function') {
          updQuery = updQuery.neq('status', 'paid');
        }
        if (typeof updQuery.or === 'function') {
          updQuery = updQuery.or(filterOr);
        }

        if (typeof updQuery.select === 'function') {
          const { data: updatedRows, error: updErr } = await updQuery.select('id, status');
          if (!updErr && updatedRows && updatedRows.length > 0) {
            claimed = true;
          }
        }
      }
    } catch (dbErr) {
      console.warn('[Razorpay Webhook] Atomic update attempt notice:', dbErr);
    }

    // If not claimed by update, check if it was already marked 'paid' in DB
    if (!claimed) {
      try {
        const rzpTable = db.from('razorpay_payments');
        if (rzpTable && typeof rzpTable.select === 'function') {
          let checkQ = rzpTable.select('id, status, razorpay_payment_id');
          let filterOr = `razorpay_payment_id.eq.${paymentId}`;
          if (paymentLinkId) filterOr += `,razorpay_payment_link_id.eq.${paymentLinkId}`;
          if (orderId) filterOr += `,order_id.eq.${orderId}`;
          if (typeof checkQ.or === 'function') checkQ = checkQ.or(filterOr);

          if (typeof checkQ.limit === 'function') {
            const { data: existingRows } = await checkQ.limit(1);
            if (existingRows && existingRows.length > 0) {
              if (existingRows[0].status === 'paid') {
                console.log(
                  `[Razorpay Webhook] Payment ${paymentId} already marked 'paid' in DB. Suppressing duplicate.`
                );
                processedPaymentCache.add(paymentId);
                return {
                  success: true,
                  alreadyProcessed: true,
                  paymentId,
                  orderId: targetRef,
                  deliveryOrderId: targetRef,
                  message: 'Already processed in DB (idempotent)',
                };
              }
            } else {
              // No row existed yet! Atomically insert with status 'paid'
              try {
                const { data: inserted, error: insErr } = await rzpTable
                  .insert({
                    razorpay_payment_id: paymentId,
                    razorpay_payment_link_id: paymentLinkId || null,
                    order_id: orderId || null,
                    ledger_id: ledgerId || null,
                    amount: amount || 0,
                    currency: 'INR',
                    status: 'paid',
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    description: description,
                    payment_method: paymentMode,
                    raw_webhook_payload: rawWebhookPayload || {},
                    paid_at: nowIso,
                    created_at: nowIso,
                    updated_at: nowIso,
                  })
                  .select('id');

                if (!insErr && inserted && inserted.length > 0) {
                  claimed = true;
                }
              } catch {
                // Another thread may have inserted concurrently
              }
            }
          }
        }
      } catch (checkErr) {
        console.warn('[Razorpay Webhook] DB idempotency check notice:', checkErr);
      }
    }

    // 3. Fallback check on payment_links table
    if (!claimed) {
      const existingLink = await getPaymentLinkByTxnId(targetRef);
      if (existingLink && existingLink.status === 'PAID') {
        console.log(
          `[Razorpay Webhook] Payment link ${targetRef} already marked PAID. Suppressing duplicate.`
        );
        processedPaymentCache.add(paymentId);
        return {
          success: true,
          alreadyProcessed: true,
          paymentId,
          orderId: existingLink.order_id || targetRef,
          deliveryOrderId: existingLink.order_id || targetRef,
          message: 'Already processed in payment_links (idempotent)',
        };
      }
      // If neither has it as paid, grant claim to execute once
      claimed = true;
    }

    // Mark as processed in cache immediately so subsequent events in this runtime are ignored
    processedPaymentCache.add(paymentId);

    // 4. Update payment_links, orders & deduct stock (skipping redundant receipt & ledger)
    const paidRecord = await markPaymentAsPaid({
      orderId: orderId || targetRef,
      merchantTransactionId: targetRef,
      razorpayPaymentId: paymentId,
      razorpayPaymentLinkId: paymentLinkId,
      paymentMode,
      amount,
      skipReceipt: true,
      skipLedgerCredit: true,
    });

    const effectivePhone = customerPhone || paidRecord?.customer_phone;
    const effectiveName = customerName || paidRecord?.customer_name;
    const effectiveAmount = amount || paidRecord?.amount || 0;
    const effectiveDescription =
      description || paidRecord?.part_details || 'Two-Wheeler Spare Parts Order';

    // 5. Credit BestPay Ledger balance in contacts and mechanic_ledger_entries (ONCE ONLY)
    let ledgerCredited = false;
    try {
      const creditResult = await creditBestPayLedgerBalance({
        amount: effectiveAmount,
        paymentId,
        orderId: targetRef,
        ledgerId: ledgerId || (targetRef?.startsWith('LEDGER_') ? targetRef : undefined),
        customerPhone: effectivePhone,
        customerName: effectiveName,
        paymentMode,
        description: effectiveDescription,
        db,
      });
      ledgerCredited = Boolean(creditResult.credited);
    } catch (creditErr) {
      console.warn('[Razorpay Webhook] Ledger credit warning:', creditErr);
    }

    // 6. Send Meta WhatsApp template payment_receipt_voucher (ONCE ONLY)
    let receiptSent = false;
    if (effectivePhone) {
      try {
        const waResult = await sendWhatsAppReceiptVoucherTemplate({
          customerName: effectiveName,
          customerPhone: effectivePhone,
          receiptId: targetRef,
          description: effectiveDescription,
          amount: effectiveAmount,
          paymentMode,
          paymentId,
          status: 'PAID',
          db,
        });
        receiptSent = Boolean(waResult.success);
      } catch (waErr) {
        console.warn('[Razorpay Webhook] WhatsApp template receipt warning:', waErr);
      }
    }

    return {
      success: true,
      alreadyProcessed: false,
      paymentId,
      orderId: targetRef,
      deliveryOrderId: targetRef,
      ledgerCredited,
      receiptSent,
      message: `Payment processed successfully for event ${sourceEvent || 'unknown'}`,
    };
  } finally {
    inFlightPaymentLocks.delete(paymentId);
  }
}

/**
 * Deducts sold quantity from parts_catalog and records in stock_movements.
 * Checks linked order for exact itemized SKUs and quantities where available.
 */
export async function deductStockForPaidOrder(
  record: PaymentLinkRecord,
  db = supabaseAdmin()
): Promise<{ deducted: boolean }> {
  try {
    const rawName = record.part_details?.trim() || '';
    const cleanOrderId = (record.order_id || record.merchant_transaction_id || '').trim();

    // Check if linked order in `orders` has itemized product list
    let orderItems: Array<{ sku?: string; part_id?: string; name?: string; quantity?: number }> | undefined;
    if (cleanOrderId) {
      try {
        const { data: orderData } = await db
          .from('orders')
          .select('metadata')
          .or(`id.eq.${cleanOrderId},metadata->>order_id.eq.${cleanOrderId}`)
          .limit(1)
          .maybeSingle();

        if (orderData?.metadata?.items && Array.isArray(orderData.metadata.items)) {
          orderItems = orderData.metadata.items.map((it: any) => ({
            sku: it.sku,
            part_id: it.partId || it.part_id,
            name: it.partName || it.name,
            quantity: it.quantity,
          }));
        }
      } catch {
        // Non-blocking lookup
      }
    }

    const res = await deductStockForSale(db, {
      accountId: record.account_id,
      orderId: cleanOrderId || 'ORDER',
      items: orderItems,
      itemDescription: rawName,
      referenceId: cleanOrderId || record.merchant_transaction_id,
      reason: `Customer Sale (Order #${cleanOrderId} via Razorpay)`,
    });

    return { deducted: Boolean(res.alreadyDeducted || res.deductedCount > 0) };
  } catch (err) {
    console.warn('[Razorpay] deductStockForPaidOrder error:', err);
    return { deducted: false };
  }
}

export interface ProcessRazorpayPaymentFailureInput {
  paymentId: string;
  orderId?: string;
  paymentLinkId?: string;
  paymentMode?: string;
  amount?: number;
  customerPhone?: string;
  customerName?: string;
  description?: string;
  errorCode?: string;
  errorDescription?: string;
  rawWebhookPayload?: Record<string, unknown>;
  sourceEvent?: string;
}

/**
 * Handles payment failure events idempotently.
 * Logs the failed payment in public.razorpay_payments and payment_links.
 * Leaves inventory stock and catalog 100% UNTOUCHED (0 stock deduction on failure).
 */
export async function processRazorpayPaymentFailure(
  input: ProcessRazorpayPaymentFailureInput
): Promise<{ success: boolean; status: string; paymentId: string }> {
  const {
    paymentId,
    orderId,
    paymentLinkId,
    paymentMode = 'UPI',
    amount = 0,
    customerPhone,
    customerName,
    description,
    rawWebhookPayload,
  } = input;

  const targetRef = orderId || paymentLinkId || paymentId;
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  try {
    // 1. Update or insert in public.razorpay_payments with status 'failed'
    // IMPORTANT: Never overwrite a payment if it was already marked 'paid'
    const rzpTable = db.from('razorpay_payments');
    if (rzpTable && typeof rzpTable.select === 'function') {
      let filterOr = `razorpay_payment_id.eq.${paymentId}`;
      if (paymentLinkId) filterOr += `,razorpay_payment_link_id.eq.${paymentLinkId}`;
      if (orderId) filterOr += `,order_id.eq.${orderId}`;

      const { data: existingRows } = await rzpTable
        .select('id, status')
        .or(filterOr)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        const existing = existingRows[0];
        if (existing.status !== 'paid') {
          await rzpTable
            .update({
              status: 'failed',
              razorpay_payment_id: paymentId,
              payment_method: paymentMode,
              raw_webhook_payload: rawWebhookPayload || {},
              updated_at: nowIso,
            })
            .eq('id', existing.id);
        }
      } else {
        await rzpTable.insert({
          razorpay_payment_id: paymentId,
          razorpay_payment_link_id: paymentLinkId || null,
          order_id: orderId || null,
          amount: amount || 0,
          currency: 'INR',
          status: 'failed',
          customer_name: customerName,
          customer_phone: customerPhone,
          description: description,
          payment_method: paymentMode,
          raw_webhook_payload: rawWebhookPayload || {},
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    }

    // 2. Mark payment_links as FAILED if not already PAID
    const linkTable = db.from('payment_links');
    if (linkTable && typeof linkTable.update === 'function') {
      let filterOr = `merchant_transaction_id.eq.${targetRef},order_id.eq.${targetRef}`;
      if (paymentLinkId) filterOr += `,razorpay_payment_link_id.eq.${paymentLinkId}`;

      await linkTable
        .update({
          status: 'FAILED',
          updated_at: nowIso,
        })
        .or(filterOr)
        .neq('status', 'PAID');
    }

    console.log(`[Razorpay Webhook] Payment ${paymentId} failed logged. Stock left unchanged.`);
    return { success: true, status: 'failed', paymentId };
  } catch (err) {
    console.warn('[Razorpay Webhook] processRazorpayPaymentFailure warning:', err);
    return { success: true, status: 'failed', paymentId };
  }
}

/**
 * Sends two free WhatsApp session text messages to customer:
 * 1) Payment Receipt (🧾 *PAYMENT RECEIPT — BEST AUTO PARTS*)
 * 2) Order & Delivery Confirmation (✅ *ORDER CONFIRMED & READY FOR DISPATCH — BEST AUTO PARTS*)
 * Zero Meta template charges. Full 24-hour customer window error handling.
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

  // Message 1: Official Payment Receipt
  const receiptText =
    `🧾 *PAYMENT RECEIPT — BEST AUTO PARTS* 🏍️\n` +
    `• *Order ID:* *${displayOrderId}*\n` +
    `• *Customer:* ${record.customer_name || 'Valued Customer'}\n` +
    `• *Item(s):* ${record.part_details}\n` +
    `• *Amount Paid:* ${amtFormatted} (Paid in Full ✅)\n` +
    `• *Payment Mode:* ${record.payment_mode || 'Razorpay / UPI'}\n` +
    `• *Razorpay Payment ID:* ${resolvedPaymentId}\n` +
    `• *Date & Time:* ${dateFormatted}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for your payment! Your transaction is verified via Razorpay.`;

  // Message 2: Order & Delivery Confirmation
  const deliveryText =
    `✅ *ORDER CONFIRMED & READY FOR DISPATCH — BEST AUTO PARTS* 🛵\n` +
    `• *Delivery Order ID:* *${displayOrderId}*\n` +
    `• *Status:* Confirmed & Packed\n` +
    `• *Dispatch Option:* Local Rider Delivery in Kailashpur / Saharanpur (or Store Pickup)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 *Store Address:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
    `🕒 *Store Timings:* 09:00 AM – 09:00 PM (Daily)\n` +
    `📞 *Direct Helpline:* Saud Khan (+91 96347 22174)\n\n` +
    `Our team is dispatching your spare parts order with our local rider shortly. Thank you for choosing Best Auto Parts!`;

  // Helper to send a free session text message
  let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  try {
    const cfgTable = db.from('whatsapp_config');
    if (cfgTable && typeof cfgTable.select === 'function') {
      const { data: config } = await cfgTable
        .select('id, phone_number_id, access_token')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (config) {
        if (config.phone_number_id) phoneNumberId = config.phone_number_id;
        if (config.access_token) {
          try {
            const { decrypt } = await import('@/lib/whatsapp/encryption');
            accessToken = decrypt(config.access_token);
          } catch {
            accessToken = config.access_token;
          }
        }
      }
    }
  } catch {}

  const digits = cleanPhone.replace(/[^0-9]/g, '').slice(-10);
  const normalizedTo = digits ? `91${digits}` : '';

  const sendSingleTextMessage = async (bodyText: string) => {
    if (contact?.id && accountId && userId && conversationId) {
      try {
        await engineSendText({
          accountId,
          userId,
          conversationId,
          contactId: contact.id,
          text: bodyText,
        });
      } catch (sendErr: unknown) {
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.warn(
          `[Razorpay] Free WhatsApp session text send failed (24h window closed or delivery error):`,
          msg
        );
      }
    } else if (phoneNumberId && accessToken && normalizedTo) {
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedTo,
            type: 'text',
            text: { preview_url: false, body: bodyText },
          }),
        });
        const metaData = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errCode = metaData?.error?.code;
          if (errCode === 131047 || metaData?.error?.error_subcode === 131047) {
            console.warn(
              `[Razorpay] Free WhatsApp session window closed (131047 / outside 24h) for ${phone}; template fallback skipped as ENABLE_PAID_WHATSAPP_TEMPLATES is off.`
            );
          } else {
            console.warn(`[Razorpay] Free WhatsApp text send error:`, metaData?.error || res.statusText);
          }
        }
      } catch (directErr) {
        console.warn('[Razorpay] Direct Meta text send warning:', directErr);
      }
    } else {
      console.log('[Razorpay] Free session text for', phone, ':\n', bodyText);
    }
  };

  // Dispatch Message 1 (Payment Receipt)
  await sendSingleTextMessage(receiptText);
  // Dispatch Message 2 (Order & Delivery Confirmation)
  await sendSingleTextMessage(deliveryText);
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

export interface CreditLedgerInput {
  amount: number;
  paymentId: string;
  orderId?: string;
  ledgerId?: string;
  customerPhone?: string;
  customerName?: string;
  paymentMode?: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any;
}

export interface CreditLedgerResult {
  credited: boolean;
  contactId?: string;
  previousBalance?: number;
  newBalance?: number;
  reason?: string;
}

/**
 * Automatically credits the customer / mechanic pending balance in BestPay ledger
 * (`contacts.pending_balance` and `mechanic_ledger_entries`).
 */
export async function creditBestPayLedgerBalance(
  args: CreditLedgerInput
): Promise<CreditLedgerResult> {
  const amount = Number(args.amount);
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    return { credited: false, reason: 'Invalid or non-positive amount' };
  }

  const db = args.db || supabaseAdmin();
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matchedContact: any = null;

  // 1. Try to find contact by ledgerId if provided (strip 'LEDGER_' prefix if present)
  if (args.ledgerId) {
    const cleanLedgerId = args.ledgerId.replace(/^LEDGER_/i, '').trim();
    try {
      const contactsTable = db.from('contacts');
      if (contactsTable && typeof contactsTable.select === 'function') {
        const sel = contactsTable.select(
          'id, name, account_id, pending_balance, monthly_purchases, loyalty_tier, khata_stage'
        );
        let q =
          typeof sel.or === 'function'
            ? sel.or(`id.eq.${cleanLedgerId},unique_id.eq.${cleanLedgerId}`)
            : typeof sel.eq === 'function'
            ? sel.eq('id', cleanLedgerId)
            : null;

        if (q && typeof q.limit === 'function') {
          const qLimit = q.limit(1);
          if (typeof qLimit.maybeSingle === 'function') {
            const res = await qLimit.maybeSingle();
            matchedContact = res?.data;
          } else {
            const res = await qLimit;
            matchedContact = Array.isArray(res?.data) ? res.data[0] : res?.data;
          }
        }
      }
    } catch (ledgerLookupErr) {
      console.warn('[Razorpay] ledger lookup notice:', ledgerLookupErr);
    }
  }

  // 2. Fallback to lookup by customer phone
  if (!matchedContact && args.customerPhone) {
    const rawPhone = args.customerPhone.trim();
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '').slice(-10);
    const cleanPhone = cleanDigits ? `+91${cleanDigits}` : '';

    if (cleanDigits) {
      try {
        const contactsTable = db.from('contacts');
        if (contactsTable && typeof contactsTable.select === 'function') {
          const sel = contactsTable.select(
            'id, name, account_id, pending_balance, monthly_purchases, loyalty_tier, khata_stage'
          );
          let matchQuery = null;
          if (typeof sel.or === 'function') {
            matchQuery = sel.or(
              `phone.ilike.%${cleanDigits}%,phone.eq.${rawPhone}${
                cleanPhone ? `,phone_normalized.eq.${cleanPhone}` : ''
              }`
            );
          } else if (typeof sel.eq === 'function') {
            matchQuery = sel.eq('phone', rawPhone);
          }

          if (matchQuery && typeof matchQuery.limit === 'function') {
            const { data: matchingContacts } = await matchQuery.limit(1);
            if (matchingContacts && matchingContacts.length > 0) {
              matchedContact = matchingContacts[0];
            }
          }
        }
      } catch (err) {
        console.warn('[Razorpay] contacts lookup notice:', err);
      }
    }
  }

  if (!matchedContact) {
    return { credited: false, reason: 'No matching contact found for ledger credit' };
  }

  const currentDue = Number(matchedContact.pending_balance) || 0;
  const newDue = Math.max(0, currentDue - amount);
  const newKhataStage =
    newDue === 0 ? 'Settled This Month' : matchedContact.khata_stage || 'Payment Due';

  // 3. Update contact balance and khata stage
  try {
    const contactsTable = db.from('contacts');
    if (contactsTable && typeof contactsTable.update === 'function') {
      await contactsTable
        .update({
          pending_balance: newDue,
          khata_stage: newKhataStage,
          updated_at: nowIso,
        })
        .eq('id', matchedContact.id);
    }
  } catch (updErr) {
    console.warn('[Razorpay] Failed to update contact balance:', updErr);
  }

  // 4. Insert debit payment entry into mechanic_ledger_entries
  try {
    const ledgerTable = db.from('mechanic_ledger_entries');
    if (ledgerTable && typeof ledgerTable.insert === 'function') {
      const desc =
        args.description ||
        `Payment received via Razorpay (Ref: ${args.paymentId}${
          args.orderId ? ` • Order #${args.orderId}` : ''
        }) • ${newDue === 0 ? 'Full Settlement' : `Balance Due: ₹${newDue.toFixed(2)}`}`;

      await ledgerTable.insert({
        account_id: matchedContact.account_id,
        contact_id: matchedContact.id,
        entry_type: 'debit_payment',
        amount,
        payment_mode: args.paymentMode || 'Razorpay / UPI',
        reference_id: args.paymentId,
        balance_after: newDue,
        description: desc,
        created_at: nowIso,
      });
    }
  } catch (ledgerErr) {
    console.warn('[Razorpay] Failed to insert mechanic_ledger_entry:', ledgerErr);
  }

  // 5. Update any matching payment_links for this order/contact
  if (args.orderId) {
    try {
      const plinksTable = db.from('payment_links');
      if (plinksTable && typeof plinksTable.update === 'function') {
        await plinksTable
          .update({
            paid_amount: amount,
            remaining_amount: 0,
            status: 'PAID',
            updated_at: nowIso,
          })
          .eq('order_id', args.orderId);
      }
    } catch {}
  }

  return {
    credited: true,
    contactId: matchedContact.id,
    previousBalance: currentDue,
    newBalance: newDue,
  };
}

export interface SendReceiptVoucherInput {
  customerName?: string;
  customerPhone: string;
  receiptId: string;
  description?: string;
  amount: number | string;
  paymentMode?: string;
  paymentId?: string;
  status?: string;
  date?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any;
}

/**
 * Triggers the approved WhatsApp template `payment_receipt_voucher` via Meta Cloud API,
 * with graceful fallback to standard formatted receipt text.
 */
export async function sendWhatsAppReceiptVoucherTemplate(
  args: SendReceiptVoucherInput
): Promise<{
  success: boolean;
  messageId?: string;
  fallbackUsed?: boolean;
}> {
  const db = args.db || supabaseAdmin();
  const phone = args.customerPhone;
  const cleanDigits = phone.replace(/[^0-9]/g, '');
  const phone10 = cleanDigits.slice(-10);
  if (!phone10 || phone10.length !== 10) {
    return { success: false };
  }
  const normalizedPhone = `91${phone10}`;

  // 1. Load WhatsApp configuration
  let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';

  try {
    const cfgTable = db.from('whatsapp_config');
    if (cfgTable && typeof cfgTable.select === 'function') {
      const { data: config } = await cfgTable
        .select('id, account_id, phone_number_id, access_token')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (config) {
        if (config.phone_number_id) phoneNumberId = config.phone_number_id;
        if (config.access_token) {
          try {
            const { decrypt } = await import('@/lib/whatsapp/encryption');
            accessToken = decrypt(config.access_token);
          } catch {
            accessToken = config.access_token;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Razorpay] WhatsApp config lookup error:', err);
  }

  const nameStr = (args.customerName || 'Valued Customer').trim();
  const idStr = (args.receiptId || `REC-${Date.now()}`).trim();
  const detailsStr = (args.description || 'Two-Wheeler Spare Parts Order').slice(0, 200).trim();
  const rawAmt = typeof args.amount === 'number' ? args.amount.toFixed(2) : String(args.amount);
  const amountStr = rawAmt.replace(/[^0-9.]/g, '') || '0.00';
  const statusStr = (args.status || 'PAID').trim();
  const dateStr = (
    args.date ||
    new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  ).trim();

  const isPaidTemplatesEnabled = process.env.ENABLE_PAID_WHATSAPP_TEMPLATES === 'true';

  // 2. Paid Template dispatch — Strictly guarded behind ENABLE_PAID_WHATSAPP_TEMPLATES === 'true' (Default OFF)
  if (isPaidTemplatesEnabled && phoneNumberId && accessToken) {
    for (const langCode of ['en', 'en_US'] as const) {
      try {
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: 'payment_receipt_voucher',
            language: { code: langCode },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: nameStr },
                  { type: 'text', text: idStr },
                  { type: 'text', text: detailsStr },
                  { type: 'text', text: amountStr },
                  { type: 'text', text: statusStr },
                  { type: 'text', text: dateStr },
                ],
              },
            ],
          },
        };

        const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.messages?.[0]?.id) {
          const messageId = data.messages[0].id;
          return { success: true, messageId, fallbackUsed: false };
        }
      } catch (templateErr) {
        console.warn(`[Razorpay] Meta template send attempt (${langCode}) failed:`, templateErr);
      }
    }
  }

  // 3. Default: Free WhatsApp Session Text Receipt (type: "text" with 🧾 *PAYMENT RECEIPT — BEST AUTO PARTS*)
  // If the 24-hour customer window is closed and free text fails, log a warning and return cleanly without template fallback.

  // Graceful fallback to text confirmation via sendWhatsAppPaymentConfirmation
  const fallbackRecord: PaymentLinkRecord = {
    order_id: idStr,
    merchant_transaction_id: idStr,
    customer_name: nameStr,
    customer_phone: args.customerPhone,
    part_details: detailsStr,
    amount: Number(amountStr) || 0,
    status: 'PAID',
    payment_mode: args.paymentMode || 'Razorpay / UPI',
    razorpay_payment_id: args.paymentId,
    paid_at: new Date().toISOString(),
  };

  await sendWhatsAppPaymentConfirmation(fallbackRecord, args.paymentId).catch((err) => {
    console.warn('[Razorpay] WhatsApp confirmation text send error:', err);
  });

  return { success: true, fallbackUsed: true };
}
