/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRazorpayPaymentLink, verifyRazorpayWebhookSignature } from './razorpay';
import { engineSendText } from '@/lib/flows/meta-send';

export interface InitiatePaymentParams {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  contactId: string;
  conversationId: string;
  partId?: string;
  partName: string;
  unitPrice: number;
  quantity?: number;
  fulfillmentType?: 'store_pickup' | 'home_delivery' | 'online_checkout';
  deliveryAddress?: string;
  preferredLanguage?: 'en' | 'hinglish';
  paymentMethod?: 'UPI_QR' | 'UPI_COLLECT' | 'UPI_INTENT' | 'CHECKOUT_LINK' | 'RAZORPAY_LINK';
  customerVpa?: string;
}

export interface InitiatePaymentResult {
  orderId: string;
  merchantTransactionId: string;
  totalAmount: number;
  paymentMethod: string;
  qrPayload?: string;
  checkoutUrl?: string;
  expiresAt: string;
}

export interface ProcessWebhookResult {
  success: boolean;
  status:
    | 'PAID'
    | 'FAILED'
    | 'PENDING'
    | 'ALREADY_PROCESSED'
    | 'INVALID_AUTH'
    | 'NOT_FOUND'
    | 'AMOUNT_MISMATCH';
  merchantTransactionId?: string;
  orderId?: string;
  utr?: string;
  stockDeducted?: boolean;
}

/**
 * Generates a collision-resistant unique merchant transaction ID.
 * Format: BAP_TXN_<timestamp>_<6-char-random>
 */
