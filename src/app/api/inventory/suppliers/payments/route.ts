import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { syncSupplierContactBalance } from '@/lib/contacts/balance-sync';

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

    let supplierId = body.supplier_id || null;
    let supplierName = body.supplier_name?.trim() || null;
    const poId = body.purchase_order_id || null;
    const amount = Number(body.amount) || 0;

    let paymentMode: string = 'Cash';
    if (body.payment_mode) {
      const m = String(body.payment_mode).toLowerCase();
      if (m.includes('quick') || m.includes('settle')) paymentMode = 'Cash / Quick Settle';
      else if (m.includes('upi') || m.includes('gpay') || m.includes('paytm')) paymentMode = 'UPI';
      else if (m.includes('razorpay') || m.includes('phonepe')) paymentMode = 'Razorpay';
      else if (m.includes('bank') || m.includes('transfer') || m.includes('neft') || m.includes('rtgs') || m.includes('imps')) paymentMode = 'Bank Transfer';
      else if (m.includes('cash')) paymentMode = 'Cash';
      else if (m.includes('cheque') || m.includes('check')) paymentMode = 'Cheque';
      else paymentMode = body.payment_mode;
    }

    const referenceId = body.reference_id?.trim() || null;
    const notes = body.notes?.trim() || null;
    const paidAt = body.paid_at || new Date().toISOString();

    if (amount <= 0) {
      return NextResponse.json({ error: 'Valid payment amount greater than 0 is required' }, { status: 400 });
    }

    // Auto-resolve PO context and supplier if PO ID is provided
    let poData: {
      id: string;
      supplier_id: string | null;
      supplier_name: string;
      supplier_phone: string;
      total_estimated_cost: number;
      amount_paid: number;
    } | null = null;

    if (poId) {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, supplier_id, supplier_name, supplier_phone, total_estimated_cost, amount_paid')
        .eq('id', poId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (po) {
        poData = po;
        if (!supplierId && po.supplier_id) supplierId = po.supplier_id;
        if (!supplierName) supplierName = po.supplier_name;
      }
    }

    // If still no supplier_id, attempt lookup by firm name in suppliers table
    if (!supplierId && supplierName) {
      const { data: matchedSupplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('account_id', accountId)
        .ilike('firm_name', supplierName)
        .maybeSingle();

      if (matchedSupplier) {
        supplierId = matchedSupplier.id;
      }
    }

    // 1. Insert into supplier_payments
    const { data: paymentRecord, error: insertError } = await supabase
      .from('supplier_payments')
      .insert({
        account_id: accountId,
        supplier_id: supplierId || null,
        supplier_name: supplierName || 'Wholesaler',
        purchase_order_id: poId,
        user_id: userId,
        amount,
        payment_mode: paymentMode,
        reference_id: referenceId,
        notes,
        paid_at: paidAt,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[supplier_payments POST] Insert error:', insertError);
      return NextResponse.json({ error: insertError.message || 'Failed to record supplier payment' }, { status: 500 });
    }

    // 2. If tied to a Purchase Order, update PO amount_paid and payment_status
    let updatedPo = null;
    if (poId && poData) {
      const currentPaid = Number(poData.amount_paid) || 0;
      const totalCost = Number(poData.total_estimated_cost) || 0;
      const newPaid = Math.max(0, currentPaid + amount);
      const newStatus = newPaid >= totalCost && totalCost > 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

      const { data: poResult, error: poUpdateErr } = await supabase
        .from('purchase_orders')
        .update({
          amount_paid: newPaid,
          payment_status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', poId)
        .eq('account_id', accountId)
        .select('*')
        .maybeSingle();

      if (poUpdateErr) {
        console.error('[supplier_payments POST] PO update error:', poUpdateErr);
      } else {
        updatedPo = poResult;
      }
    }

    // 3. Automatically sync udhaar_balance / pending_balance on matching contact row
    try {
      await syncSupplierContactBalance(
        supabase,
        accountId,
        poData?.supplier_phone,
        poData?.supplier_name || supplierName
      );
    } catch (syncErr) {
      console.warn('[supplier_payments POST] Non-blocking contact sync error:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message: `Recorded payment of ₹${amount.toFixed(2)} via ${paymentMode} successfully`,
      payment: paymentRecord,
      purchase_order: updatedPo,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
