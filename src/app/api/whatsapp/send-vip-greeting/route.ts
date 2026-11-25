import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  normalizePhone10,
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from '@/lib/whatsapp/inbox-logger';

export interface SendVipGreetingPayload {
  recipientPhone: string;
  recipientName: string;
  salutation?: 'Assalamu Alaikum' | 'Aadab' | 'Sir Ji' | string;
  category?: 'Wholesaler' | 'Distributor' | 'Mechanic' | 'Customer' | string;
  company?: string;
  customMessage?: string;
}

export async function POST(request: Request) {
  try {
    const body: SendVipGreetingPayload = await request.json();
    const {
      recipientPhone,
      recipientName,
      salutation = 'Assalamu Alaikum',
      category = 'Customer',
      company,
      customMessage,
    } = body;

    if (!recipientPhone || !recipientName) {
      return NextResponse.json(
        { error: 'recipientPhone and recipientName are required' },
        { status: 400 }
      );
    }

    const phone10 = normalizePhone10(recipientPhone);
    if (!phone10 || phone10.length !== 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit mobile number required' },
        { status: 400 }
      );
    }

    const normalizedPhone = `91${phone10}`;
    const cleanSalutation = salutation.trim() || 'Assalamu Alaikum';
    const cleanName = recipientName.trim();

    // Standard fallback text message
    const formattedFallbackText =
      customMessage?.trim() ||
      `🤝 *${cleanSalutation} ${cleanName}!* 🏍️\n\n` +
      `Warm greetings from *Best Auto Parts*, Saharanpur!\n` +
      `Thank you for your valued partnership and trust with us for genuine motorcycle spare parts.\n\n` +
      `📍 Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
      `⏰ Shop Timings: 09:00 AM – 09:00 PM (Daily)\n` +
      `📞 Saud Khan • +91 96347 22174`;

    const previewTitle = `🤝 VIP Greeting (${cleanSalutation}) — ${cleanName}`;

    const db = supabaseAdmin();

    // Load WhatsApp configuration
    const { data: config } = await db
      .from('whatsapp_config')
      .select('id, account_id, phone_number_id, access_token')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let metaMessageId: string | null = null;
    let methodUsed: 'template' | 'text' = 'template';
    let metaWarning: string | null = null;

    if (config?.access_token && config?.phone_number_id) {
      try {
        const accessToken = decrypt(config.access_token);
        const phoneNumberId = config.phone_number_id;

        // 1. Helper to send Meta approved template vip_greeting_message
        const sendTemplate = async (langCode: 'en' | 'en_US') => {
          const templatePayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedPhone,
            type: 'template',
            template: {
              name: 'vip_greeting_message',
              language: { code: langCode },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: cleanSalutation },
                    { type: 'text', text: cleanName },
                  ],
                },
              ],
            },
          };

          const metaRes = await fetch(
            `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(templatePayload),
            }
          );
          const metaData = await metaRes.json().catch(() => ({}));
          return { ok: metaRes.ok, status: metaRes.status, data: metaData };
        };

        // 2. Helper to send fallback text
        const sendText = async () => {
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
          return { ok: metaRes.ok, status: metaRes.status, data: metaData };
        };

        // Try template send with 'en' first, retry 'en_US' on language error
        let attempt = await sendTemplate('en');
        if (!attempt.ok) {
          const subcode = attempt.data?.error?.error_subcode;
          const errMsg = attempt.data?.error?.message || '';
          if (
            subcode === 132000 ||
            subcode === 132001 ||
            errMsg.toLowerCase().includes('language') ||
            errMsg.toLowerCase().includes('does not exist in')
          ) {
            attempt = await sendTemplate('en_US');
          }
        }

        if (attempt.ok && attempt.data?.messages?.[0]?.id) {
          metaMessageId = attempt.data.messages[0].id;
          methodUsed = 'template';
        } else {
          console.warn('[send-vip-greeting] Template vip_greeting_message failed, attempting text fallback:', attempt.data);
          const textAttempt = await sendText();
          if (textAttempt.ok && textAttempt.data?.messages?.[0]?.id) {
            metaMessageId = textAttempt.data.messages[0].id;
            methodUsed = 'text';
          } else {
            metaWarning = textAttempt.data?.error?.message || attempt.data?.error?.message;
          }
        }
      } catch (metaErr) {
        metaWarning = metaErr instanceof Error ? metaErr.message : 'Meta dispatch failed';
        console.warn('[send-vip-greeting] Meta API call error:', metaErr);
      }
    } else {
      metaWarning = 'WhatsApp configuration not active. Message logged to CRM Inbox only.';
    }

    if (!metaMessageId) {
      metaMessageId = `crm_vip_${Date.now()}`;
    }

    // 3. Find or create matching contact and conversation thread in CRM Inbox
    const resolution = await findOrCreateContactAndConversation(db, {
      accountId: config?.account_id,
      phone: recipientPhone,
      name: cleanName,
      category,
      company: company || (category === 'Wholesaler' || category === 'Distributor' ? cleanName : undefined),
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
        contentType: methodUsed === 'template' ? 'template' : 'text',
        templateName: methodUsed === 'template' ? 'vip_greeting_message' : null,
        messageId: metaMessageId,
        status: 'sent',
      });
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
    console.error('[send-vip-greeting] Unhandled error:', message);
    return NextResponse.json(
      { error: message || 'Internal server error while sending VIP greeting' },
      { status: 500 }
    );
  }
}
