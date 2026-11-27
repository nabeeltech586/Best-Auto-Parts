/**
 * src/app/api/webhooks/razorpay/route.ts
 *
 * Razorpay Webhook Handler for Best Auto Parts CRM
 * - Verifies x-razorpay-signature with RAZORPAY_WEBHOOK_SECRET (HMAC SHA256)
 * - Enforces strict atomic idempotency via processRazorpayPaymentSuccess:
 *   * Suppresses concurrent duplicate events (payment_link.paid, payment.captured, order.paid)
 *   * Guarantees only one WhatsApp receipt and one BestPay ledger credit per transaction
 * - Always returns HTTP 200 once signature is verified to prevent Razorpay retry loops
 */

import { NextResponse } from 'next/server';
import {
  verifyRazorpayWebhookSignature,
  processRazorpayPaymentSuccess,
  processRazorpayPaymentFailure,
} from '@/lib/payments/razorpay';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // 1. Signature Verification
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

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
  }

  if (!rawBody) {
    console.warn('[Razorpay Webhook] Missing request body');
    return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
  }

  const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.warn('[Razorpay Webhook] Invalid signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Verified Event Processing (Always return 200 to prevent retry loops)
  try {
    const event = JSON.parse(rawBody);
    const eventType = event?.event;
    console.log(`[Razorpay Webhook] Received verified event: ${eventType}`);

    // Supported payment success events
    if (
      eventType === 'payment_link.paid' ||
      eventType === 'payment.captured' ||
      eventType === 'order.paid'
    ) {
      const plinkEntity = event?.payload?.payment_link?.entity;
      const paymentEntity = event?.payload?.payment?.entity;
      const orderEntity = event?.payload?.order?.entity;

      const paymentLinkId = plinkEntity?.id;
      const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
      const paymentMode = paymentEntity?.method || 'UPI';

      const amountPaise =
        plinkEntity?.amount_paid ||
        plinkEntity?.amount ||
        paymentEntity?.amount ||
        orderEntity?.amount_paid ||
        orderEntity?.amount;
      const amount = amountPaise ? Number(amountPaise) / 100 : 0;

      // Extract reference ID / Order ID / Ledger ID
      const referenceId =
        plinkEntity?.reference_id ||
        paymentEntity?.notes?.order_id ||
        paymentEntity?.notes?.reference_id ||
        orderEntity?.receipt ||
        orderEntity?.notes?.order_id ||
        paymentEntity?.description ||
        paymentEntity?.order_id ||
        paymentLinkId;

      const ledgerId =
        plinkEntity?.notes?.ledger_id ||
        paymentEntity?.notes?.ledger_id ||
        orderEntity?.notes?.ledger_id;

      const customerName =
        plinkEntity?.customer?.name ||
        paymentEntity?.notes?.customer_name ||
        orderEntity?.notes?.customer_name ||
        'Valued Customer';

      const customerPhone =
        plinkEntity?.customer?.contact ||
        paymentEntity?.contact ||
        paymentEntity?.notes?.customer_phone ||
        orderEntity?.notes?.customer_phone;

      const description =
        plinkEntity?.description ||
        paymentEntity?.description ||
        'Two-Wheeler Spare Parts Order';

      // Atomic idempotent execution
      const result = await processRazorpayPaymentSuccess({
        paymentId,
        orderId: referenceId,
        paymentLinkId,
        paymentMode,
        amount,
        customerPhone,
        customerName,
        description,
        ledgerId,
        rawWebhookPayload: event,
        sourceEvent: eventType,
      });

      return NextResponse.json({
        success: true,
        message: result.alreadyProcessed
          ? 'Already processed (idempotent)'
          : 'Payment processed successfully',
        paymentId: result.paymentId,
        orderId: result.orderId,
        deliveryOrderId: result.deliveryOrderId,
        ledgerCredited: result.ledgerCredited,
        alreadyProcessed: result.alreadyProcessed,
      });
    }

    // Explicit payment failure event: log failure, keep stock 100% untouched
    if (eventType === 'payment.failed') {
      const paymentEntity = event?.payload?.payment?.entity;
      const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
      const paymentLinkId = paymentEntity?.payment_link_id;
      const paymentMode = paymentEntity?.method || 'UPI';
      const amountPaise = paymentEntity?.amount;
      const amount = amountPaise ? Number(amountPaise) / 100 : 0;
      const referenceId =
        paymentEntity?.notes?.order_id ||
        paymentEntity?.notes?.reference_id ||
        paymentEntity?.description ||
        paymentLinkId;
      const customerName = paymentEntity?.notes?.customer_name || 'Valued Customer';
      const customerPhone = paymentEntity?.contact || paymentEntity?.notes?.customer_phone;
      const description = paymentEntity?.description || 'Two-Wheeler Spare Parts Order';

      const failResult = await processRazorpayPaymentFailure({
        paymentId,
        orderId: referenceId,
        paymentLinkId,
        paymentMode,
        amount,
        customerPhone,
        customerName,
        description,
        errorCode: paymentEntity?.error_code,
        errorDescription: paymentEntity?.error_description,
        rawWebhookPayload: event,
        sourceEvent: eventType,
      });

      return NextResponse.json({
        success: true,
        message: 'Payment failure recorded. Stock left unchanged.',
        paymentId: failResult.paymentId,
        status: failResult.status,
      });
    }

    // Acknowledge other events (e.g. payment_link.expired, etc.)
    return NextResponse.json({
      success: true,
      message: `Event acknowledged: ${eventType}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Razorpay Webhook] Processing warning:', message);
    // Always return HTTP 200 once signature is valid so Razorpay never enters a retry loop
    return NextResponse.json(
      {
        success: true,
        message: 'Event acknowledged with warning',
        warning: message,
      },
      { status: 200 }
    );
  }
}
