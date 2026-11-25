/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { PurchaseOrderItem, InventoryMetrics } from '@/types/inventory';

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

    if (po.status === 'RECEIVED' || (po as any).stock_synced === true) {
      return NextResponse.json(
        { error: 'This purchase order has already been marked as received and stocked' },
        { status: 400 },
      );
    }

    // Support items as array, stringified JSON, or fallback to top-level po fields
    let items: PurchaseOrderItem[] = [];
    if (Array.isArray(po.items)) {
      items = po.items;
    } else if (typeof po.items === 'string') {
      try {
        const parsed = JSON.parse(po.items);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    }

    // Fallback if items array is empty but PO has part info
    if (items.length === 0) {
      const fallbackPartName = (po as any).part_name || (po as any).item_name || (po as any).name;
      const fallbackSku = (po as any).sku || (po as any).part_sku;
      const fallbackPartId = (po as any).part_id;
      if (fallbackPartName || fallbackSku || fallbackPartId) {
        items = [
          {
            part_id: fallbackPartId || '',
            part_name: fallbackPartName || 'Auto Spare Part',
            sku: fallbackSku || '',
            quantity: Math.max(1, Number((po as any).quantity || po.total_units) || 1),
            cost_price: Number((po as any).cost_price) || 0,
            total_cost: Number(po.total_estimated_cost) || 0,
          },
        ];
      }
    }

    let updatedCount = 0;
    let totalStockAdded = 0;
    const updatedPartsList: Array<{
      id: string;
      part_name: string;
      sku: string;
      prev_stock: number;
      new_stock: number;
      quantity_added: number;
      last_restocked_at: string;
      last_po_number: string;
    }> = [];

    const nowIso = new Date().toISOString();
    const formattedDeliveryDate = new Date(nowIso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }); // e.g. "24 Nov 2026"

    const updatedItems: PurchaseOrderItem[] = [];

    // 2. Process each item: match part, update parts_catalog, log stock movement
    for (const item of items) {
      const partId = item.part_id || (item as any).id;
      const itemSku = (item.sku || (item as any).part_sku || '').trim();
      const itemName = (item.part_name || (item as any).name || (item as any).title || '').trim();
      const itemOem = (item.oem_number || '').trim();

      const rawQty = item.quantity ?? (item as any).qty ?? (item as any).stock_level ?? (item as any).stock;
      const parsedQty = Number(rawQty);
      const orderedQty = !isNaN(parsedQty) && parsedQty > 0
        ? parsedQty
        : Number(po.total_units) > 0
        ? Number(po.total_units)
        : 1;

      let matchedPart: { id: string; part_name: string; sku: string; quantity_in_stock: number } | null = null;

      // Match Strategy 1: Match by exact part_id UUID if provided
      if (partId) {
        const { data } = await supabase
          .from('parts_catalog')
          .select('id, part_name, sku, quantity_in_stock')
          .eq('id', partId)
          .eq('account_id', accountId)
          .maybeSingle();
        if (data) matchedPart = data;
      }

      // Match Strategy 2: Match by exact SKU (case-insensitive)
      if (!matchedPart && itemSku) {
        const { data } = await supabase
          .from('parts_catalog')
          .select('id, part_name, sku, quantity_in_stock')
          .ilike('sku', itemSku)
          .eq('account_id', accountId)
          .maybeSingle();
        if (data) matchedPart = data;
      }

      // Match Strategy 3: Match by exact Part Name (case-insensitive)
      if (!matchedPart && itemName) {
        const { data } = await supabase
          .from('parts_catalog')
          .select('id, part_name, sku, quantity_in_stock')
          .ilike('part_name', itemName)
          .eq('account_id', accountId)
          .maybeSingle();
        if (data) matchedPart = data;
      }

      // Match Strategy 4: Substring Part Name match
      if (!matchedPart && itemName && itemName.length >= 3) {
        const { data } = await supabase
          .from('parts_catalog')
          .select('id, part_name, sku, quantity_in_stock')
          .ilike('part_name', `%${itemName}%`)
          .eq('account_id', accountId)
          .limit(1)
          .maybeSingle();
        if (data) matchedPart = data;
      }

      // Match Strategy 5: Match by OEM Number
      if (!matchedPart && itemOem) {
        const { data } = await supabase
          .from('parts_catalog')
          .select('id, part_name, sku, quantity_in_stock')
          .ilike('oem_number', itemOem)
          .eq('account_id', accountId)
          .maybeSingle();
        if (data) matchedPart = data;
      }

      if (matchedPart) {
        const prevStock = Number(
          matchedPart.quantity_in_stock ??
            (matchedPart as any).stock_level ??
            (matchedPart as any).stock ??
            0,
        );
        const newStock = prevStock + orderedQty;

        // Try updating parts_catalog with last_restocked_quantity
        let { error: updateError } = await supabase
          .from('parts_catalog')
          .update({
            quantity_in_stock: newStock,
            last_restocked_at: nowIso,
            last_po_number: po.po_number,
            last_restocked_quantity: orderedQty,
            updated_at: nowIso,
          })
          .eq('id', matchedPart.id)
          .eq('account_id', accountId);

        // Fallback retry without last_restocked_quantity if column not yet migrated
        if (updateError) {
          const fallback = await supabase
            .from('parts_catalog')
            .update({
              quantity_in_stock: newStock,
              last_restocked_at: nowIso,
              last_po_number: po.po_number,
              updated_at: nowIso,
            })
            .eq('id', matchedPart.id)
            .eq('account_id', accountId);
          updateError = fallback.error;
        }

        if (!updateError) {
          updatedCount++;
          totalStockAdded += orderedQty;

          updatedPartsList.push({
            id: matchedPart.id,
            part_name: matchedPart.part_name,
            sku: matchedPart.sku,
            prev_stock: prevStock,
            new_stock: newStock,
            quantity_added: orderedQty,
            last_restocked_at: nowIso,
            last_po_number: po.po_number,
          });

          // Record immutable stock movement audit entry
          await supabase
            .from('stock_movements')
            .insert({
              account_id: accountId,
              part_id: matchedPart.id,
              user_id: userId,
              movement_type: 'increase',
              quantity_delta: orderedQty,
              quantity_before: prevStock,
              quantity_after: newStock,
              reason: `PO Received: #${po.po_number} (${po.supplier_name})`,
              reference_id: po.id,
              created_at: nowIso,
            })
            .maybeSingle();

          // Save enriched inward details onto the item in the PO
          updatedItems.push({
            ...item,
            part_id: matchedPart.id,
            part_name: matchedPart.part_name || item.part_name,
            sku: matchedPart.sku || item.sku,
            quantity: orderedQty,
            prev_stock: prevStock,
            new_stock: newStock,
            quantity_added: orderedQty,
            received_at: nowIso,
            received_date_formatted: formattedDeliveryDate,
            inward_reference: `PO Received: #${po.po_number} (${po.supplier_name})`,
          } as any);
        } else {
          updatedItems.push(item);
        }
      } else {
        // No match found in catalog for this line item
        updatedItems.push(item);
      }
    }

    // 3. Mark PO as RECEIVED & CONFIRMED with updated items containing inward details
    const poPayload: Record<string, any> = {
      status: 'RECEIVED',
      confirmed_at: nowIso,
      received_at: nowIso,
      items: updatedItems,
      updated_at: nowIso,
    };

    let { data: updatedPo, error: poUpdateError } = await supabase
      .from('purchase_orders')
      .update({
        ...poPayload,
        stock_synced: true,
      })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (poUpdateError && (poUpdateError.message?.includes('stock_synced') || poUpdateError.code === '42703')) {
      const fallbackPo = await supabase
        .from('purchase_orders')
        .update(poPayload)
        .eq('id', id)
        .eq('account_id', accountId)
        .select()
        .single();
      updatedPo = fallbackPo.data;
      poUpdateError = fallbackPo.error;
    }

    if (poUpdateError) {
      console.error('[inventory/purchase-orders/[id]/receive] Update failed:', poUpdateError);
      return NextResponse.json({ error: poUpdateError.message }, { status: 500 });
    }

    // 4. Compute updated inventory metrics to return immediately for instant KPI update
    let latestMetrics: InventoryMetrics | null = null;
    const { data: partsData } = await supabase
      .from('parts_catalog')
      .select('cost_price, selling_price, quantity_in_stock, low_stock_threshold')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (partsData && partsData.length > 0) {
      let totalStock = 0;
      let lowStock = 0;
      let outOfStock = 0;
      let totalCost = 0;
      let totalSelling = 0;

      for (const p of partsData) {
        const qty = p.quantity_in_stock ?? 0;
        const threshold = p.low_stock_threshold ?? 5;
        const cost = Number(p.cost_price ?? 0);
        const selling = Number(p.selling_price ?? 0);

        totalStock += qty;
        totalCost += cost * qty;
        totalSelling += selling * qty;

        if (qty === 0) outOfStock++;
        else if (qty <= threshold) lowStock++;
      }

      latestMetrics = {
        total_products: partsData.length,
        total_stock_units: totalStock,
        low_stock_products: lowStock,
        out_of_stock_products: outOfStock,
        total_cost_value: Math.round(totalCost * 100) / 100,
        total_selling_value: Math.round(totalSelling * 100) / 100,
      };
    }

    return NextResponse.json({
      success: true,
      message: `Purchase order #${po.po_number} marked as received. Added ${totalStockAdded} units across ${updatedCount} parts.`,
      updated_parts_count: updatedCount,
      total_stock_added: totalStockAdded,
      updated_parts: updatedPartsList,
      purchase_order: updatedPo,
      metrics: latestMetrics,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
