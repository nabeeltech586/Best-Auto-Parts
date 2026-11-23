import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { PurchaseOrderItem } from '@/types/inventory';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const { id } = await context.params;

    // 1. Fetch purchase order
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (poError || !po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    if (po.status === 'RECEIVED') {
      return NextResponse.json(
        { error: 'This purchase order has already been marked as received' },
        { status: 400 },
      );
    }

    const items: PurchaseOrderItem[] = Array.isArray(po.items) ? po.items : [];
    let updatedCount = 0;
    let totalStockAdded = 0;

    const nowIso = new Date().toISOString();

    // 2. Process each item: update parts_catalog and log stock movement
    for (const item of items) {
      const partId = item.part_id;
      const orderedQty = Math.max(0, parseInt(String(item.quantity), 10) || 0);

      if (!partId || orderedQty === 0) continue;

      const { data: part } = await supabase
        .from('parts_catalog')
        .select('id, quantity_in_stock')
        .eq('id', partId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (part) {
        const prevStock = part.quantity_in_stock ?? 0;
        const newStock = prevStock + orderedQty;

        const { error: updateError } = await supabase
          .from('parts_catalog')
          .update({
            quantity_in_stock: newStock,
            last_restocked_at: nowIso,
            last_po_number: po.po_number,
            updated_at: nowIso,
          })
          .eq('id', partId)
          .eq('account_id', accountId);

        if (!updateError) {
          updatedCount++;
          totalStockAdded += orderedQty;

          // Record stock movement
          await supabase
            .from('stock_movements')
            .insert({
              account_id: accountId,
              part_id: partId,
              user_id: userId,
              movement_type: 'increase',
              quantity_delta: orderedQty,
              quantity_before: prevStock,
              quantity_after: newStock,
              reason: `PO Received: #${po.po_number} (${po.supplier_name})`,
              reference_id: po.id,
            })
            .maybeSingle();
        }
      }
    }

    // 3. Mark PO as RECEIVED & CONFIRMED
    const { data: updatedPo, error: poUpdateError } = await supabase
      .from('purchase_orders')
      .update({
        status: 'RECEIVED',
        confirmed_at: nowIso,
        received_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (poUpdateError) {
      console.error('[inventory/purchase-orders/[id]/receive] Update failed:', poUpdateError);
      return NextResponse.json({ error: poUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Purchase order #${po.po_number} marked as received. Added ${totalStockAdded} units across ${updatedCount} parts.`,
      updated_parts_count: updatedCount,
      total_stock_added: totalStockAdded,
      purchase_order: updatedPo,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