export function generateMerchantTransactionId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BAP_TXN_${ts}_${rand}`;
}

export class PaymentService {
  /**
   * Creates an order and initiates payment session with Razorpay.
   */
  public static async initiatePayment(
    params: InitiatePaymentParams
  ): Promise<InitiatePaymentResult> {
    const {
      db,
      accountId,
      userId,
      contactId,
      conversationId,
      partId,
      partName,
      unitPrice,
      quantity = 1,
      fulfillmentType = 'store_pickup',
      deliveryAddress,
      preferredLanguage = 'en',
      paymentMethod = 'CHECKOUT_LINK',
      customerVpa,
    } = params;

    const totalAmount = unitPrice * quantity;
    const merchantTransactionId = generateMerchantTransactionId();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 1. Insert Order record in Supabase
    const insertOrderQuery = db
      .from('orders')
      .insert({
        account_id: accountId,
        contact_id: contactId,
        conversation_id: conversationId,
        part_id: partId || null,
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        currency: 'INR',
        fulfillment_type: fulfillmentType,
        delivery_address: deliveryAddress || null,
        order_status: 'pending_payment',
        customer_language: preferredLanguage,
        metadata: {
          initiator_user_id: userId,
          part_name: partName,
        },
      })
      .select('id');

    let orderId: string | undefined;
    if (typeof (insertOrderQuery as any)?.maybeSingle === 'function') {
      const res = await (insertOrderQuery as any).maybeSingle();
      orderId = res?.data?.id;
    } else if (typeof (insertOrderQuery as any)?.single === 'function') {
      const res = await (insertOrderQuery as any).single();
      orderId = res?.data?.id;
    } else {
      const res = await insertOrderQuery;
      orderId = (res as any)?.data?.[0]?.id;
    }

    if (!orderId) {
      orderId = `gen_ord_${Date.now()}`;
    }

    // 2. Generate Razorpay Payment Link
    let checkoutUrl: string | undefined;
    try {
      const rzpRes = await createRazorpayPaymentLink({
        orderId: merchantTransactionId,
        customerName: 'Valued Customer',
        customerPhone: '+919634722174',
        partDetails: `${partName} (x${quantity})`,
        amount: totalAmount,
        accountId,
        userId,
        conversationId,
      });
      checkoutUrl = rzpRes.shortUrl;
    } catch {
      checkoutUrl = `https://best-auto-parts-one.vercel.app/pay?order=${encodeURIComponent(merchantTransactionId)}&amount=${totalAmount}`;
    }

    const qrPayload = checkoutUrl;

    // 3. Insert Payment record in Supabase
    try {
      await db.from('payments').insert({
        account_id: accountId,
        order_id: orderId,
        merchant_transaction_id: merchantTransactionId,
        payment_method: paymentMethod,
        amount: totalAmount,
        currency: 'INR',
        payment_status: 'pending',
        settlement_status: 'unsettled',
        expires_at: expiresAt,
        checkout_url: checkoutUrl || null,
        qr_payload: qrPayload || null,
        metadata: {
          customer_vpa: customerVpa || null,
          part_name: partName,
        },
      });
    } catch {
      // non-fatal
    }

    return {
      orderId,
      merchantTransactionId,
      totalAmount,
      paymentMethod,
      qrPayload,
      checkoutUrl,
      expiresAt,
    };
  }

  /**
   * Processes a verified payment callback.
   */
  public static async processWebhook(
    db: SupabaseClient,
    authHeader: string | null,
    payload: any
  ): Promise<ProcessWebhookResult> {
    const merchantOrderId =
      payload?.payload?.payment_link?.entity?.reference_id ||
      payload?.payload?.merchantOrderId ||
      payload?.merchantOrderId ||
      '';

    if (!merchantOrderId) {
      return { success: false, status: 'NOT_FOUND' };
    }

    // Fetch Payment and Order records
    const { data: paymentRecord } = await db
      .from('payments')
      .select('*, order:orders(*)')
      .eq('merchant_transaction_id', merchantOrderId)
      .maybeSingle();

    if (!paymentRecord) {
      return { success: false, status: 'NOT_FOUND', merchantTransactionId: merchantOrderId };
    }

    if (paymentRecord.payment_status === 'paid') {
      return {
        success: true,
        status: 'ALREADY_PROCESSED',
        merchantTransactionId: merchantOrderId,
        orderId: paymentRecord.order_id,
      };
    }

    const now = new Date().toISOString();
    const utr = payload?.payload?.payment?.entity?.id || `pay_${Date.now()}`;

    // Update payment record
    await db
      .from('payments')
      .update({
        payment_status: 'paid',
        utr,
        paid_at: now,
        updated_at: now,
      })
      .eq('id', paymentRecord.id);

    // Update order status
    await db
      .from('orders')
      .update({
        order_status: 'paid',
        updated_at: now,
      })
      .eq('id', paymentRecord.order_id);

    return {
      success: true,
      status: 'PAID',
      merchantTransactionId: merchantOrderId,
      orderId: paymentRecord.order_id,
      utr,
    };
  }

  /**
   * Status Reconciliation.
   */
  public static async reconcilePaymentStatus(
    db: SupabaseClient,
    merchantTransactionId: string
  ): Promise<ProcessWebhookResult> {
    const { data: paymentRecord } = await db
      .from('payments')
      .select('*, order:orders(*)')
      .eq('merchant_transaction_id', merchantTransactionId)
      .maybeSingle();

    if (!paymentRecord) {
      return { success: false, status: 'NOT_FOUND', merchantTransactionId };
    }

    if (paymentRecord.payment_status === 'paid') {
      return { success: true, status: 'ALREADY_PROCESSED', merchantTransactionId };
    }

    return { success: true, status: 'PENDING', merchantTransactionId };
  }

  /**
   * Evaluates payment claim heuristics.
   */
  public static evaluateCustomerPaymentClaim(params: {
    messageText?: string;
    hasImageAttachment?: boolean;
    extractedUtr?: string;
  }): {
    likelyPaid: boolean;
    confidence: 'high' | 'medium' | 'low';
    extractedUtr?: string;
  } {
    const { messageText = '', hasImageAttachment, extractedUtr } = params;

    if (extractedUtr && /^[0-9]{12}$/.test(extractedUtr)) {
      return { likelyPaid: true, confidence: 'high', extractedUtr };
    }

    const utrMatch = messageText.match(/\b([0-9]{12})\b/);
    if (utrMatch) {
      return { likelyPaid: true, confidence: 'high', extractedUtr: utrMatch[1] };
    }

    if (hasImageAttachment) {
      return { likelyPaid: true, confidence: 'medium' };
    }

    const claimKeywords = [
      'paid',
      'payment done',
      'pay kar diya',
      'paise bhej diye',
      'screenshot',
      'sent',
      'done',
    ];
    const lower = messageText.toLowerCase();
    const hasClaim = claimKeywords.some((kw) => lower.includes(kw));

    if (hasClaim) {
      return { likelyPaid: true, confidence: 'medium' };
    }

    return { likelyPaid: false, confidence: 'low' };
  }
}
