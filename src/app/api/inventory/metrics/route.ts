import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import type { InventoryMetrics } from '@/types/inventory';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    // 1. Attempt RPC call first
    const { data: rpcMetrics, error: rpcError } = await supabase.rpc(
      'get_inventory_metrics',
      { p_account_id: accountId },
    );

    if (!rpcError && rpcMetrics) {
      const metrics = rpcMetrics as InventoryMetrics;
      return NextResponse.json({
        metrics,
        ...metrics,
      });
    }

    // 2. Fallback client-side aggregation if RPC not present in DB
    const { data: parts, error: fallbackError } = await supabase
      .from('parts_catalog')
      .select('cost_price, selling_price, quantity_in_stock, low_stock_threshold')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (fallbackError) {
      const zeroMetrics: InventoryMetrics = {
        total_products: 0,
        total_stock_units: 0,
        low_stock_products: 0,
        out_of_stock_products: 0,
        total_cost_value: 0,
        total_selling_value: 0,
      };
      return NextResponse.json({
        metrics: zeroMetrics,
        ...zeroMetrics,
      });
    }

    const items = parts || [];
    let totalStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalCost = 0;
    let totalSelling = 0;

    for (const item of items) {
      const qty = item.quantity_in_stock ?? 0;
      const threshold = item.low_stock_threshold ?? 5;
      const cost = Number(item.cost_price ?? 0);
      const selling = Number(item.selling_price ?? 0);

      totalStock += qty;
      totalCost += cost * qty;
      totalSelling += selling * qty;

      if (qty === 0) {
        outOfStock++;
      } else if (qty <= threshold) {
        lowStock++;
      }
    }

    const computedMetrics: InventoryMetrics = {
      total_products: items.length,
      total_stock_units: totalStock,
      low_stock_products: lowStock,
      out_of_stock_products: outOfStock,
      total_cost_value: Math.round(totalCost * 100) / 100,
      total_selling_value: Math.round(totalSelling * 100) / 100,
    };

    return NextResponse.json({
      metrics: computedMetrics,
      ...computedMetrics,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
