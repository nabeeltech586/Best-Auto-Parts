import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);

    const supplierId = searchParams.get('supplier_id');
    const poId = searchParams.get('purchase_order_id');

    let query = supabase
      .from('supplier_payments')
      .select('*, supplier:suppliers(firm_name, whatsapp_number)')
      .eq('account_id', accountId)
      .order('paid_at', { ascending: false });

    if (supplierId) {
      query = query.eq('supplier_id', supplierId);
    }
    if (poId) {
      query = query.eq('purchase_order_id', poId);
    }

    const { data: payments, error } = await query;
    if (error) {
      console.error('[supplier_payments GET] Query error:', error);
      return NextResponse.json({ payments: [] });
    }

    return NextResponse.json({ payments: payments || [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json();

    const supplierId = body.supplier_id;
    const poId = body.purchase_order_id || null;
    const amount = Number(body.amount) || 0;
    let paymentMode: 'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque' = 'UPI';
    if (body.payment_mode) {
      const m = String(body.payment_mode).toLowerCase();
      if (m.includes('bank') || m.includes('transfer')) paymentMode = 'Bank Transfer';
      else if (m.includes('cash')) paymentMode = 'Cash';
      else if (m.includes('cheque') || m.includes('check')) paymentMode = 'Cheque';
      else paymentMode = 'UPI';
    }
    const referenceId = body.reference_id?.trim() || null;
    const notes = body.notes?.trim() || null;
    const paidAt = body.paid_at || new Date().toISOString();

    if (!supplierId) {
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Valid payment amount greater than 0 is required' }, { status: 400 });
    }

    // 1. Insert into supplier_payments
    const { data: paymentRecord, error: insertError } = await supabase
      .from('supplier_payments')
      .insert({
        account_id: accountId,
        supplier_id: supplierId,
        purchase_order_id: poId,
        user_id: userId,
        amount,
        payment_mode: paymentMode,
        reference_id: referenceId,
        notes,
        paid_at: paidAt,
      })
      .select('*, supplier:suppliers(firm_name, whatsapp_number)')
      .single();

    if (insertError) {
      console.error('[supplier_payments POST] Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 2. If tied to a Purchase Order, update PO amount_paid and payment_status
    let updatedPo = null;
    if (poId) {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, total_estimated_cost, amount_paid')
        .eq('id', poId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (po) {
        const currentPaid = Number(po.amount_paid) || 0;
        const totalCost = Number(po.total_estimated_cost) || 0;
        const newPaid = Math.max(0, currentPaid + amount);
        const newStatus = newPaid >= totalCost && totalCost > 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

        const { data: poResult } = await supabase
          .from('purchase_orders')
          .update({
            amount_paid: newPaid,
            payment_status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', poId)
          .eq('account_id', accountId)
          .select()
          .maybeSingle();

        updatedPo = poResult;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recorded payment of ₹${amount.toFixed(2)} successfully`,
      payment: paymentRecord,
      purchase_order: updatedPo,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
