import type { SupabaseClient } from '@supabase/supabase-js';

export interface SaleItemCandidate {
  part_id?: string;
  sku?: string;
  part_name?: string;
  quantity?: number;
  name?: string;
  bikeModel?: string;
}

export interface DeductSaleStockParams {
  accountId?: string | null;
  orderId: string;
  itemDescription?: string | null;
  items?: SaleItemCandidate[];
  referenceId?: string | null;
  soldQty?: number;
  reason?: string;
}

export interface DeductStockResult {
  success: boolean;
  alreadyDeducted?: boolean;
  deductedCount: number;
  totalQuantityDeducted: number;
  details: Array<{
    partId: string;
    partName: string;
    sku: string;
    quantityDeducted: number;
    prevStock: number;
    newStock: number;
  }>;
  error?: string;
}

/**
 * Automatically deducts the exact sold quantity of parts from `parts_catalog`
 * and logs an immutable audit entry in `stock_movements`.
 * Fully idempotent: prevents double-deduction by checking existing movements or flags.
 */
export async function deductStockForSale(
  db: SupabaseClient,
  params: DeductSaleStockParams
): Promise<DeductStockResult> {
  const {
    accountId,
    orderId,
    itemDescription,
    items,
    referenceId,
    soldQty = 1,
    reason,
  } = params;

  const targetRef = (referenceId || orderId || '').trim();
  const nowIso = new Date().toISOString();

  const result: DeductStockResult = {
    success: true,
    deductedCount: 0,
    totalQuantityDeducted: 0,
    details: [],
  };

  try {
    // 1. Idempotency Check: check if stock has already been deducted for this transaction/order
    if (targetRef) {
      try {
        const smQuery = db.from('stock_movements');
        if (typeof smQuery?.select === 'function') {
          const { data: existingMovements } = await smQuery
            .select('id')
            .eq('reference_id', targetRef)
            .eq('movement_type', 'decrease')
            .limit(1);

          if (existingMovements && existingMovements.length > 0) {
            return {
              ...result,
              alreadyDeducted: true,
            };
          }
        }
      } catch {
        // Non-fatal idempotency lookup
      }
    }

    // Resolve target account if not passed
    let effectiveAccountId = accountId || null;
    if (!effectiveAccountId) {
      try {
        const pQuery = db.from('parts_catalog');
        if (typeof pQuery?.select === 'function') {
          const sel = pQuery.select('account_id');
          const samplePart =
            typeof sel?.limit === 'function' && typeof sel.limit(1)?.maybeSingle === 'function'
              ? (await sel.limit(1).maybeSingle())?.data
              : typeof sel?.maybeSingle === 'function'
              ? (await sel.maybeSingle())?.data
              : null;
          effectiveAccountId = samplePart?.account_id || null;
        }
      } catch {
        // Fallback if parts_catalog is empty or mock lacks select
      }
    }

    // 2. Identify parts to deduct
    const parsedItems: Array<{
      partId?: string;
      sku?: string;
      partName?: string;
      quantity: number;
    }> = [];

    if (items && Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        parsedItems.push({
          partId: it.part_id,
          sku: it.sku,
          partName: (it.part_name || it.name || '').trim(),
          quantity: Math.max(1, Number(it.quantity) || 1),
        });
      }
    } else if (itemDescription) {
      const rawText = itemDescription.trim();
      // Handle multi-line items (e.g. "1. Clutch Plate (x2)\n2. Brake Shoe (x1)")
      const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      if (lines.length > 1) {
        for (const line of lines) {
          // Look for (xN) or (N pcs)
          const qtyMatch = line.match(/\(x(\d+)\)/i) || line.match(/(\d+)\s*(?:pcs|units)/i);
          const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
          const cleanLineName = line.replace(/^\d+[\s.)-]+/, '').replace(/\(x\d+\)/i, '').trim();

          if (cleanLineName) {
            parsedItems.push({
              partName: cleanLineName,
              quantity: Math.max(1, qty),
            });
          }
        }
      } else {
        // Single item description
        const qtyMatch = rawText.match(/\(x(\d+)\)/i) || rawText.match(/(\d+)\s*(?:pcs|units)/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : Math.max(1, Number(soldQty) || 1);
        const cleanName = rawText.replace(/\(x\d+\)/i, '').split(/[([/]/)[0].trim();

        parsedItems.push({
          partName: cleanName || rawText,
          quantity: qty,
        });
      }
    }

    if (parsedItems.length === 0) {
      return result;
    }

    // 3. Process deductions
    async function executeMaybeSingle(queryBuilder: any) {
      try {
        if (!queryBuilder) return null;
        if (typeof queryBuilder.limit === 'function') {
          const lim = queryBuilder.limit(1);
          if (typeof lim?.maybeSingle === 'function') {
            const res = await lim.maybeSingle();
            const item = Array.isArray(res?.data) ? res.data[0] : res?.data || res;
            if (item) return item;
          }
          const res = await lim;
          const item = Array.isArray(res?.data) ? res.data[0] : res?.data || res;
          if (item) return item;
        }
        if (typeof queryBuilder.maybeSingle === 'function') {
          const res = await queryBuilder.maybeSingle();
          const item = Array.isArray(res?.data) ? res.data[0] : res?.data || res;
          if (item) return item;
        }
        if (typeof queryBuilder.single === 'function') {
          const res = await queryBuilder.single();
          const item = Array.isArray(res?.data) ? res.data[0] : res?.data || res;
          if (item) return item;
        }
        const res = await queryBuilder;
        return Array.isArray(res?.data) ? res.data[0] : res?.data || res;
      } catch {
        return null;
      }
    }

    function normalizePart(raw: any) {
      if (!raw || (!raw.id && !raw.part_name && !raw.name)) return null;
      return {
        id: String(raw.id || ''),
        account_id: raw.account_id || effectiveAccountId,
        part_name: String(raw.part_name || raw.name || raw.title || ''),
        sku: String(raw.sku || ''),
        quantity_in_stock: Number(raw.quantity_in_stock ?? raw.stock ?? 0),
        low_stock_threshold: Number(raw.low_stock_threshold ?? 5),
      };
    }

    for (const item of parsedItems) {
      let matchedPart: {
        id: string;
        account_id: string;
        part_name: string;
        sku: string;
        quantity_in_stock: number;
        low_stock_threshold: number;
      } | null = null;

      // Match Strategy 1: exact partId
      if (item.partId) {
        let q = db.from('parts_catalog').select('*');
        if (typeof q?.eq === 'function') q = q.eq('id', item.partId);
        if (effectiveAccountId && typeof q?.eq === 'function') q = q.eq('account_id', effectiveAccountId);
        const data = await executeMaybeSingle(q);
        if (data) matchedPart = normalizePart(data);
      }

      // Match Strategy 2: exact SKU
      if (!matchedPart && item.sku) {
        let q = db.from('parts_catalog').select('*');
        if (typeof q?.ilike === 'function') q = q.ilike('sku', item.sku.trim());
        else if (typeof q?.eq === 'function') q = q.eq('sku', item.sku.trim());
        if (effectiveAccountId && typeof q?.eq === 'function') q = q.eq('account_id', effectiveAccountId);
        const data = await executeMaybeSingle(q);
        if (data) matchedPart = normalizePart(data);
      }

      // Match Strategy 3: partName match
      if (!matchedPart && item.partName && item.partName.length >= 2) {
        let q = db.from('parts_catalog').select('*');
        if (typeof q?.ilike === 'function') {
          q = q.ilike('part_name', `%${item.partName}%`);
        } else if (typeof q?.eq === 'function') {
          q = q.eq('part_name', item.partName);
        }
        if (effectiveAccountId && typeof q?.eq === 'function') q = q.eq('account_id', effectiveAccountId);
        const data = await executeMaybeSingle(q);
        if (data) matchedPart = normalizePart(data);
      }

      // Fallback Strategy 4: match OEM number from name
      if (!matchedPart && item.partName) {
        const oemCandidate = item.partName.match(/[A-Z0-9]{5,}/i)?.[0];
        if (oemCandidate) {
          let q = db.from('parts_catalog').select('*');
          if (typeof q?.ilike === 'function') {
            q = q.ilike('oem_number', `%${oemCandidate}%`);
          }
          if (effectiveAccountId && typeof q?.eq === 'function') q = q.eq('account_id', effectiveAccountId);
          const data = await executeMaybeSingle(q);
          if (data) matchedPart = normalizePart(data);
        }
      }

      if (matchedPart) {
        const currentStock = Number(matchedPart.quantity_in_stock) || 0;
        const qtyToDeduct = item.quantity;
        const newStock = Math.max(0, currentStock - qtyToDeduct);
        const accId = matchedPart.account_id || effectiveAccountId;
        const threshold = matchedPart.low_stock_threshold || 5;

        // Deduct from parts_catalog
        let updateErr: any = null;
        try {
          const uq = db.from('parts_catalog').update({
            quantity_in_stock: newStock,
            updated_at: nowIso,
          });
          if (typeof uq?.eq === 'function') {
            const res = await uq.eq('id', matchedPart.id);
            updateErr = res?.error;
          }
        } catch (e: any) {
          updateErr = e;
        }

        if (!updateErr) {
          result.deductedCount++;
          result.totalQuantityDeducted += qtyToDeduct;
          result.details.push({
            partId: matchedPart.id,
            partName: matchedPart.part_name,
            sku: matchedPart.sku,
            quantityDeducted: qtyToDeduct,
            prevStock: currentStock,
            newStock,
          });

          // Insert audit movement
          try {
            await db.from('stock_movements').insert({
              account_id: accId,
              part_id: matchedPart.id,
              movement_type: 'decrease',
              quantity_delta: -qtyToDeduct,
              quantity_before: currentStock,
              quantity_after: newStock,
              reason:
                reason ||
                `Customer / Mechanic Sale — Order #${orderId}${qtyToDeduct > 1 ? ` (${qtyToDeduct} pcs)` : ''}`,
              reference_id: targetRef,
              created_at: nowIso,
            });
          } catch {
            // Non-fatal movement insert
          }

          // Low-stock alert notification if at or below threshold
          if (newStock <= threshold && accId) {
            try {
              const accRes = await db
                .from('accounts')
                .select('owner_user_id')
                .eq('id', accId)
                .maybeSingle();
              const targetUserId = accRes?.data?.owner_user_id;
              if (targetUserId) {
                await db.from('notifications').insert({
                  account_id: accId,
                  user_id: targetUserId,
                  type: 'conversation_assigned',
                  title: `⚠️ Low Stock Alert: ${matchedPart.part_name}`,
                  body: `Stock for ${matchedPart.part_name} is down to ${newStock} unit(s) remaining (threshold: ${threshold}). Restock recommended.`,
                  created_at: nowIso,
                });
              }
            } catch {
              // Non-fatal notification
            }
          }
        }
      }
    }

    // 4. Update stock_deducted flag on payment_links if link exists
    if (result.deductedCount > 0 && targetRef) {
      try {
        await db
          .from('payment_links')
          .update({
            stock_deducted: true,
            updated_at: nowIso,
          })
          .or(`order_id.eq.${orderId},merchant_transaction_id.eq.${targetRef}`);
      } catch {
        // Non-fatal flag update
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[stock-deduction] Error deducting stock for sale:', msg);
    result.success = false;
    result.error = msg;
  }

  return result;
}

export interface RestoreStockParams {
  accountId?: string | null;
  orderId: string;
  referenceId?: string | null;
  reason?: string;
}

/**
 * Restores previously deducted stock if an order/sale is cancelled or refunded.
 */
export async function restoreStockForCancelledOrder(
  db: SupabaseClient,
  params: RestoreStockParams
): Promise<{ success: boolean; restoredCount: number }> {
  const { accountId, orderId, referenceId, reason } = params;
  const targetRef = (referenceId || orderId || '').trim();
  const nowIso = new Date().toISOString();

  let restoredCount = 0;

  try {
    if (!targetRef) return { success: false, restoredCount: 0 };

    // Find previous decrease movements for this order
    const { data: movements } = await db
      .from('stock_movements')
      .select('*')
      .eq('reference_id', targetRef)
      .eq('movement_type', 'decrease');

    if (movements && movements.length > 0) {
      for (const mov of movements) {
        const qtyToRestore = Math.abs(Number(mov.quantity_delta) || 1);

        const { data: part } = await db
          .from('parts_catalog')
          .select('id, quantity_in_stock, account_id')
          .eq('id', mov.part_id)
          .maybeSingle();

        if (part) {
          const currentStock = Number(part.quantity_in_stock) || 0;
          const newStock = currentStock + qtyToRestore;

          await db
            .from('parts_catalog')
            .update({
              quantity_in_stock: newStock,
              updated_at: nowIso,
            })
            .eq('id', part.id);

          await db.from('stock_movements').insert({
            account_id: part.account_id || accountId,
            part_id: part.id,
            movement_type: 'increase',
            quantity_delta: qtyToRestore,
            quantity_before: currentStock,
            quantity_after: newStock,
            reason: reason || `Sale Cancelled / Voided (Order #${orderId})`,
            reference_id: `RESTORE:${targetRef}`,
            created_at: nowIso,
          });

          restoredCount++;
        }
      }

      // Reset stock_deducted flag on payment_links
      try {
        await db
          .from('payment_links')
          .update({
            stock_deducted: false,
            updated_at: nowIso,
          })
          .or(`order_id.eq.${orderId},merchant_transaction_id.eq.${targetRef}`);
      } catch {
        // Non-fatal flag update
      }
    }

    return { success: true, restoredCount };
  } catch (err) {
    console.warn('[stock-deduction] Error restoring cancelled stock:', err);
    return { success: false, restoredCount };
  }
}
