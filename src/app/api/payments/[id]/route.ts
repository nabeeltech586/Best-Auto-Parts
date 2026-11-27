import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { deletePaymentLinkCache } from '@/lib/payments/razorpay';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const targetId = decodeURIComponent(id || '').trim();

    if (!targetId) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data, error } = await db
      .from('payment_links')
      .select('*')
      .or(`id.eq.${targetId},merchant_transaction_id.eq.${targetId},order_id.eq.${targetId}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json({ payment: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const targetId = decodeURIComponent(id || '').trim();

    if (!targetId) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 1. Check if record exists in payment_links to identify order_id and merchant_transaction_id
    let deletedLink: { id?: string; order_id?: string; merchant_transaction_id?: string } | null = null;
    try {
      const { data: existingLink } = await db
        .from('payment_links')
        .select('id, order_id, merchant_transaction_id')
        .or(`id.eq.${targetId},merchant_transaction_id.eq.${targetId},order_id.eq.${targetId}`)
        .limit(1)
        .maybeSingle();

      deletedLink = existingLink;

      // Delete from payment_links
      await db
        .from('payment_links')
        .delete()
        .or(`id.eq.${targetId},merchant_transaction_id.eq.${targetId},order_id.eq.${targetId}`);
    } catch (linkErr) {
      console.warn('[DELETE /api/payments/[id]] payment_links delete notice:', linkErr);
    }

    // 2. Delete from payments table
    try {
      await db
        .from('payments')
        .delete()
        .or(`id.eq.${targetId},merchant_transaction_id.eq.${targetId},order_id.eq.${targetId}`);
    } catch (payErr) {
      console.warn('[DELETE /api/payments/[id]] payments delete notice:', payErr);
    }

    // 3. Delete from razorpay_payments table
    try {
      await db
        .from('razorpay_payments')
        .delete()
        .or(`id.eq.${targetId},razorpay_payment_link_id.eq.${targetId},order_id.eq.${targetId}`);
    } catch (rzpErr) {
      console.warn('[DELETE /api/payments/[id]] razorpay_payments delete notice:', rzpErr);
    }

    // 4. Safely clean up linked test / unfulfilled order in orders table without altering inventory stock
    try {
      const effectiveOrderId = deletedLink?.order_id || targetId;
      await db
        .from('orders')
        .delete()
        .or(`id.eq.${effectiveOrderId},metadata->>order_id.eq.${effectiveOrderId},catalog_order_id.eq.${effectiveOrderId}`)
        .neq('stock_deducted', true); // Strict guarantee: never alter inventory stock
    } catch (ordErr) {
      console.warn('[DELETE /api/payments/[id]] orders cleanup notice:', ordErr);
    }

    // 5. Invalidate local link cache in razorpay module
    try {
      deletePaymentLinkCache(targetId);
      if (deletedLink?.order_id) deletePaymentLinkCache(deletedLink.order_id);
      if (deletedLink?.merchant_transaction_id) deletePaymentLinkCache(deletedLink.merchant_transaction_id);
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Payment entry deleted successfully from BestPay Ledger',
      id: targetId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DELETE /api/payments/[id]] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
