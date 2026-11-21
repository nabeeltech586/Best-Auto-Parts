import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { calculateNewStock, STOCK_MOVEMENT_TYPES } from '@/lib/inventory/stock';
import type { StockMovementType } from '@/types/inventory';

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json();

    const { part_id, delta, movement_type, reason, reference_id } = body;

    if (!part_id) {
      return NextResponse.json({ error: 'Part ID is required' }, { status: 400 });
    }

    const deltaNum = parseInt(delta, 10);
    if (isNaN(deltaNum) || deltaNum === 0) {
      return NextResponse.json({ error: 'Adjustment delta cannot be 0' }, { status: 400 });
    }

    const movementType: StockMovementType = STOCK_MOVEMENT_TYPES.includes(movement_type)
      ? movement_type
      : deltaNum > 0
        ? 'increase'
        : 'decrease';

    // 1. Try RPC `adjust_part_stock` first (handles locking & movements inside Postgres)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('adjust_part_stock', {
      p_account_id: accountId,
      p_part_id: part_id,
      p_delta: deltaNum,
      p_reason: reason?.trim() || null,
      p_movement_type: movementType,
      p_reference_id: reference_id?.trim() || null,
      p_user_id: userId,
    });

    if (!rpcError && rpcResult?.success) {
      return NextResponse.json(rpcResult);
    }

    // 2. Fallback client-side update with safety checks if RPC is not installed
    const { data: part, error: fetchError } = await supabase
      .from('parts_catalog')
      .select('id, quantity_in_stock')
      .eq('id', part_id)
      .eq('account_id', accountId)
      .single();

    if (fetchError || !part) {
      return NextResponse.json({ error: 'Part not found in account' }, { status: 404 });
    }

    const currentStock = part.quantity_in_stock ?? 0;
    const stockCalc = calculateNewStock(currentStock, deltaNum);
    if (!stockCalc.valid) {
      return NextResponse.json({ error: stockCalc.error }, { status: 400 });
    }

    const newStock = stockCalc.newStock;

    // Update parts_catalog
    const { error: updateError } = await supabase
      .from('parts_catalog')
      .update({
        quantity_in_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', part_id)
      .eq('account_id', accountId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Record movement in stock_movements
    const { data: movement, error: movementError } = await supabase
      .from('stock_movements')
      .insert({
        account_id: accountId,
        part_id,
        user_id: userId,
        movement_type: movementType,
        quantity_delta: deltaNum,
        quantity_before: currentStock,
        quantity_after: newStock,
        reason: reason?.trim() || null,
        reference_id: reference_id?.trim() || null,
      })
      .select()
      .maybeSingle();

    if (movementError) {
      console.warn('[inventory/stock/adjust] Movement logging notice:', movementError);
    }

    return NextResponse.json({
      success: true,
      part_id,
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_delta: deltaNum,
      movement_id: movement?.id ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
