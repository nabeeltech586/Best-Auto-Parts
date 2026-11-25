import { NextResponse } from 'next/server';
import { getCurrentAccount } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { deductStockForSale } from '@/lib/inventory/stock-deduction';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getClient() {
  try {
    const ctx = await getCurrentAccount();
    return { supabase: ctx.supabase, accountId: ctx.accountId };
  } catch {
    return { supabase: supabaseAdmin(), accountId: null };
  }
}

export async function GET() {
  try {
    const { supabase, accountId } = await getClient();

    let poQuery = supabase
      .from('purchase_orders')
      .select('id, po_number, status, total_units, items, received_at, confirmed_at, created_at')
      .eq('status', 'RECEIVED')
      .order('created_at', { ascending: true });

    if (accountId) poQuery = poQuery.eq('account_id', accountId);
    const { data: pos, error: poErr } = await poQuery;

    if (poErr) {
      return NextResponse.json({ error: poErr.message }, { status: 500 });
    }

    let plQuery = supabase
      .from('payment_links')
      .select('id, order_id, merchant_transaction_id, customer_name, part_details, amount, status, paid_at')
      .eq('status', 'PAID')
      .order('created_at', { ascending: true });

    if (accountId) plQuery = plQuery.eq('account_id', accountId);
    const { data: sales, error: plErr } = await plQuery;

    if (plErr) {
      return NextResponse.json({ error: plErr.message }, { status: 500 });
    }

    // Check movements
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('id, reference_id, movement_type');

    const decreaseRefs = new Set(
      (movements || [])
        .filter((m) => m.movement_type === 'decrease' && m.reference_id)
        .map((m) => m.reference_id)
    );

    const pendingSales = (sales || []).filter((s) => {
      const ref = s.merchant_transaction_id || s.order_id;
      return ref && !decreaseRefs.has(ref) && s.part_details;
    });

    return NextResponse.json({
      status: 'ready',
      totalReceivedPOs: pos?.length || 0,
      totalPaidSales: sales?.length || 0,
      pendingSalesToDeduct: pendingSales.length,
      samplePendingSales: pendingSales.map((s) => ({
        order_id: s.order_id,
        part_details: s.part_details,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId: userAccountId } = await getClient();
    const nowIso = new Date().toISOString();

    // 1. Fetch all received purchase orders
    let poQuery = supabase
      .from('purchase_orders')
      .select('*')
      .eq('status', 'RECEIVED')
      .order('created_at', { ascending: true });

    if (userAccountId) poQuery = poQuery.eq('account_id', userAccountId);
    const { data: pos, error: poError } = await poQuery;

    if (poError) {
      return NextResponse.json({ error: poError.message }, { status: 500 });
    }

    // 2. Fetch all parts catalog
    let partsQuery = supabase.from('parts_catalog').select('*');
    if (userAccountId) partsQuery = partsQuery.eq('account_id', userAccountId);
    const { data: allParts, error: partsErr } = await partsQuery;

    if (partsErr) {
      return NextResponse.json({ error: partsErr.message }, { status: 500 });
    }

    const partsById = new Map<string, any>();
    const partsBySku = new Map<string, any>();
    const partsByName = new Map<string, any>();

    for (const p of allParts || []) {
      partsById.set(p.id, p);
      if (p.sku) partsBySku.set(p.sku.toLowerCase().trim(), p);
      if (p.part_name) partsByName.set(p.part_name.toLowerCase().trim(), p);
    }

    const restockUpdates: Array<{
      poNumber: string;
      sku: string;
      partName: string;
      quantityAdded: number;
      deliveryDate: string;
    }> = [];

    // Reconcile each PO
    for (const po of pos || []) {
      const items = Array.isArray(po.items)
        ? po.items
        : typeof po.items === 'string'
        ? JSON.parse(po.items || '[]')
        : [];

      const poDate = po.received_at || po.confirmed_at || po.created_at || nowIso;
      const poNum = po.po_number;

      for (const item of items) {
        const itemSku = (item.sku || '').toLowerCase().trim();
        const itemName = (item.part_name || item.name || '').toLowerCase().trim();
        const partId = item.part_id;

        const matched =
          (partId ? partsById.get(partId) : null) ||
          (itemSku ? partsBySku.get(itemSku) : null) ||
          (itemName ? partsByName.get(itemName) : null);

        if (matched) {
          const qty = Number(item.quantity_added || item.quantity || po.total_units || 1);

          // Update parts_catalog with last_po_number, last_restocked_at, and last_restocked_quantity
          let { error: partUpdateErr } = await supabase
            .from('parts_catalog')
            .update({
              last_po_number: poNum,
              last_restocked_at: poDate,
              last_restocked_quantity: qty,
              updated_at: nowIso,
            })
            .eq('id', matched.id);

          if (partUpdateErr && (partUpdateErr.message?.includes('last_restocked_quantity') || partUpdateErr.code === '42703')) {
            const fallback = await supabase
              .from('parts_catalog')
              .update({
                last_po_number: poNum,
                last_restocked_at: poDate,
                updated_at: nowIso,
              })
              .eq('id', matched.id);
            partUpdateErr = fallback.error;
          }

          if (!partUpdateErr) {
            restockUpdates.push({
              poNumber: poNum,
              sku: matched.sku,
              partName: matched.part_name,
              quantityAdded: qty,
              deliveryDate: poDate,
            });
          }
        }
      }

      // Mark PO stock_synced: true
      try {
        await supabase
          .from('purchase_orders')
          .update({
            stock_synced: true,
            updated_at: nowIso,
          })
          .eq('id', po.id);
      } catch {
        // Non-fatal if column not yet added
      }
    }

    // 3. Reconcile Sales Stock Deductions
    let salesQuery = supabase
      .from('payment_links')
      .select('*')
      .eq('status', 'PAID')
      .order('created_at', { ascending: true });

    if (userAccountId) salesQuery = salesQuery.eq('account_id', userAccountId);
    const { data: sales } = await salesQuery;

    const salesDeductions: Array<{
      orderId: string;
      customerName: string;
      deductedCount: number;
      totalQuantity: number;
      alreadyDeducted?: boolean;
      details: any[];
    }> = [];

    for (const sale of sales || []) {
      if (!sale.part_details || sale.part_details.toLowerCase().includes('khata') || sale.part_details.toLowerCase().includes('ledger')) {
        continue;
      }

      const deductRes = await deductStockForSale(supabase, {
        accountId: sale.account_id || userAccountId,
        orderId: sale.order_id,
        itemDescription: sale.part_details,
        referenceId: sale.merchant_transaction_id || sale.order_id,
        reason: `Customer Sale (Reconciled Order #${sale.order_id})`,
      });

      salesDeductions.push({
        orderId: sale.order_id,
        customerName: sale.customer_name || 'Customer',
        deductedCount: deductRes.deductedCount,
        totalQuantity: deductRes.totalQuantityDeducted,
        alreadyDeducted: deductRes.alreadyDeducted,
        details: deductRes.details,
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      reconciliationSummary: {
        totalReceivedPOs: pos?.length || 0,
        partsRestockedCount: restockUpdates.length,
        salesProcessedCount: salesDeductions.length,
        salesNewlyDeductedCount: salesDeductions.filter((s) => !s.alreadyDeducted && s.deductedCount > 0).length,
      },
      restockedParts: restockUpdates,
      salesDeductions,
    });
  } catch (err: any) {
    console.error('[inventory/reconcile] Error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
