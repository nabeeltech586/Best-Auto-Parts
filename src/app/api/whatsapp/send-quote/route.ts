import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { formatCurrency } from '@/lib/currency';
import {
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from '@/lib/whatsapp/inbox-logger';

export interface CartItemPayload {
  name: string;
  quantity?: number;
  unitPrice?: number;
  bikeModel?: string;
  brand?: string;
}

interface SendQuotePayload {
  customerName?: string;
  customerPhone: string;
  partDetails: string;
  items?: CartItemPayload[];
  amount?: string | number;
  orderId?: string;
  paymentLink?: string;
  isQuoteOnly?: boolean;
}

export async function POST(request: Request) {
  try {
    const body: SendQuotePayload = await request.json();
    const {
      customerName,
      customerPhone,
      partDetails,
      items,
      amount,
      orderId,
      paymentLink,
      isQuoteOnly = false,
    } = body;

    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return NextResponse.json(
        { error: 'Customer phone number is required' },
        { status: 400 }
      );
    }

    if (!partDetails || typeof partDetails !== 'string' || !partDetails.trim()) {
      return NextResponse.json(
        { error: 'Part or item details are required' },
        { status: 400 }
      );
    }

    // 1. Normalize recipient phone to Indian 91XXXXXXXXXX standard
    const cleanDigits = customerPhone.replace(/[^0-9]/g, '');
    const phone10 = cleanDigits.slice(-10);
    if (!phone10 || phone10.length !== 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit mobile number required' },
        { status: 400 }
      );
    }
    const normalizedPhone = `91${phone10}`;
    const cleanName = (customerName || '').trim() || 'Valued Customer';
    const cleanPart = partDetails.trim();
    const numAmount = Number(amount);
    const priceStr = !isNaN(numAmount) && numAmount > 0 ? formatCurrency(numAmount) : 'Contact for best price';

    // 2. Prepare WhatsApp single *bold* message with multi-item breakdown support
    let formattedMessage: string;
    let previewTitle: string;

    const hasItemsList = items && Array.isArray(items) && items.length > 0;
    const itemsFormattedText = hasItemsList
      ? items
          .map((item, idx) => {
            const modelStr = item.bikeModel ? ` (${item.bikeModel})` : '';
            const qty = item.quantity || 1;
            const itemTotal = item.unitPrice ? ` — ${formatCurrency(item.unitPrice * qty)}` : '';
            return `  ${idx + 1}. *${item.name}*${modelStr} (x${qty})${itemTotal}`;
          })
          .join('\n')
      : cleanPart;

    if (isQuoteOnly) {
      previewTitle = hasItemsList
        ? `Part Quote (${items.length} items) — ${priceStr}`
        : `Part Quote — ${cleanPart} (${priceStr})`;

      formattedMessage =
        `*Spare Part Quote — Best Auto Parts* 🏍️\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Customer: ${cleanName}\n` +
        (hasItemsList ? `• Selected Parts:\n${itemsFormattedText}\n` : `• Part: ${cleanPart}\n`) +
        `• Total Amount: ${priceStr}\n` +
        `• Availability: In Stock ✅\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
        `⏰ Shop Timing: 9:00 AM – 9:00 PM (Daily)\n` +
        `📞 Customer Care & Support: +91 96347 22174\n\n` +
        `Reply here to confirm your order or request an instant BestPay checkout link.`;
    } else {
      const cleanOrderId = (orderId || '').trim() || `ORD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      previewTitle = hasItemsList
        ? `Payment Request #${cleanOrderId} (${items.length} items) — ${priceStr}`
        : `Payment Request #${cleanOrderId} (${priceStr})`;

      const linkLine = paymentLink ? `👉 *Pay securely here:* ${paymentLink}\n\n` : '';

      formattedMessage =
        `*Payment Request & Part Quote — Best Auto Parts* 🏍️\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Customer: ${cleanName}\n` +
        (hasItemsList ? `• Selected Items:\n${itemsFormattedText}\n` : `• Item: ${cleanPart}\n`) +
        `• Order ID: #${cleanOrderId}\n` +
        `• Grand Total Due: ${priceStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        linkLine +
        `⚡ Supports Instant UPI (Google Pay, Paytm, PhonePe, BHIM), Cards & NetBanking via Razorpay.\n` +
        `📍 Counter Pickup: Kailashpur, Saharanpur, UP 247001\n` +
        `📞 Customer Care: Saud Bhai (+91 96347 22174)\n\n` +
        `Thank you for choosing *Best Auto Parts*!`;
    }

    const db = supabaseAdmin();

    // 3. Load WhatsApp configuration from database
    const { data: config } = await db
      .from('whatsapp_config')
      .select('id, account_id, phone_number_id, access_token')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let metaMessageId: string | null = null;
    let metaWarning: string | null = null;

    if (config?.access_token && config?.phone_number_id) {
      try {
        const accessToken = decrypt(config.access_token);
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: normalizedPhone,
              type: 'text',
              text: {
                preview_url: Boolean(paymentLink),
                body: formattedMessage,
              },
            }),
          }
        );

        const metaData = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && metaData?.messages?.[0]?.id) {
          metaMessageId = metaData.messages[0].id;
        } else {
          console.warn('[send-quote] Meta Cloud API warning:', metaData);
          metaWarning = metaData?.error?.message || 'Meta API returned non-OK response';
        }
      } catch (metaErr) {
        console.warn('[send-quote] Failed to deliver via Meta Cloud API:', metaErr);
        metaWarning = metaErr instanceof Error ? metaErr.message : 'Meta dispatch failed';
      }
    } else {
      metaWarning = 'WhatsApp configuration not active. Message logged to CRM Inbox only.';
    }

    // Fallback message ID if Meta is in sandbox or unconfigured
    if (!metaMessageId) {
      metaMessageId = `crm_msg_${Date.now()}`;
    }

    // 4. Log the sent quote into CRM contacts, conversations & messages so it appears in /inbox immediately
    let conversationId: string | null = null;
    let contactId: string | null = null;
    try {
      const resolution = await findOrCreateContactAndConversation(db, {
        accountId: config?.account_id,
        phone: customerPhone,
        name: cleanName,
        category: 'Customer',
      });

      if (resolution.success && resolution.conversationId) {
        conversationId = resolution.conversationId;
        contactId = resolution.contactId || null;

        await logOutboundMessageToInbox(db, {
          conversationId: resolution.conversationId,
          contentText: formattedMessage,
          previewTitle,
          contentType: 'text',
          messageId: metaMessageId,
          status: 'sent',
        });
      }
    } catch (crmLogErr) {
      console.warn('[send-quote] CRM conversation logging error:', crmLogErr);
    }

    return NextResponse.json({
      success: true,
      messageId: metaMessageId,
      recipientPhone: normalizedPhone,
      conversationId,
      formattedMessage,
      warning: metaWarning || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send WhatsApp quote';
    console.error('[send-quote] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
