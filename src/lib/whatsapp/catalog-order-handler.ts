/**
 * src/lib/whatsapp/catalog-order-handler.ts
 *
 * Incoming WhatsApp Catalog Order Handler (message.type === 'order')
 * Best Auto Parts — Kailashpur, Saharanpur, UP 247001 (+91 96347 22174)
 */

import { engineSendText } from '@/lib/flows/meta-send';
import { deductStockForSale } from '@/lib/inventory/stock-deduction';
import { triggerCatalogSync } from '@/lib/catalog/meta-sync';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface WhatsAppOrderItem {
  product_retailer_id: string; // SKU
  quantity: number;
  item_price: number;
  currency: string;
}

export interface WhatsAppOrderPayload {
  catalog_id?: string;
  text?: string;
  product_items: WhatsAppOrderItem[];
}

export interface HandleCatalogOrderArgs {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  senderPhone: string;
  customerName: string;
  wamid: string;
  order: WhatsAppOrderPayload;
}

export async function handleCatalogOrderInbound(
  args: HandleCatalogOrderArgs
): Promise<{ success: boolean; orderId: string; totalAmount: number }> {
  const {
    db,
    accountId,
    userId,
    conversationId,
    contactId,
    senderPhone,
    customerName,
    wamid,
    order,
  } = args;

  const nowIso = new Date().toISOString();
  const orderId = `ORD-CAT-${Date.now().toString().slice(-6)}`;

  try {
    // 1. Idempotency Check: check if order for this wamid was already processed
    const { data: existingOrder } = await db
      .from('orders')
      .select('id, total_amount')
      .eq('catalog_order_id', wamid)
      .maybeSingle();

    if (existingOrder) {
      console.log(`[catalog-order] Order for wamid ${wamid} already processed (idempotent).`);
      return {
        success: true,
        orderId: existingOrder.id,
        totalAmount: Number(existingOrder.total_amount) || 0,
      };
    }

    // 2. Resolve items against parts_catalog
    const productItems = Array.isArray(order.product_items) ? order.product_items : [];
    if (productItems.length === 0) {
      return { success: false, orderId, totalAmount: 0 };
    }

    const itemizedList: Array<{
      sku: string;
      partId?: string;
      partName: string;
      brand: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    const affectedSkus: string[] = [];
    let grandTotal = 0;
    let totalQuantity = 0;

    for (const item of productItems) {
      const sku = (item.product_retailer_id || '').trim();
      const qty = Math.max(1, Number(item.quantity) || 1);
      affectedSkus.push(sku);

      // Query catalog for genuine part name and price
      let matchedPart: any = null;
      if (sku) {
        const { data: part } = await db
          .from('parts_catalog')
          .select('*')
          .eq('sku', sku)
          .maybeSingle();
        matchedPart = part;
      }

      const unitPrice =
        Number(matchedPart?.selling_price) || Number(item.item_price) || 0;
      const lineTotal = unitPrice * qty;
      grandTotal += lineTotal;
      totalQuantity += qty;

      itemizedList.push({
        sku: sku || matchedPart?.sku || 'UNKNOWN-SKU',
        partId: matchedPart?.id,
        partName: matchedPart?.part_name || sku || 'Auto Spare Part',
        brand: matchedPart?.brand || 'Best Auto Parts',
        quantity: qty,
        unitPrice,
        lineTotal,
      });
    }

    const itemizedDescription = itemizedList
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.partName} (${it.brand}) (x${it.quantity}) — ₹${it.lineTotal.toFixed(2)}`
      )
      .join('\n');

    // 3. Insert into orders table
    const firstPartId = itemizedList.find((it) => it.partId)?.partId || null;
    try {
      await db.from('orders').insert({
        account_id: accountId,
        contact_id: contactId,
        conversation_id: conversationId,
        part_id: firstPartId,
        quantity: totalQuantity,
        unit_price: itemizedList[0]?.unitPrice || 0,
        total_amount: grandTotal,
        currency: 'INR',
        fulfillment_type: 'pickup',
        delivery_address: order.text || 'Store Pickup / Kailashpur, Saharanpur',
        order_status: 'confirmed',
        catalog_order_id: wamid,
        metadata: {
          wamid,
          catalog_id: order.catalog_id,
          customer_notes: order.text,
          order_id: orderId,
          items: itemizedList,
        },
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch (orderInsertErr: any) {
      console.warn('[catalog-order] orders table insert warning:', orderInsertErr.message);
    }

    // 4. Insert into payment_links table
    try {
      await db.from('payment_links').insert({
        account_id: accountId,
        order_id: orderId,
        merchant_transaction_id: `BAP_${orderId}`,
        customer_name: customerName,
        customer_phone: senderPhone,
        part_details: itemizedDescription,
        amount: grandTotal,
        status: 'PENDING',
        payment_mode: 'UPI_COLLECT',
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch (plErr: any) {
      console.warn('[catalog-order] payment_links insert warning:', plErr.message);
    }

    // 5. Deduct inventory stock in parts_catalog and log in stock_movements
    await deductStockForSale(db, {
      accountId,
      orderId,
      items: itemizedList.map((it) => ({
        sku: it.sku,
        part_id: it.partId,
        name: it.partName,
        quantity: it.quantity,
      })),
      referenceId: wamid,
      reason: `WhatsApp Catalog Order #${orderId} (${customerName})`,
    });

    // 6. Non-blocking real-time sync back to Meta Catalog for affected SKUs
    void triggerCatalogSync({
      accountId,
      skus: affectedSkus,
      reason: `Order #${orderId} stock deduction`,
    });

    // 7. Send immediate WhatsApp Order Confirmation Receipt
    const itemizedMsgLines = itemizedList
      .map(
        (it, idx) =>
          `  ${idx + 1}. *${it.partName}*\n     • Qty: ${it.quantity} pc(s) | Rate: ₹${it.unitPrice.toFixed(2)} | Subtotal: ₹${it.lineTotal.toFixed(2)}`
      )
      .join('\n');

    const customerNoteLine = order.text?.trim()
      ? `\n📝 *Your Note:* "${order.text.trim()}"`
      : '';

    const confirmationText =
      `🛒 *ORDER CONFIRMATION — BEST AUTO PARTS* 🏍️\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Thank you for placing your order from our WhatsApp Catalog! Your parts have been reserved.\n\n` +
      `• *Order ID:* #${orderId}\n` +
      `• *Customer:* ${customerName}\n` +
      `• *Date:* ${new Date(nowIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\n\n` +
      `📦 *Items Ordered:*\n` +
      `${itemizedMsgLines}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Total Payable:* *₹${grandTotal.toFixed(2)}*${customerNoteLine}\n\n` +
      `📍 *Store Pickup & Delivery:*\n` +
      `Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
      `🕒 *Timings:* 09:00 AM – 09:00 PM (Daily)\n` +
      `🕌 *Friday Break:* 12:30 PM – 02:30 PM\n\n` +
      `💳 *Instant UPI Payment:*\n` +
      `• *UPI ID:* \`9761224004-2@ybl\`\n` +
      `• *Name:* Saud Khan (Best Auto Parts)\n\n` +
      `Please pay via any UPI App (GPay / PhonePe / Paytm / BHIM) and reply with the screenshot here for fast collection / dispatch!\n\n` +
      `📞 *Customer Care Helpline:* Saud Bhai (+91 96347 22174)`;

    await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: confirmationText,
    });

    return { success: true, orderId, totalAmount: grandTotal };
  } catch (err: any) {
    console.error('[catalog-order] Error handling order:', err);
    return { success: false, orderId, totalAmount: 0 };
  }
}
