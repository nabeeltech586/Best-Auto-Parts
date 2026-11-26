/**
 * src/app/api/orders/delivery-status/route.ts
 *
 * Local Rider Delivery Management API for Best Auto Parts (Kailashpur, Saharanpur)
 * - Updates delivery_status ('Confirmed', 'Packed / Ready', 'Out for Delivery (Local Rider)', 'Delivered')
 * - Stores Local Rider Name and Rider Mobile Number
 * - Automatically dispatches real-time WhatsApp updates to customer on 'Out for Delivery' or 'Delivered'
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { engineSendText } from '@/lib/flows/meta-send';

export const dynamic = 'force-dynamic';

export type DeliveryStatusType =
  | 'Confirmed'
  | 'Packed / Ready'
  | 'Out for Delivery (Local Rider)'
  | 'Delivered';

interface DeliveryStatusBody {
  orderId: string; // e.g. "ORD-CAT-1732608400" or merchant_transaction_id or link id
  deliveryStatus: DeliveryStatusType;
  riderName?: string;
  riderPhone?: string;
  deliveryNotes?: string;
  customerPhone?: string;
  customerName?: string;
  notifyCustomer?: boolean;
}

function normalizePhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function POST(request: Request) {
  try {
    const body: DeliveryStatusBody = await request.json();
    const {
      orderId,
      deliveryStatus,
      riderName,
      riderPhone,
      deliveryNotes,
      notifyCustomer = true,
    } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

    if (!deliveryStatus) {
      return NextResponse.json(
        { error: 'deliveryStatus is required' },
        { status: 400 }
      );
    }

    const cleanOrderId = orderId.trim();
    const cleanRiderName = riderName?.trim() || null;
    const cleanRiderPhone = riderPhone?.trim() || null;
    const cleanNotes = deliveryNotes?.trim() || null;
    const nowIso = new Date().toISOString();

    const db = supabaseAdmin();

    // 1. Look up existing payment link or order
    let targetLink: any = null;
    try {
      const { data: linkData } = await db
        .from('payment_links')
        .select('*')
        .or(
          `order_id.eq.${cleanOrderId},merchant_transaction_id.eq.${cleanOrderId},id.eq.${cleanOrderId}`
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      targetLink = linkData;
    } catch (err) {
      console.warn('[delivery-status] payment_links query notice:', err);
    }

    // 2. Prepare database updates
    const updates: Record<string, unknown> = {
      delivery_status: deliveryStatus,
      rider_name: cleanRiderName,
      rider_phone: cleanRiderPhone,
      delivery_notes: cleanNotes,
      updated_at: nowIso,
    };

    if (deliveryStatus === 'Delivered') {
      updates.delivered_at = nowIso;
    }

    // Attempt updating payment_links
    let linkUpdateSuccess = false;
    try {
      let q = db.from('payment_links').update(updates);
      if (targetLink?.id) {
        q = q.eq('id', targetLink.id);
      } else {
        q = q.or(
          `order_id.eq.${cleanOrderId},merchant_transaction_id.eq.${cleanOrderId}`
        );
      }

      const { error: updErr } = await q;
      if (updErr) {
        // Fallback storing in metadata if dedicated columns are not yet applied
        console.warn('[delivery-status] Column update notice, storing in metadata:', updErr.message);
        const existingMeta = targetLink?.metadata || {};
        const fallbackMeta = {
          ...existingMeta,
          delivery_status: deliveryStatus,
          rider_name: cleanRiderName,
          rider_phone: cleanRiderPhone,
          delivery_notes: cleanNotes,
          delivered_at: deliveryStatus === 'Delivered' ? nowIso : existingMeta.delivered_at,
        };
        await db
          .from('payment_links')
          .update({ metadata: fallbackMeta, updated_at: nowIso })
          .or(`order_id.eq.${cleanOrderId},merchant_transaction_id.eq.${cleanOrderId}`);
      }
      linkUpdateSuccess = true;
    } catch (err) {
      console.warn('[delivery-status] payment_links update warning:', err);
    }

    // Attempt updating orders table as well
    try {
      await db
        .from('orders')
        .update({
          delivery_status: deliveryStatus,
          rider_name: cleanRiderName,
          rider_phone: cleanRiderPhone,
          delivery_notes: cleanNotes,
          ...(deliveryStatus === 'Delivered' ? { delivered_at: nowIso } : {}),
          updated_at: nowIso,
        })
        .or(`id.eq.${cleanOrderId},catalog_order_id.eq.${cleanOrderId},metadata->>order_id.eq.${cleanOrderId}`);
    } catch {
      // Non-critical if orders table is not populated for direct link
    }

    // 3. Automated WhatsApp update to customer when Out for Delivery or Delivered
    let whatsappSent = false;
    const shouldNotify =
      notifyCustomer &&
      (deliveryStatus === 'Out for Delivery (Local Rider)' || deliveryStatus === 'Delivered');

    const customerPhone = body.customerPhone || targetLink?.customer_phone;
    const customerName = body.customerName || targetLink?.customer_name || 'Valued Customer';
    const displayOrderId = cleanOrderId.startsWith('#') ? cleanOrderId : `#${cleanOrderId}`;

    if (shouldNotify && customerPhone) {
      try {
        const cleanPhone = normalizePhone(customerPhone);

        // Find contact
        let contact: any = null;
        const { data: c1 } = await db
          .from('contacts')
          .select('id, account_id, user_id')
          .eq('phone_normalized', cleanPhone)
          .limit(1)
          .maybeSingle();

        contact = c1;

        if (!contact) {
          const { data: c2 } = await db
            .from('contacts')
            .select('id, account_id, user_id')
            .eq('phone', customerPhone)
            .limit(1)
            .maybeSingle();

          contact = c2;
        }

        let accountId = targetLink?.account_id || contact?.account_id;
        let userId = contact?.user_id;

        if (!accountId) {
          const { data: acc } = await db
            .from('accounts')
            .select('id, owner_user_id')
            .limit(1)
            .maybeSingle();
          accountId = acc?.id;
          userId = userId || acc?.owner_user_id;
        }

        // Find or locate conversation
        let conversationId: string | undefined;
        if (contact?.id && accountId) {
          const { data: conv } = await db
            .from('conversations')
            .select('id')
            .eq('contact_id', contact.id)
            .eq('account_id', accountId)
            .limit(1)
            .maybeSingle();

          conversationId = conv?.id;
        }

        let messageText = '';
        if (deliveryStatus === 'Out for Delivery (Local Rider)') {
          messageText =
            `🛵 *OUT FOR DELIVERY — ORDER ${displayOrderId}* 📦\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hello ${customerName}! Your auto parts order is packed and now *Out for Delivery* with our Local Rider.\n\n` +
            `📦 *Delivery Order ID:* *${displayOrderId}*\n` +
            `👤 *Local Rider Name:* *${cleanRiderName || 'Best Auto Parts Express Rider'}*\n` +
            `📞 *Rider Mobile Number:* *${cleanRiderPhone || '+91 96347 22174'}*\n` +
            `📍 *Destination:* Kailashpur / Saharanpur Local Area\n\n` +
            `Please keep your phone reachable. Our rider will contact you upon arriving at your location.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 *Best Auto Parts:* Kailashpur, Saharanpur, UP 247001\n` +
            `📞 *Customer Care:* Saud Khan (+91 96347 22174)`;
        } else if (deliveryStatus === 'Delivered') {
          const deliveredTime = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });

          messageText =
            `✅ *ORDER DELIVERED — ORDER ${displayOrderId}* 🏍️\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Dear ${customerName}, your spare parts order has been successfully delivered by our local rider!\n\n` +
            `📦 *Delivery Order ID:* *${displayOrderId}*\n` +
            `👤 *Delivered By:* *${cleanRiderName || 'Local Rider'}*\n` +
            `📞 *Rider Contact:* *${cleanRiderPhone || '+91 96347 22174'}*\n` +
            `🕒 *Delivered At:* ${deliveredTime}\n\n` +
            `Thank you for trusting Best Auto Parts for your two-wheeler spare parts. If you need any assistance, feel free to reply to this chat anytime.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 *Best Auto Parts:* Kailashpur, Saharanpur, UP 247001\n` +
            `📞 *Direct Helpline:* Saud Khan (+91 96347 22174)`;
        }

        if (contact?.id && accountId && userId && conversationId && messageText) {
          await engineSendText({
            accountId,
            userId,
            conversationId,
            contactId: contact.id,
            text: messageText,
          });
          whatsappSent = true;
          console.log(`[delivery-status] Dispatched WhatsApp update for order ${cleanOrderId} to ${cleanPhone}`);
        } else {
          console.log(`[delivery-status] WhatsApp preview for ${cleanPhone}:\n${messageText}`);
        }
      } catch (waErr: any) {
        console.warn('[delivery-status] WhatsApp dispatch notice:', waErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: cleanOrderId,
      deliveryStatus,
      riderName: cleanRiderName,
      riderPhone: cleanRiderPhone,
      deliveryNotes: cleanNotes,
      whatsappSent,
      updatedAt: nowIso,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[delivery-status] Error:', message);
    return NextResponse.json(
      { error: message || 'Failed to update delivery status' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId')?.trim();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: link } = await db
      .from('payment_links')
      .select('order_id, delivery_status, rider_name, rider_phone, delivered_at, delivery_notes, metadata, customer_name, customer_phone')
      .or(`order_id.eq.${orderId},merchant_transaction_id.eq.${orderId},id.eq.${orderId}`)
      .limit(1)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const meta = link.metadata || {};
    return NextResponse.json({
      success: true,
      orderId: link.order_id,
      deliveryStatus: link.delivery_status || meta.delivery_status || 'Confirmed',
      riderName: link.rider_name || meta.rider_name || null,
      riderPhone: link.rider_phone || meta.rider_phone || null,
      deliveredAt: link.delivered_at || meta.delivered_at || null,
      deliveryNotes: link.delivery_notes || meta.delivery_notes || null,
      customerName: link.customer_name,
      customerPhone: link.customer_phone,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
