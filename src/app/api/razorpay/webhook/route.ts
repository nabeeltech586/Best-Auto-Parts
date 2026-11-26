/**
 * src/app/api/razorpay/webhook/route.ts
 *
 * Razorpay Webhook Handler for Best Auto Parts CRM
 * - Verifies x-razorpay-signature header with RAZORPAY_WEBHOOK_SECRET using HMAC SHA256
 * - Handles payment_link.paid, payment.captured, and order.paid events idempotently
 * - Updates public.razorpay_payments table status to 'paid', recording razorpay_payment_id & payment_method
 * - Automatically credits customer/mechanic balance in BestPay ledger (contacts.pending_balance & mechanic_ledger_entries)
 * - Updates payment_links and orders
 * - Dispatches approved WhatsApp template payment_receipt_voucher via Meta Cloud API (or text fallback)
 */

import { NextResponse } from 'next/server';
import {
  verifyRazorpayWebhookSignature,
  markPaymentAsPaid,
  creditBestPayLedgerBalance,
  sendWhatsAppReceiptVoucherTemplate,
} from '@/lib/payments/razorpay';
import { supabaseAdmin } from '@/lib/flows/admin-client';

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

      const db = supabaseAdmin();
      const nowIso = new Date().toISOString();

      // 1. Idempotency Check in public.razorpay_payments
      try {
        const rzpTable = db.from('razorpay_payments');
        if (rzpTable && typeof rzpTable.select === 'function') {
          let checkQuery = rzpTable.select('id, status, razorpay_payment_id');
          if (paymentId && !paymentId.startsWith('pay_tmp_')) {
            checkQuery = checkQuery.eq('razorpay_payment_id', paymentId);
          } else if (paymentLinkId) {
            checkQuery = checkQuery.eq('razorpay_payment_link_id', paymentLinkId);
          }
          if (typeof checkQuery.limit === 'function') {
            const { data: existingRows } = await checkQuery.limit(1);
            if (existingRows && existingRows.length > 0 && existingRows[0].status === 'paid') {
              console.log(
                `[Razorpay Webhook] Event already processed idempotently for ${paymentId}`
              );
              return NextResponse.json({
                success: true,
                message: 'Already processed (idempotent)',
                paymentId,
                orderId: referenceId,
              });
            }
          }
        }
      } catch (idempErr) {
        console.warn('[Razorpay Webhook] Idempotency check notice:', idempErr);
      }

      // 2. Update public.razorpay_payments status to 'paid'
      try {
        const rzpTable = db.from('razorpay_payments');
        if (rzpTable && typeof rzpTable.update === 'function') {
          const updatePayload: Record<string, unknown> = {
            status: 'paid',
            razorpay_payment_id: paymentId,
            payment_method: paymentMode,
            raw_webhook_payload: event,
            paid_at: nowIso,
            updated_at: nowIso,
          };
          if (paymentLinkId) {
            await rzpTable
              .update(updatePayload)
              .or(`razorpay_payment_link_id.eq.${paymentLinkId},order_id.eq.${referenceId}`);
          } else if (referenceId) {
            await rzpTable.update(updatePayload).eq('order_id', referenceId);
          }
        }
      } catch (rzpUpdateErr) {
        console.warn('[Razorpay Webhook] razorpay_payments status update notice:', rzpUpdateErr);
      }

      // 3. Update payment_links, orders & deduct stock
      await markPaymentAsPaid({
        orderId: referenceId,
        merchantTransactionId: referenceId,
        razorpayPaymentId: paymentId,
        razorpayPaymentLinkId: paymentLinkId,
        paymentMode,
        amount,
      });

      // 4. Credit BestPay Ledger balance in contacts and mechanic_ledger_entries
      let ledgerCredited = false;
      try {
        const creditResult = await creditBestPayLedgerBalance({
          amount,
          paymentId,
          orderId: referenceId,
          ledgerId: ledgerId || (referenceId?.startsWith('LEDGER_') ? referenceId : undefined),
          customerPhone,
          customerName,
          paymentMode,
          description,
          db,
        });
        ledgerCredited = Boolean(creditResult.credited);
      } catch (creditErr) {
        console.warn('[Razorpay Webhook] Ledger credit notice:', creditErr);
      }

      // 5. Trigger approved WhatsApp template payment_receipt_voucher
      if (customerPhone) {
        try {
          await sendWhatsAppReceiptVoucherTemplate({
            customerName,
            customerPhone,
            receiptId: referenceId || paymentId,
            description,
            amount,
            paymentMode,
            paymentId,
            status: 'PAID',
            db,
          });
        } catch (waErr) {
          console.warn('[Razorpay Webhook] WhatsApp template notice:', waErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Payment processed successfully',
        paymentId,
        orderId: referenceId,
        deliveryOrderId: referenceId,
        ledgerCredited,
      });
    }

    // Acknowledge other events (e.g. payment_link.expired, etc.)
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
