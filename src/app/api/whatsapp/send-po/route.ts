import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  normalizePhone10,
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from '@/lib/whatsapp/inbox-logger';

export interface SendPoItem {
  part_name: string;
  quantity: number;
  oem_number?: string | null;
  brand?: string | null;
  unit_cost?: number;
  cost_price?: number;
  total_cost?: number;
}

export interface SendPoPayload {
  poId?: string;
  poNumber: string;
  supplierName: string;
  supplierPhone: string;
  items?: SendPoItem[];
  totalItems?: number;
  totalUnits?: number;
  totalEstimatedCost?: number;
  notes?: string;
  forceText?: boolean;
}

export async function POST(request: Request) {
  try {
    const body: SendPoPayload = await request.json();
    const {
      poId,
      poNumber,
      supplierName,
      supplierPhone,
      items,
      totalItems,
      totalUnits,
      totalEstimatedCost,
      notes,
      forceText = false,
    } = body;

    if (!poNumber || !supplierName || !supplierPhone) {
      return NextResponse.json(
        { error: 'poNumber, supplierName, and supplierPhone are required' },
        { status: 400 }
      );
    }

    // 1. Normalize phone
    const phone10 = normalizePhone10(supplierPhone);
    if (!phone10 || phone10.length !== 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit wholesaler mobile number required' },
        { status: 400 }
      );
    }
    const normalizedPhone = `91${phone10}`;
    const cleanSupplier = supplierName.trim();
    const cleanPo = poNumber.replace(/^#/, '').trim();

    // 2. Format detailed Purchase Order message
    const today = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const lines = [
      `*PURCHASE ORDER — BEST AUTO PARTS* 🏍️`,
      `*PO No:* #${cleanPo} | *Date:* ${today}`,
      `*Wholesaler / Distributor:* ${cleanSupplier}`,
      '',
    ];

    const hasItems = items && Array.isArray(items) && items.length > 0;
    if (hasItems) {
      lines.push('*Ordered Parts List:*');
      items.forEach((item, idx) => {
        const oem = item.oem_number ? `OEM: ${item.oem_number}` : '';
        const brand = item.brand ? `${item.brand}` : '';
        const spec = [oem, brand].filter(Boolean).join(' | ');
        const specStr = spec ? ` (${spec})` : '';
        lines.push(`  ${idx + 1}. *${item.part_name}*${specStr} — *Qty: ${item.quantity} pcs*`);
      });
      lines.push('');
    }

    const computedItems = totalItems ?? (hasItems ? items.length : 0);
    const computedUnits =
      totalUnits ?? (hasItems ? items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0);
    const computedCost =
      totalEstimatedCost ?? (hasItems ? items.reduce((sum, it) => sum + (it.total_cost || 0), 0) : 0);

    lines.push(`• Total Items: *${computedItems}* | Total Units: *${computedUnits} pcs*`);
    if (computedCost > 0) {
      lines.push(`• Est. Order Total: *₹${computedCost.toLocaleString('en-IN')}*`);
    }
    if (notes) {
      lines.push(`• Notes: ${notes.trim()}`);
    }
    lines.push('');
    lines.push('Please confirm stock availability and dispatch schedule.');
    lines.push('📍 *Delivery Address:* Best Auto Parts, Kailashpur, Dehradun Road, Saharanpur, UP 247001 | +91 96347 22174');
    lines.push('📞 Saud Khan: +91 96347 22174');

    const formattedMessage = lines.join('\n');
    const previewTitle = `📦 PO #${cleanPo} (${computedUnits} pcs) — ${cleanSupplier}`;

    const db = supabaseAdmin();

    // 3. Load WhatsApp configuration
    const { data: config } = await db
      .from('whatsapp_config')
      .select('id, account_id, phone_number_id, access_token')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let metaMessageId: string | null = null;
    const methodUsed: 'text' = 'text';
    let metaWarning: string | null = null;

    if (config?.access_token && config?.phone_number_id) {
      try {
        const accessToken = decrypt(config.access_token);
        const phoneNumberId = config.phone_number_id;

        // Helper to send formatted text message via Meta Cloud API
        const textPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'text',
          text: { body: formattedMessage },
        };

        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(textPayload),
          }
        );
        const metaData = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && metaData?.messages?.[0]?.id) {
          metaMessageId = metaData.messages[0].id;
        } else {
          metaWarning =
            metaData?.error?.message ||
            'Direct Meta text send skipped or window closed. Pre-filled wa.me link generated.';
          console.warn('[send-po] Meta Cloud API text notice:', metaWarning);
        }
      } catch (metaErr) {
        metaWarning = metaErr instanceof Error ? metaErr.message : 'Meta dispatch failed';
        console.warn('[send-po] Failed Meta API dispatch:', metaErr);
      }
    } else {
      metaWarning = 'WhatsApp configuration not active. Pre-filled wa.me link ready.';
    }

    if (!metaMessageId) {
      metaMessageId = `crm_po_${Date.now()}`;
    }

    // 4. Determine category: Distributor if name has AGENCY, otherwise Wholesaler
    const category: 'Distributor' | 'Wholesaler' =
      cleanSupplier.toUpperCase().includes('AGENCY') ? 'Distributor' : 'Wholesaler';

    // 5. Find or create matching contact and conversation thread in CRM Inbox
    const resolution = await findOrCreateContactAndConversation(db, {
      accountId: config?.account_id,
      phone: supplierPhone,
      name: cleanSupplier,
      category,
      company: cleanSupplier,
    });

    let conversationId: string | null = null;
    let contactId: string | null = null;

    if (resolution.success && resolution.conversationId) {
      conversationId = resolution.conversationId;
      contactId = resolution.contactId || null;

      // Log outbound message to CRM Inbox thread
      await logOutboundMessageToInbox(db, {
        conversationId: resolution.conversationId,
        contentText: formattedMessage,
        previewTitle,
        contentType: 'text',
        templateName: null,
        messageId: metaMessageId,
        status: 'sent',
      });
    }

    // 6. Update Purchase Order record if poId provided to mark as ORDERED
    if (poId) {
      try {
        await db
          .from('purchase_orders')
          .update({
            status: 'ORDERED',
            sent_at: new Date().toISOString(),
          })
          .eq('id', poId);
      } catch (poUpdateErr) {
        console.warn('[send-po] Non-fatal error updating purchase_order status/sent_at:', poUpdateErr);
      }
    }

    const waLink = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(formattedMessage)}`;

    return NextResponse.json({
      success: true,
      messageId: metaMessageId,
      method: methodUsed,
      recipientPhone: normalizedPhone,
      conversationId,
      contactId,
      waLink,
      warning: metaWarning,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-po] Unhandled error:', message);
    return NextResponse.json(
      { error: message || 'Internal server error while sending purchase order' },
      { status: 500 }
    );
  }
}
