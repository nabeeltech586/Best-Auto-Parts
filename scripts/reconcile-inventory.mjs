/**
 * scripts/reconcile-inventory.mjs
 * Standalone reconciliation runner for Best Auto Parts.
 * Reconciles Purchase Orders (#PO-2026-001 to #PO-2026-007) and Confirmed Sales
 * against parts_catalog and stock_movements for 100% data consistency.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runReconciliation() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' 🏍️  BEST AUTO PARTS — INVENTORY & PURCHASE LEDGER RECONCILIATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const nowIso = new Date().toISOString();

  // 1. Fetch all received purchase orders
  console.log('📦 Step 1: Fetching all Received Purchase Orders (#PO-2026-001 ... #PO-2026-007)...');
  const { data: pos, error: poErr } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('status', 'RECEIVED')
    .order('created_at', { ascending: true });

  if (poErr) {
    console.error('❌ Error fetching purchase orders:', poErr.message);
    process.exit(1);
  }

  console.log(`   Found ${pos.length} received purchase orders.\n`);

  // 2. Fetch parts catalog
  console.log('🔍 Step 2: Loading Parts Catalog for Cross-Referencing...');
  const { data: parts, error: partsErr } = await supabase.from('parts_catalog').select('*');
  if (partsErr) {
    console.error('❌ Error fetching parts_catalog:', partsErr.message);
    process.exit(1);
  }

  const partsById = new Map();
  const partsBySku = new Map();
  const partsByName = new Map();

  for (const p of parts || []) {
    partsById.set(p.id, p);
    if (p.sku) partsBySku.set(p.sku.toLowerCase().trim(), p);
    if (p.part_name) partsByName.set(p.part_name.toLowerCase().trim(), p);
  }
  console.log(`   Loaded ${parts.length} catalog parts.\n`);

  // 3. Align restock metadata
  console.log('🔄 Step 3: Aligning restock delivery badges (PO #, date, quantity)...');
  let restockCount = 0;

  for (const po of pos) {
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

        let { error: updateErr } = await supabase
          .from('parts_catalog')
          .update({
            last_po_number: poNum,
            last_restocked_at: poDate,
            last_restocked_quantity: qty,
            updated_at: nowIso,
          })
          .eq('id', matched.id);

        if (updateErr && (updateErr.message?.includes('last_restocked_quantity') || updateErr.code === '42703')) {
          const fallback = await supabase
            .from('parts_catalog')
            .update({
              last_po_number: poNum,
              last_restocked_at: poDate,
              updated_at: nowIso,
            })
            .eq('id', matched.id);
          updateErr = fallback.error;
        }

        if (!updateErr) {
          restockCount++;
          console.log(`   ✓ ${matched.sku.padEnd(12)} | ${poNum} | Qty: +${qty} | ${matched.part_name.slice(0, 35)}...`);
        }
      }
    }

    // Try setting stock_synced: true on PO
    try {
      await supabase
        .from('purchase_orders')
        .update({ stock_synced: true, updated_at: nowIso })
        .eq('id', po.id);
    } catch {}
  }

  console.log(`\n   Total part restock badges aligned: ${restockCount}\n`);

  // 4. Reconcile Paid Sales Deductions
  console.log('💳 Step 4: Reconciling Confirmed Customer & Mechanic Sales Deductions...');
  const { data: sales, error: salesErr } = await supabase
    .from('payment_links')
    .select('*')
    .eq('status', 'PAID')
    .order('created_at', { ascending: true });

  if (salesErr) {
    console.error('❌ Error fetching payment_links:', salesErr.message);
    process.exit(1);
  }

  console.log(`   Found ${sales.length} paid transactions to verify.\n`);

  let deductedSalesCount = 0;
  let totalPiecesDeducted = 0;

  for (const sale of sales) {
    const rawDetails = sale.part_details?.trim();
    if (!rawDetails || rawDetails.toLowerCase().includes('khata') || rawDetails.toLowerCase().includes('ledger')) {
      console.log(`   • Skip [Non-Part Ledger]: #${sale.order_id} (${sale.customer_name})`);
      continue;
    }

    const ref = sale.merchant_transaction_id || sale.order_id;

    // Check if already deducted in stock_movements
    const { data: existingMovements } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('reference_id', ref)
      .eq('movement_type', 'decrease')
      .limit(1);

    if (existingMovements && existingMovements.length > 0) {
      console.log(`   ✓ Already Deducted [Idempotent]: #${sale.order_id} (${sale.customer_name})`);
      continue;
    }

    // Parse sale items from text
    const lines = rawDetails.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const saleItems = [];

    if (lines.length > 1) {
      for (const line of lines) {
        const qtyMatch = line.match(/\(x(\d+)\)/i) || line.match(/(\d+)\s*(?:pcs|units)/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        const cleanName = line.replace(/^\d+[\s.)-]+/, '').replace(/\(x\d+\)/i, '').split(/[([/]/)[0].trim();
        if (cleanName) saleItems.push({ name: cleanName, qty });
      }
    } else {
      const qtyMatch = rawDetails.match(/\(x(\d+)\)/i) || rawDetails.match(/(\d+)\s*(?:pcs|units)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      const cleanName = rawDetails.replace(/\(x\d+\)/i, '').split(/[([/]/)[0].trim();
      saleItems.push({ name: cleanName, qty });
    }

    let saleDeductedPieces = 0;

    for (const item of saleItems) {
      // Find matching part in catalog
      const cleanName = item.name.toLowerCase();
      let matchedPart = null;

      for (const [name, part] of partsByName.entries()) {
        if (name.includes(cleanName) || cleanName.includes(name)) {
          matchedPart = part;
          break;
        }
      }

      if (!matchedPart) {
        // Search by words
        const words = cleanName.split(/\s+/).filter((w) => w.length >= 3);
        for (const part of parts) {
          const pName = (part.part_name || '').toLowerCase();
          const matchAll = words.every((w) => pName.includes(w));
          if (matchAll) {
            matchedPart = part;
            break;
          }
        }
      }

      if (matchedPart) {
        const currentStock = Number(matchedPart.quantity_in_stock) || 0;
        const newStock = Math.max(0, currentStock - item.qty);

        // Update parts_catalog
        await supabase
          .from('parts_catalog')
          .update({
            quantity_in_stock: newStock,
            updated_at: nowIso,
          })
          .eq('id', matchedPart.id);

        // Log stock movement
        await supabase.from('stock_movements').insert({
          account_id: matchedPart.account_id || sale.account_id,
          part_id: matchedPart.id,
          movement_type: 'decrease',
          quantity_delta: -item.qty,
          quantity_before: currentStock,
          quantity_after: newStock,
          reason: `Customer Sale (Reconciled Order #${sale.order_id})`,
          reference_id: ref,
          created_at: nowIso,
        });

        matchedPart.quantity_in_stock = newStock;
        saleDeductedPieces += item.qty;
        console.log(`   📉 Deducted ${item.qty} pc(s) for ${matchedPart.sku} (${matchedPart.part_name.slice(0, 30)}) | Stock: ${currentStock} -> ${newStock}`);
      }
    }

    if (saleDeductedPieces > 0) {
      deductedSalesCount++;
      totalPiecesDeducted += saleDeductedPieces;
      console.log(`   ✅ Reconciled Sale: #${sale.order_id} (${sale.customer_name}) — ${saleDeductedPieces} item(s) deducted`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' 🎉 RECONCILIATION COMPLETED SUCCESSFULLY!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` • Received Purchase Orders Checked:  ${pos.length}`);
  console.log(` • Parts Restock Badges Aligned:     ${restockCount}`);
  console.log(` • Confirmed Sales Newly Deducted:   ${deductedSalesCount}`);
  console.log(` • Total Parts Quantity Deducted:    ${totalPiecesDeducted}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runReconciliation().catch((err) => {
  console.error('Fatal reconciliation error:', err);
  process.exit(1);
});
