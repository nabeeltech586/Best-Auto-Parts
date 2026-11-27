import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  normalizePhone10,
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from '@/lib/whatsapp/inbox-logger';

export interface SendStockReceivedPayload {
  poId?: string;
  poNumber?: string;
  supplierName: string;
  supplierPhone: string;
  salutation?: 'Sir Ji' | 'Assalamu Alaikum' | 'Aadab' | string;
  itemsSummary?: string;
  totalUnits?: number;
  customMessage?: string;
}

export async function POST(request: Request) {
  try {
    const body: SendStockReceivedPayload = await request.json();
    const {
      poId,
      poNumber,
      supplierName,
      supplierPhone,
      salutation = 'Sir Ji',
      itemsSummary,
      totalUnits,
      customMessage,
    } = body;

    if (!supplierPhone || !supplierName) {
      return NextResponse.json(
        { error: 'supplierPhone and supplierName are required' },
        { status: 400 }
      );
    }

    const phone10 = normalizePhone10(supplierPhone);
    if (!phone10 || phone10.length !== 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit wholesaler mobile number required' },
        { status: 400 }
      );
    }

    const normalizedPhone = `91${phone10}`;
    const cleanSalutation = salutation.trim() || 'Sir Ji';
    const cleanSupplier = supplierName.trim();
    const poNumStr = poNumber ? `#${poNumber.replace(/^#/, '')}` : 'Shipment';

    const formattedFallbackText =
      customMessage?.trim() ||
      `✅ *${cleanSalutation} ${cleanSupplier}!* 📦\n\n` +
      `We have successfully received, counted, and verified the stock for *${poNumStr}* at our shop.` +
      (totalUnits ? ` (Total Units: *${totalUnits} pcs*)` : '') +
      `\n\nAll items have been inspected and taken into inventory. Thank you for the prompt dispatch and cooperation!` +
      `\n\n📍 *Best Auto Parts*, Kailashpur, Saharanpur, UP 247001\n` +
      `📞 Saud Khan • +91 96347 22174`;

    const previewTitle = `✅ Stock Received (${cleanSalutation}) — ${cleanSupplier} (${poNumStr})`;

    const db = supabaseAdmin();

    // Load WhatsApp configuration
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

        // Helper to send direct text confirmation
        const textPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'text',
          text: { body: formattedFallbackText },
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
          metaWarning = metaData?.error?.message || 'Meta text send returned non-OK status';
        }
      } catch (metaErr) {
        metaWarning = metaErr instanceof Error ? metaErr.message : 'Meta dispatch failed';
        console.warn('[send-stock-received] Meta API call error:', metaErr);
      }
    } else {
      metaWarning = 'WhatsApp configuration not active. Message logged to CRM Inbox only.';
    }

    if (!metaMessageId) {
      metaMessageId = `crm_sr_${Date.now()}`;
    }

    // 3. Category: Distributor if name has AGENCY, otherwise Wholesaler
    const category: 'Distributor' | 'Wholesaler' =
      cleanSupplier.toUpperCase().includes('AGENCY') ? 'Distributor' : 'Wholesaler';

    // 4. Find or create matching contact and conversation thread in CRM Inbox
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
        contentText: formattedFallbackText,
        previewTitle,
        contentType: 'text',
        templateName: null,
        messageId: metaMessageId,
        status: 'sent',
      });
    }

    // 5. Update purchase_orders received confirmation if poId provided
    if (poId) {
      try {
        await db
          .from('purchase_orders')
          .update({
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', poId);
      } catch (poErr) {
        console.warn('[send-stock-received] Non-fatal purchase order update notice:', poErr);
      }
    }

    const waLink = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(formattedFallbackText)}`;

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
    console.error('[send-stock-received] Unhandled error:', message);
    return NextResponse.json(
      { error: message || 'Internal server error while sending stock received confirmation' },
      { status: 500 }
    );
  }
}
