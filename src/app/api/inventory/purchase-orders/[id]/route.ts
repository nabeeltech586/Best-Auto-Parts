import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { syncSupplierContactBalance } from '@/lib/contacts/balance-sync';
import type { PurchaseOrderPaymentStatus } from '@/types/inventory';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { id } = await context.params;

    const { data: po, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    return NextResponse.json({ purchase_order: po });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const { id } = await context.params;
    const body = await request.json();

    // 1. Fetch current purchase order
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (poError || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    if (body.status !== undefined) {
      updates.status = body.status;
    }

    // 2. Handle payment_status and amount_paid
    if (body.payment_status !== undefined) {
      const targetStatus: PurchaseOrderPaymentStatus = body.payment_status;
      const totalCost = Number(po.total_estimated_cost) || 0;
      const currentPaid = Number(po.amount_paid) || 0;

      if (targetStatus === 'PAID') {
        const remaining = Math.max(0, totalCost - currentPaid);
        updates.payment_status = 'PAID';
        updates.amount_paid = totalCost;

        // If there was a balance remaining, log a quick settlement entry in supplier_payments
        if (remaining > 0 || currentPaid === 0) {
          const settleAmount = remaining > 0 ? remaining : totalCost;
          const paymentMode = body.payment_mode || 'Cash / Quick Settle';

          const { error: paymentErr } = await supabase.from('supplier_payments').insert({
            account_id: accountId,
            supplier_id: po.supplier_id || null,
            supplier_name: po.supplier_name,
            purchase_order_id: po.id,
            user_id: userId,
            amount: settleAmount,
            payment_mode: paymentMode,
            notes: body.notes || 'Quick Settle from Orders Dashboard dropdown',
            paid_at: new Date().toISOString(),
          });

          if (paymentErr) {
            console.error('[purchase-orders/[id] PATCH] Error logging settlement payment:', paymentErr);
          }
        }
      } else if (targetStatus === 'UNPAID' || targetStatus === 'PENDING') {
        updates.payment_status = 'UNPAID';
        updates.amount_paid = 0;
      } else if (targetStatus === 'PARTIAL') {
        updates.payment_status = 'PARTIAL';
        if (body.amount_paid !== undefined) {
          updates.amount_paid = Math.max(0, Number(body.amount_paid) || 0);
        }
      }
    } else if (body.amount_paid !== undefined) {
      const newPaid = Math.max(0, Number(body.amount_paid) || 0);
      const totalCost = Number(po.total_estimated_cost) || 0;
      updates.amount_paid = newPaid;
      updates.payment_status = newPaid >= totalCost && totalCost > 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
    }

    // 3. Update purchase order in DB
    const { data: updatedPo, error: updateError } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*')
      .single();

    if (updateError) {
      console.error('[purchase-orders/[id] PATCH] Update error:', updateError);
      return NextResponse.json({ error: updateError.message || 'Failed to update purchase order' }, { status: 500 });
    }

    // 4. Automatically sync udhaar_balance / pending_balance on matching contact row
    try {
      await syncSupplierContactBalance(
        supabase,
        accountId,
        updatedPo.supplier_phone,
        updatedPo.supplier_name
      );
    } catch (syncErr) {
      console.warn('[purchase-orders/[id] PATCH] Non-blocking contact sync error:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message: `Purchase order #${updatedPo.po_number} payment status updated to ${updatedPo.payment_status}`,
      purchase_order: updatedPo,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await context.params;

    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Purchase order deleted' });
  } catch (err) {
    return toErrorResponse(err);
  }
}
