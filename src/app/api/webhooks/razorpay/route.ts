/**
 * src/app/api/webhooks/razorpay/route.ts
 *
 * Razorpay Webhook Handler for Best Auto Parts CRM
 * Verifies x-razorpay-signature with RAZORPAY_WEBHOOK_SECRET (HMAC SHA256)
 * Processes payment_link.paid and payment.captured events:
 * - Updates BestPay status to PAID with razorpay_payment_id (pay_...)
 * - Deducts stock for sold parts
 * - Sends automated WhatsApp payment receipt to customer
 */

import { NextResponse } from 'next/server';
import {
  verifyRazorpayWebhookSignature,
  markPaymentAsPaid,
  getPaymentLinkByTxnId,
} from '@/lib/payments/razorpay';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const signature =
      request.headers.get('x-razorpay-signature') ||
      request.headers.get('X-Razorpay-Signature');

    if (!signature) {
      console.warn('[Razorpay Webhook] Missing x-razorpay-signature header');
      return NextResponse.json(
        { error: 'Missing x-razorpay-signature header' },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    if (!rawBody) {
      console.warn('[Razorpay Webhook] Missing request body');
      return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
    }

    const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Razorpay Webhook] Invalid signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.event;
    console.log(`[Razorpay Webhook] Received verified event: ${eventType}`);

    // Handle payment_link.paid
    if (eventType === 'payment_link.paid') {
      const plinkEntity = event?.payload?.payment_link?.entity;
      const paymentEntity = event?.payload?.payment?.entity;

      const paymentLinkId = plinkEntity?.id;
      const referenceId = plinkEntity?.reference_id; // Order ID
      const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
      const paymentMode = paymentEntity?.method || 'UPI';
      const amountPaise = plinkEntity?.amount_paid || plinkEntity?.amount || paymentEntity?.amount;
      const amount = amountPaise ? amountPaise / 100 : undefined;

      const orderRef = referenceId || paymentLinkId;

      console.log(
        `[Razorpay Webhook] Processing payment_link.paid for order ${orderRef}, payment ${paymentId}`
      );

      await markPaymentAsPaid({
        orderId: referenceId,
        merchantTransactionId: referenceId,
        razorpayPaymentId: paymentId,
        razorpayPaymentLinkId: paymentLinkId,
        paymentMode,
        amount,
      });

      return NextResponse.json({
        success: true,
        message: 'Payment link paid event processed successfully',
        orderId: referenceId,
        deliveryOrderId: referenceId,
        paymentId,
      });
    }

    // Handle payment.captured
    if (eventType === 'payment.captured') {
      const paymentEntity = event?.payload?.payment?.entity;
      const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
      const paymentMode = paymentEntity?.method || 'UPI';
      const amountPaise = paymentEntity?.amount;
      const amount = amountPaise ? amountPaise / 100 : undefined;

      // Extract Order reference from notes, description, or reference
      const orderRef =
        paymentEntity?.notes?.order_id ||
        paymentEntity?.notes?.reference_id ||
        paymentEntity?.description ||
        paymentEntity?.order_id;

      console.log(
        `[Razorpay Webhook] Processing payment.captured for order ${orderRef}, payment ${paymentId}`
      );

      if (orderRef) {
        await markPaymentAsPaid({
          orderId: orderRef,
          merchantTransactionId: orderRef,
          razorpayPaymentId: paymentId,
          paymentMode,
          amount,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Payment captured event processed successfully',
        orderId: orderRef,
        deliveryOrderId: orderRef,
        paymentId,
      });
    }

    // Acknowledge other events
    return NextResponse.json({
      success: true,
      message: `Event acknowledged: ${eventType}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Razorpay Webhook] Unexpected error:', message);
    return NextResponse.json(
      { error: message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
