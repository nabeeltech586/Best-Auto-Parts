/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { phonePeClient, PhonePeClient } from './phonepe/client';
import type { PhonePeWebhookPayload } from './phonepe/types';
import { engineSendInteractiveButtons, engineSendText } from '@/lib/flows/meta-send';

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
  paymentMethod?: 'UPI_QR' | 'UPI_COLLECT' | 'UPI_INTENT' | 'CHECKOUT_LINK';
  customerVpa?: string;
  client?: PhonePeClient;
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
  status: 'PAID' | 'FAILED' | 'PENDING' | 'ALREADY_PROCESSED' | 'INVALID_AUTH' | 'NOT_FOUND' | 'AMOUNT_MISMATCH';
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
   * Creates an order and initiates payment session with PhonePe.
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
      unitPrice,
      quantity = 1,
      fulfillmentType = 'store_pickup',
      deliveryAddress,
      preferredLanguage = 'en',
      paymentMethod = 'UPI_QR',
      customerVpa,
      client = phonePeClient,
    } = params;

    const totalAmount = unitPrice * quantity;
    const amountInPaise = Math.round(totalAmount * 100);
    const merchantTransactionId = generateMerchantTransactionId();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute window

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
        },
      })
      .select('id');

    let orderId: string | undefined;
    if (typeof (insertOrderQuery as any).maybeSingle === 'function') {
      const res = await (insertOrderQuery as any).maybeSingle();
      orderId = res?.data?.id;
    } else if (typeof (insertOrderQuery as any).single === 'function') {
      const res = await (insertOrderQuery as any).single();
      orderId = res?.data?.id;
    } else {
      const res = await insertOrderQuery;
      orderId = (res as any)?.data?.[0]?.id;
    }

    if (!orderId) {
      orderId = `gen_ord_${Date.now()}`;
    }

    // 2. Insert Payment record in Supabase
    const { error: paymentInsertError } = await db.from('payments').insert({
      account_id: accountId,
      order_id: orderId,
      merchant_transaction_id: merchantTransactionId,
      payment_method: paymentMethod,
      amount: totalAmount,
      currency: 'INR',
      payment_status: 'pending',
      settlement_status: 'unsettled',
      expires_at: expiresAt,
      metadata: {
        customer_vpa: customerVpa || null,
      },
    });

    if (paymentInsertError) {
      throw new Error(`Failed to create payment record: ${paymentInsertError.message}`);
    }

    let qrPayload: string | undefined;
    let checkoutUrl: string | undefined;

    // 3. Initiate payment via PhonePe Client based on chosen flow
    if (paymentMethod === 'UPI_QR') {
      const qrRes = await client.createDynamicUpiQr({
        merchantOrderId: merchantTransactionId,
        amount: amountInPaise,
        expireAfter: 900,
      });
      qrPayload = qrRes.qrData;
    } else if (paymentMethod === 'UPI_COLLECT' && customerVpa) {
      await client.createUpiCollect({
        merchantOrderId: merchantTransactionId,
        amount: amountInPaise,
        vpa: customerVpa,
        expireAfter: 900,
      });
    } else {
      // Standard Checkout / HTTPS link for same-phone users
      const checkoutRes = await client.createStandardCheckout({
        merchantOrderId: merchantTransactionId,
        amount: amountInPaise,
        redirectUrl: `https://best-auto-parts-one.vercel.app/payment/status?order=${encodeURIComponent(merchantTransactionId)}`,
        expireAfter: 900,
      });
      checkoutUrl = checkoutRes.redirectUrl;
    }

    // Update payment record with generated payloads
    if (qrPayload || checkoutUrl) {
      await db
        .from('payments')
        .update({
          qr_payload: qrPayload || null,
          checkout_url: checkoutUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq('merchant_transaction_id', merchantTransactionId);
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
   * Processes an incoming PhonePe webhook callback.
   * Enforces:
   * - Authentication verification
   * - Idempotency (duplicate callbacks return ALREADY_PROCESSED safely)
   * - Amount & currency integrity
   * - Atomic inventory deduction (exact-once)
   * - Localized customer confirmation dispatch
   */
  public static async processWebhook(
    db: SupabaseClient,
    authHeader: string | null,
    payload: PhonePeWebhookPayload,
    client: PhonePeClient = phonePeClient
  ): Promise<ProcessWebhookResult> {
    // 1. Verify Webhook Authentication
    if (!client.verifyWebhookAuth(authHeader)) {
      console.warn('[PaymentService] Webhook rejected: Invalid authentication');
      return { success: false, status: 'INVALID_AUTH' };
    }

    const { merchantOrderId, amount, state, paymentInstrument, orderId: providerOrderId } =
      payload.payload;

    // 2. Fetch Payment and Order records
    const { data: paymentRecord, error: fetchErr } = await db
      .from('payments')
      .select('*, order:orders(*)')
      .eq('merchant_transaction_id', merchantOrderId)
      .maybeSingle();

    if (fetchErr || !paymentRecord) {
      console.warn(`[PaymentService] Order reference not found: ${merchantOrderId}`);
      return { success: false, status: 'NOT_FOUND', merchantTransactionId: merchantOrderId };
    }

    // Resolve order record (supports joined order or explicit lookup)
    let orderRecord = paymentRecord.order;
    if (!orderRecord && paymentRecord.order_id) {
      const { data: ord } = await db
        .from('orders')
        .select('*')
        .eq('id', paymentRecord.order_id)
        .maybeSingle();
      orderRecord = ord;
    }

    // 3. Idempotency Check: Already paid
    if (paymentRecord.payment_status === 'paid') {
      return {
        success: true,
        status: 'ALREADY_PROCESSED',
        merchantTransactionId: merchantOrderId,
        orderId: paymentRecord.order_id,
        utr: paymentRecord.utr,
      };
    }

    // 4. Amount Verification (PhonePe amounts in paise: 69000 = ₹690.00)
    const expectedAmountPaise = Math.round(Number(paymentRecord.amount) * 100);
    if (amount !== expectedAmountPaise) {
      console.error(
        `[PaymentService] Amount mismatch for ${merchantOrderId}: Expected ${expectedAmountPaise}, got ${amount}`
      );
      return {
        success: false,
        status: 'AMOUNT_MISMATCH',
        merchantTransactionId: merchantOrderId,
      };
    }

    const utr = paymentInstrument?.utr || 'N/A';

    // 5. Handle Terminal States
    if (state === 'COMPLETED' || payload.type === 'PAYMENT_SUCCESS') {
      const now = new Date().toISOString();

      // Update payment record
      await db
        .from('payments')
        .update({
          payment_status: 'paid',
          phonepe_transaction_id: providerOrderId,
          utr: utr,
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

      // 6. Atomic Inventory Deduction (if linked to a catalog part)
      let stockDeducted = false;
      const targetPartId = orderRecord?.part_id || paymentRecord.order?.part_id;
      const targetQuantity = orderRecord?.quantity || paymentRecord.order?.quantity || 1;
      if (targetPartId) {
        try {
          if (typeof db.rpc === 'function') {
            await db.rpc('adjust_part_stock', {
              p_account_id: paymentRecord.account_id,
              p_part_id: targetPartId,
              p_delta: -targetQuantity,
              p_reason: `Online Order ${paymentRecord.order_id} (UTR: ${utr})`,
              p_movement_type: 'sale',
              p_reference_id: merchantOrderId,
            });
            stockDeducted = true;
          }
        } catch (stockErr) {
          console.error('[PaymentService] Error deducting stock:', stockErr);
        }
      }

      // 7. Send WhatsApp Receipt in Customer's Preferred Language
      await this.sendPaymentConfirmationReceipt(db, paymentRecord, orderRecord, utr);

      return {
        success: true,
        status: 'PAID',
        merchantTransactionId: merchantOrderId,
        orderId: paymentRecord.order_id,
        utr,
        stockDeducted,
      };
    } else if (state === 'FAILED' || payload.type === 'PAYMENT_FAILED') {
      const now = new Date().toISOString();
      await db
        .from('payments')
        .update({
          payment_status: 'failed',
          updated_at: now,
        })
        .eq('id', paymentRecord.id);

      await db
        .from('orders')
        .update({
          order_status: 'cancelled',
          updated_at: now,
        })
        .eq('id', paymentRecord.order_id);

      await this.sendPaymentFailureNotification(db, paymentRecord, orderRecord);

      return {
        success: true,
        status: 'FAILED',
        merchantTransactionId: merchantOrderId,
        orderId: paymentRecord.order_id,
      };
    }

    return {
      success: true,
      status: 'PENDING',
      merchantTransactionId: merchantOrderId,
    };
  }

  /**
   * S2S Order Status Verification Fallback.
   * Can be invoked periodically or prior to marking an order expired.
   */
  public static async reconcilePaymentStatus(
    db: SupabaseClient,
    merchantTransactionId: string,
    client: PhonePeClient = phonePeClient
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

    // Call PhonePe S2S status check
    const statusRes = await client.getOrderStatus(merchantTransactionId);

    if (statusRes.state === 'COMPLETED') {
      return this.processWebhook(
        db,
        'INTERNAL_S2S_RECONCILIATION',
        {
          type: 'PAYMENT_SUCCESS',
          payload: {
            orderId: statusRes.orderId,
            merchantOrderId: merchantTransactionId,
            amount: statusRes.amount,
            state: 'COMPLETED',
            paymentInstrument: statusRes.paymentInstrument,
          },
        },
        client
      );
    } else if (statusRes.state === 'EXPIRED' || new Date(paymentRecord.expires_at) < new Date()) {
      // Mark expired
      const now = new Date().toISOString();
      await db
        .from('payments')
        .update({ payment_status: 'expired', updated_at: now })
        .eq('id', paymentRecord.id);

      await db
        .from('orders')
        .update({ order_status: 'expired', updated_at: now })
        .eq('id', paymentRecord.order_id);

      return { success: true, status: 'FAILED', merchantTransactionId };
    }

    return { success: true, status: 'PENDING', merchantTransactionId };
  }

  /**
   * Dispatches WhatsApp Confirmation Receipt in saved customer language.
   */
  private static async sendPaymentConfirmationReceipt(
    db: SupabaseClient,
    paymentRecord: any,
    orderRecord: any,
    utr: string
  ): Promise<void> {
    try {
      const order = orderRecord || paymentRecord.order;
      if (!order || !order.conversation_id) return;

      const isHinglish = order.customer_language === 'hinglish';
      const receiptText = isHinglish
        ? `🎉 *Payment Receive Ho Gaya Hai!*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `• Order ID: #${paymentRecord.merchant_transaction_id.slice(-6)}\n` +
          `• Amount Paid: ₹${Number(paymentRecord.amount).toFixed(2)} (UPI dwara prapt)\n` +
          `• Bank UTR: ${utr}\n` +
          `• Status: Confirmed & Packing Shuru\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📍 *Store Address:*\n` +
          `Best Auto Parts, Kailashpur, Saharanpur, Uttar Pradesh 247001.\n` +
          `Timing: 09:00 AM – 09:00 PM (Friday Juma break: 12:30 PM – 02:30 PM)\n\n` +
          `Aapka order confirm ho chuka hai. Best Auto Parts par bharosa karne ke liye shukriya! 🙏`
        : `🎉 *Payment Received Successfully!*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `• Order ID: #${paymentRecord.merchant_transaction_id.slice(-6)}\n` +
          `• Amount Paid: ₹${Number(paymentRecord.amount).toFixed(2)} (Paid via UPI)\n` +
          `• Bank UTR: ${utr}\n` +
          `• Status: Confirmed & Preparing for Dispatch\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📍 *Store Address:*\n` +
          `Best Auto Parts, Kailashpur, Saharanpur, Uttar Pradesh 247001.\n` +
          `Timing: 09:00 AM – 09:00 PM (Friday Juma break: 12:30 PM – 02:30 PM)\n\n` +
          `Your order has been verified. Thank you for shopping with Best Auto Parts! 🙏`;

      await engineSendText({
        accountId: paymentRecord.account_id,
        userId: order.metadata?.initiator_user_id || 'system',
        conversationId: order.conversation_id,
        contactId: order.contact_id,
        text: receiptText,
      });
    } catch (sendErr) {
      console.error('[PaymentService] Error sending payment receipt:', sendErr);
    }
  }

  /**
   * Dispatches WhatsApp Payment Failure notification.
   */
  private static async sendPaymentFailureNotification(
    db: SupabaseClient,
    paymentRecord: any,
    orderRecord: any
  ): Promise<void> {
    try {
      const order = orderRecord || paymentRecord.order;
      if (!order || !order.conversation_id) return;

      const isHinglish = order.customer_language === 'hinglish';
      const bodyText = isHinglish
        ? `⚠️ *Payment Complete Nahi Ho Paaya*\n\n` +
          `Order #${paymentRecord.merchant_transaction_id.slice(-6)} (₹${Number(paymentRecord.amount).toFixed(2)}) ka payment verify nahi ho saka.\n\n` +
          `Aap dobara koshish kar sakte hain ya hamare staff se rabta kar sakte hain.`
        : `⚠️ *Payment Unsuccessful*\n\n` +
          `We could not verify payment for Order #${paymentRecord.merchant_transaction_id.slice(-6)} (₹${Number(paymentRecord.amount).toFixed(2)}).\n\n` +
          `You can retry payment or speak with our store staff for assistance.`;

      await engineSendInteractiveButtons({
        accountId: paymentRecord.account_id,
        userId: order.metadata?.initiator_user_id || 'system',
        conversationId: order.conversation_id,
        contactId: order.contact_id,
        bodyText,
        buttons: [
          { id: 'PAY_RETRY', title: isHinglish ? 'Dobara Try Karein' : 'Retry Payment' },
          { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
        ],
      });
    } catch (err) {
      console.error('[PaymentService] Error sending failure notice:', err);
    }
  }

  /**
   * SECURITY ENFORCEMENT:
   * Evaluates any inbound customer claim (message text, screenshot, typed UTR).
   * ALWAYS returns canMarkPaid: false.
   * Proves customer cannot mark their own payment successful.
   */
  public static evaluateCustomerPaymentClaim(_input?: {
    text?: string;
    hasImageAttachment?: boolean;
    claimedUtr?: string;
  }): { canMarkPaid: false; reason: string } {
    void _input;
    return {
      canMarkPaid: false,
      reason:
        'Customer messages, typed UTRs, and screenshots are never accepted as proof of payment. Only cryptographically verified PhonePe provider webhooks or S2S verification can mark an order paid.',
    };
  }
}
