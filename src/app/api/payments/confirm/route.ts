import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { loadAccountMetaCredentials } from '@/lib/flows/meta-send';
import { formatCurrency } from '@/lib/currency';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      order_id,
      amount,
      customer_name,
      customer_phone,
      item_description,
      payment_mode,
      utr,
    } = body;

    const ord = (order_id || `BAP-${Date.now().toString().slice(-6)}`).trim();
    const rawAmt = Number(amount);
    if (!rawAmt || rawAmt <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      );
    }

    const mode = (payment_mode || 'UPI / QR').trim();
    const cleanUtr = utr?.trim() || `${mode.toLowerCase().includes('cash') ? 'CASH' : 'QR'}${Date.now()}`;
    const name = (customer_name || 'Valued Customer').trim();
    const phone = (customer_phone || '').trim();
    const item = (item_description || 'Motorcycle Genuine Spare Parts').trim();
    const nowIso = new Date().toISOString();

    const db = supabaseAdmin();

    // 1. Record / Update transaction in payment_links
    const { data: existingLink } = await db
      .from('payment_links')
      .select('id, merchant_transaction_id')
      .or(`order_id.eq.${ord},merchant_transaction_id.eq.${ord}`)
      .maybeSingle();

    let savedLink = null;
    if (existingLink) {
      const { data: updated, error: updErr } = await db
        .from('payment_links')
        .update({
          status: 'PAID',
          payment_mode: mode,
          phonepe_transaction_id: cleanUtr,
          paid_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existingLink.id)
        .select()
        .single();

      if (updErr) {
        console.warn('[POST /api/payments/confirm] Link update warning:', updErr.message);
      }
      savedLink = updated;
    } else {
      const merchantTxnId = ord.startsWith('BAP') ? ord : `BAP-${ord}`;
      const { data: inserted, error: insErr } = await db
        .from('payment_links')
        .insert({
          order_id: ord,
          merchant_transaction_id: merchantTxnId,
          customer_name: name,
          customer_phone: phone,
          part_details: item,
          amount: rawAmt,
          status: 'PAID',
          payment_mode: mode,
          phonepe_transaction_id: cleanUtr,
          paid_at: nowIso,
          created_at: nowIso,
        })
        .select()
        .single();

      if (insErr) {
        console.warn('[POST /api/payments/confirm] Link insert warning:', insErr.message);
      }
      savedLink = inserted;
    }

    // 2. Update orders table if order exists
    try {
      await db
        .from('orders')
        .update({
          order_status: 'paid',
          updated_at: nowIso,
        })
        .or(`id.eq.${ord},metadata->>order_id.eq.${ord}`);
    } catch {
      // Best-effort order status update
    }

    // 3. Deduct from Partner Ledger (contacts.pending_balance) & log credit entry
    let matchedContact = null;
    if (phone) {
      const cleanDigits = phone.replace(/[^0-9]/g, '').slice(-10);
      try {
        const { data: matchingContacts } = await db
          .from('contacts')
          .select('id, name, account_id, pending_balance, monthly_purchases, loyalty_tier, khata_stage')
          .or(`phone.ilike.%${cleanDigits}%,phone.eq.${phone}`);

        if (matchingContacts && matchingContacts.length > 0) {
          matchedContact = matchingContacts[0];
          const currentDue = Number(matchedContact.pending_balance) || 0;
          const newDue = Math.max(0, currentDue - rawAmt);

          await db
            .from('contacts')
            .update({
              pending_balance: newDue,
              khata_stage: newDue === 0 ? 'Settled This Month' : matchedContact.khata_stage,
              updated_at: nowIso,
            })
            .eq('id', matchedContact.id);

          await db.from('mechanic_ledger_entries').insert({
            account_id: matchedContact.account_id,
            contact_id: matchedContact.id,
            entry_type: 'debit_payment',
            amount: rawAmt,
            payment_mode: mode,
            reference_id: cleanUtr,
            description: `Payment received for Order #${ord} — ${item}`,
          });
        }
      } catch (ledgerErr) {
        console.warn('[POST /api/payments/confirm] Ledger sync warning:', ledgerErr);
      }
    }

    // 4. Send Automated WhatsApp Payment Confirmation Receipt
    if (phone) {
      try {
        const cleanDigits = phone.replace(/[^0-9]/g, '');
        let targetAccountId = matchedContact?.account_id;
        if (!targetAccountId) {
          const { data: firstCfg } = await db
            .from('whatsapp_config')
            .select('account_id')
            .limit(1)
            .maybeSingle();
          targetAccountId = firstCfg?.account_id;
        }

        if (targetAccountId && cleanDigits) {
          const creds = await loadAccountMetaCredentials(db, targetAccountId);
          if (creds?.phoneNumberId && creds?.accessToken) {
            const formattedDate = new Date().toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            const receiptText =
              `🏍️ *BEST AUTO PARTS — PAYMENT RECEIPT* 🧾\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `• *Order ID:* #${ord}\n` +
              `• *Customer:* ${name}\n` +
              `• *Item / Part:* ${item}\n` +
              `• *Amount Received:* ${formatCurrency(rawAmt)}\n` +
              `• *Payment Mode:* ${mode}\n` +
              `• *Transaction Ref / UTR:* ${cleanUtr}\n` +
              `• *Status:* PAID & VERIFIED ✅\n` +
              `• *Date & Time:* ${formattedDate}\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `Thank you! Your payment has been credited and your running ledger balance has been updated.\n\n` +
              `📍 *Store:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001 | +91 96347 22174`;

            await sendTextMessage({
              phoneNumberId: creds.phoneNumberId,
              accessToken: creds.accessToken,
              to: cleanDigits,
              text: receiptText,
            });
          }
        }
      } catch (waErr) {
        console.warn('[POST /api/payments/confirm] Automated WhatsApp receipt skipped:', waErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment Recorded & Ledger Updated!',
      order_id: ord,
      utr: cleanUtr,
      amount: rawAmt,
      payment_mode: mode,
      paid_at: nowIso,
      link: savedLink,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/payments/confirm] Error:', msg);
    return NextResponse.json(
      { error: msg || 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}
