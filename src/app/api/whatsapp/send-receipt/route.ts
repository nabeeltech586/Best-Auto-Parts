import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from '@/lib/whatsapp/inbox-logger';
import { deductStockForSale } from '@/lib/inventory/stock-deduction';

interface SendReceiptPayload {
  recipientName?: string;
  recipientPhone: string;
  receiptId: string;
  details?: string;
  totalAmount: string | number;
  paymentStatus?: string;
  date?: string;
  formattedReceiptText?: string;
}

export async function POST(request: Request) {
  try {
    const body: SendReceiptPayload = await request.json();
    const {
      recipientName,
      recipientPhone,
      receiptId,
      details,
      totalAmount,
      paymentStatus,
      date,
      formattedReceiptText,
    } = body;

    if (!recipientPhone || !receiptId) {
      return NextResponse.json(
        { error: 'recipientPhone and receiptId are required' },
        { status: 400 }
      );
    }

    // 1. Normalize recipient phone to Indian 91XXXXXXXXXX standard
    const cleanDigits = recipientPhone.replace(/[^0-9]/g, '');
    const phone10 = cleanDigits.slice(-10);
    if (!phone10 || phone10.length !== 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit mobile number required' },
        { status: 400 }
      );
    }
    const normalizedPhone = `91${phone10}`;

    const db = supabaseAdmin();

    // 2. Load WhatsApp configuration from database
    const { data: config, error: configError } = await db
      .from('whatsapp_config')
      .select('id, account_id, phone_number_id, access_token')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !config || !config.access_token || !config.phone_number_id) {
      return NextResponse.json(
        { error: 'WhatsApp is not configured. Please connect your WABA in Settings.' },
        { status: 503 }
      );
    }

    const phoneNumberId = config.phone_number_id;
    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch (decryptErr) {
      console.error('[send-receipt] Token decryption error:', decryptErr);
      return NextResponse.json(
        { error: 'Failed to decrypt WhatsApp access token' },
        { status: 500 }
      );
    }

    const accountId = config.account_id;
    const nameStr = (recipientName || 'Valued Customer').trim();
    const idStr = receiptId.trim();
    const detailsStr = (details || 'Motorcycle Spare Parts Order').slice(0, 200).trim();
    const amountStr = String(
      typeof totalAmount === 'number' ? totalAmount.toFixed(2) : totalAmount
    ).trim();
    const statusStr = (paymentStatus || 'PAID').trim();
    const dateStr = (
      date ||
      new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    ).trim();

    // Helper to send template message via Meta Cloud API
    const sendTemplate = async (langCode: 'en' | 'en_US') => {
      const templatePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'template',
        template: {
          name: 'payment_receipt_voucher',
          language: { code: langCode },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: nameStr },
                { type: 'text', text: idStr },
                { type: 'text', text: detailsStr },
                { type: 'text', text: amountStr },
                { type: 'text', text: statusStr },
                { type: 'text', text: dateStr },
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

    // Helper to send standard text fallback message via Meta Cloud API
    const sendFallbackText = async () => {
      const textBody =
        formattedReceiptText ||
        `🧾 *PAYMENT RECEIPT & VOUCHER — BEST AUTO PARTS* 🏍️\n` +
          `• ID: ${idStr}\n` +
          `• Customer / Firm: ${nameStr}\n` +
          `• Items: ${detailsStr}\n` +
          `• Amount: ₹${amountStr}\n` +
          `• Status: ${statusStr}\n` +
          `• Date: ${dateStr}\n\n` +
          `📍 Best Auto Parts, Kailashpur, Saharanpur, UP 247001 • +91 96347 22174`;

      const textPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: { body: textBody },
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

    let metaMessageId: string | null = null;
    let methodUsed: 'template' | 'text' = 'template';
    let sendError: string | null = null;

    // 3. First attempt: payment_receipt_voucher template in 'en'
    let metaAttempt = await sendTemplate('en');

    // If language mismatch error, retry with 'en_US'
    if (!metaAttempt.ok) {
      const errMsg = metaAttempt.data?.error?.message || '';
      const subcode = metaAttempt.data?.error?.error_subcode;
      if (
        subcode === 132000 ||
        subcode === 132001 ||
        errMsg.toLowerCase().includes('language') ||
        errMsg.toLowerCase().includes('does not exist in')
      ) {
        metaAttempt = await sendTemplate('en_US');
      }
    }

    if (metaAttempt.ok && metaAttempt.data?.messages?.[0]?.id) {
      metaMessageId = metaAttempt.data.messages[0].id;
      methodUsed = 'template';
    } else {
      // 4. Fallback attempt: Standard text if template not approved or unavailable
      console.warn(
        '[send-receipt] Template payment_receipt_voucher failed, attempting text fallback:',
        metaAttempt.data?.error
      );
      const textAttempt = await sendFallbackText();
      if (textAttempt.ok && textAttempt.data?.messages?.[0]?.id) {
        metaMessageId = textAttempt.data.messages[0].id;
        methodUsed = 'text';
      } else {
        sendError =
          textAttempt.data?.error?.message ||
          metaAttempt.data?.error?.message ||
          'Failed to deliver message via WhatsApp Meta Cloud API';
      }
    }

    if (!metaMessageId) {
      return NextResponse.json(
        {
          error: sendError || 'WhatsApp dispatch failed',
          details: metaAttempt.data?.error,
        },
        { status: 502 }
      );
    }

    // 5. Log the sent receipt into CRM messages & conversations so it appears in /inbox immediately
    let conversationId: string | null = null;
    let contactId: string | null = null;
    try {
      const isSupplierFirm =
        nameStr.toUpperCase().includes('AGENCY') ||
        nameStr.toUpperCase().includes('ENTERPRISE') ||
        nameStr.toUpperCase().includes('TRADERS');
      const category = isSupplierFirm ? 'Wholesaler' : 'Customer';

      const resolution = await findOrCreateContactAndConversation(db, {
        accountId,
        phone: recipientPhone,
        name: nameStr,
        category,
        company: isSupplierFirm ? nameStr : undefined,
      });

      if (resolution.success && resolution.conversationId) {
        conversationId = resolution.conversationId;
        contactId = resolution.contactId || null;

        const previewContent =
          formattedReceiptText ||
          `🧾 Digital Payment Receipt & Voucher #${idStr} sent for ₹${amountStr} (${statusStr}).`;

        await logOutboundMessageToInbox(db, {
          conversationId: resolution.conversationId,
          contentText: previewContent,
          previewTitle: `🧾 Receipt #${idStr} (₹${amountStr})`,
          contentType: methodUsed === 'template' ? 'template' : 'text',
          templateName: methodUsed === 'template' ? 'payment_receipt_voucher' : null,
          messageId: metaMessageId,
          status: 'sent',
        });
      }

      // Auto-deduct inventory stock for customer/mechanic sale if status is PAID
      if (statusStr === 'PAID' && !isSupplierFirm) {
        try {
          await deductStockForSale(db, {
            orderId: idStr,
            itemDescription: detailsStr,
            referenceId: idStr,
            reason: `Customer / Mechanic Sale (Receipt #${idStr})`,
          });
        } catch (stockErr) {
          console.warn('[send-receipt] Non-fatal stock deduction warning:', stockErr);
        }
      }
    } catch (crmLogErr) {
      console.warn('[send-receipt] CRM conversation logging non-fatal warning:', crmLogErr);
    }

    return NextResponse.json({
      success: true,
      messageId: metaMessageId,
      method: methodUsed,
      recipientPhone: normalizedPhone,
      conversationId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-receipt] Unhandled error:', message);
    return NextResponse.json(
      { error: message || 'Internal server error while sending receipt' },
      { status: 500 }
    );
  }
}
