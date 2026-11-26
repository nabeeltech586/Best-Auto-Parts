import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { loadAccountMetaCredentials } from '@/lib/flows/meta-send';
import { formatCurrency } from '@/lib/currency';
import {
  encodePartialMetadata,
  stripPartialMetadataTag,
  parsePaymentAmountsAndStatus,
} from '@/lib/payments/partial-metadata';
import { deductStockForSale } from '@/lib/inventory/stock-deduction';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      order_id,
      merchant_transaction_id,
      amount,
      customer_name,
      customer_phone,
      item_description,
      payment_mode,
      utr,
      notes,
    } = body;

    const ord = (order_id || `BAP-${Date.now().toString().slice(-6)}`).trim();
    const mTxnId = (merchant_transaction_id || '').trim();
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
    const cleanNotes = (notes || '').trim();
    const nowIso = new Date().toISOString();

    const db = supabaseAdmin();

    // 1. Check existing record in payment_links
    let linkQuery = db.from('payment_links').select('*');
    if (mTxnId && ord) {
      linkQuery = linkQuery.or(`merchant_transaction_id.eq.${mTxnId},order_id.eq.${ord},merchant_transaction_id.eq.${ord}`);
    } else if (mTxnId) {
      linkQuery = linkQuery.eq('merchant_transaction_id', mTxnId);
    } else {
      linkQuery = linkQuery.or(`order_id.eq.${ord},merchant_transaction_id.eq.${ord}`);
    }

    const { data: existingLink } = await linkQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Parse existing link status and amounts (supports both dedicated columns and fallback tags)
    const existingParsed = existingLink ? parsePaymentAmountsAndStatus(existingLink) : null;

    // Idempotency Guard: If already marked PAID or remaining_amount is 0, return success immediately
    if (
      existingLink &&
      (existingParsed?.status === 'PAID' ||
        existingLink.status === 'PAID' ||
        (existingParsed !== null && existingParsed.remainingAmount <= 0))
    ) {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        message: 'Payment Already Verified & Recorded!',
        status: 'PAID',
        order_id: existingLink.order_id || ord,
        utr: existingLink.razorpay_payment_id || existingLink.phonepe_transaction_id || cleanUtr,
        amount: Number(existingLink.amount) || rawAmt,
        total_amount: Number(existingLink.amount) || rawAmt,
        paid_amount: Number(existingLink.amount) || rawAmt,
        remaining_amount: 0,
        payment_mode: existingLink.payment_mode || mode,
        paid_at: existingLink.paid_at || nowIso,
        link: existingLink,
      });
    }

    // Calculate partial vs full payment
    const totalAmount = existingLink ? Number(existingLink.amount) || rawAmt : rawAmt;
    const prevPaid = existingParsed ? existingParsed.paidAmount : 0;
    let newPaid = prevPaid + rawAmt;
    let newRemaining = Math.max(0, totalAmount - newPaid);
    let newStatus: 'PAID' | 'PARTIAL' = newRemaining <= 0 ? 'PAID' : 'PARTIAL';

    if (newRemaining <= 0) {
      newPaid = totalAmount;
      newRemaining = 0;
      newStatus = 'PAID';
    }

    // Prepare clean details and partial metadata tag for resilient storage
    const cleanItemDetails = stripPartialMetadataTag(existingLink?.part_details || item);
    const updatedPartDetails =
      newStatus === 'PARTIAL'
        ? `${cleanItemDetails} ${encodePartialMetadata({
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            mode,
            utr: cleanUtr,
          })}`.trim()
        : cleanItemDetails;

    const fallbackTxnId =
      newStatus === 'PARTIAL' ? `PARTIAL:${newPaid}:${newRemaining}:${cleanUtr}` : cleanUtr;

    let savedLink = null;
    if (existingLink) {
      // Primary Attempt: Update with dedicated columns and native 'PARTIAL' status
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        payment_mode: mode,
        razorpay_payment_id: cleanUtr,
        phonepe_transaction_id: cleanUtr,
        part_details: updatedPartDetails,
        paid_at: nowIso,
        updated_at: nowIso,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
      };

      const { data: updated, error: updErr } = await db
        .from('payment_links')
        .update(updatePayload)
        .eq('id', existingLink.id)
        .select()
        .single();

      if (updErr) {
        console.warn('[POST /api/payments/confirm] Dedicated columns update warning:', updErr.message);
        // Resilient Fallback: If DB lacks columns or constraint rejects 'PARTIAL', use 'PENDING' in DB column + structured metadata
        const { data: fallbackUpdated, error: fbErr } = await db
          .from('payment_links')
          .update({
            status: newStatus === 'PAID' ? 'PAID' : 'PENDING',
            payment_mode: mode,
            phonepe_transaction_id: fallbackTxnId,
            part_details: updatedPartDetails,
            paid_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', existingLink.id)
          .select()
          .single();

        if (fbErr) {
          console.error('[POST /api/payments/confirm] Both primary and fallback updates failed:', fbErr.message);
          return NextResponse.json(
            { error: `Failed to record payment in database: ${fbErr.message}` },
            { status: 500 }
          );
        }

        savedLink = {
          ...fallbackUpdated,
          status: newStatus,
          paid_amount: newPaid,
          remaining_amount: newRemaining,
        };
      } else {
        savedLink = updated;
      }
    } else {
      const merchantTxnId = ord.startsWith('BAP') ? ord : `BAP-${ord}`;
      const insertPayload: Record<string, unknown> = {
        order_id: ord,
        merchant_transaction_id: merchantTxnId,
        customer_name: name,
        customer_phone: phone,
        part_details: updatedPartDetails,
        amount: totalAmount,
        status: newStatus,
        payment_mode: mode,
        phonepe_transaction_id: cleanUtr,
        paid_at: nowIso,
        created_at: nowIso,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
      };

      const { data: inserted, error: insErr } = await db
        .from('payment_links')
        .insert(insertPayload)
        .select()
        .single();

      if (insErr) {
        console.warn('[POST /api/payments/confirm] Dedicated columns insert warning:', insErr.message);
        // Resilient Fallback Insert
        const { data: fallbackInserted, error: fbInsErr } = await db
          .from('payment_links')
          .insert({
            order_id: ord,
            merchant_transaction_id: merchantTxnId,
            customer_name: name,
            customer_phone: phone,
            part_details: updatedPartDetails,
            amount: totalAmount,
            status: newStatus === 'PAID' ? 'PAID' : 'PENDING',
            payment_mode: mode,
            phonepe_transaction_id: fallbackTxnId,
            paid_at: nowIso,
            created_at: nowIso,
          })
          .select()
          .single();

        if (fbInsErr) {
          console.error('[POST /api/payments/confirm] Fallback insert failed:', fbInsErr.message);
          return NextResponse.json(
            { error: `Failed to create payment record in database: ${fbInsErr.message}` },
            { status: 500 }
          );
        }

        savedLink = {
          ...fallbackInserted,
          status: newStatus,
          paid_amount: newPaid,
          remaining_amount: newRemaining,
        };
      } else {
        savedLink = inserted;
      }
    }

    // 2. Update orders table if order exists and payment is completed
    if (newStatus === 'PAID') {
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

      // Auto-deduct inventory stock for confirmed sale
      try {
        await deductStockForSale(db, {
          orderId: ord,
          itemDescription: cleanItemDetails,
          referenceId: cleanUtr || mTxnId || ord,
          reason: `Customer Sale (Order #${ord} confirmed via ${mode})`,
        });
      } catch (stockDeductErr) {
        console.warn('[POST /api/payments/confirm] Stock deduction warning:', stockDeductErr);
      }
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
            description: `Payment received for Order #${ord} — ${item} (${newStatus === 'PAID' ? 'Full Settlement' : `Partial Payment, Bal Due: ₹${newRemaining.toFixed(2)}`})${cleanNotes ? ` • Notes: ${cleanNotes}` : ''}`,
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
              timeZone: 'Asia/Kolkata',
            });

            const statusLine =
              newStatus === 'PAID'
                ? `• *Status:* PAID & VERIFIED ✅\n• *Balance Remaining:* ₹0.00 (Fully Settled)`
                : `• *Status:* PARTIALLY PAID ⏳\n• *Amount Paid Today:* ${formatCurrency(rawAmt)}\n• *Remaining Balance Due:* ${formatCurrency(newRemaining)}`;

            const receiptText =
              `🏍️ *BEST AUTO PARTS — PAYMENT RECEIPT* 🧾\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `• *Order ID:* #${ord}\n` +
              `• *Customer:* ${name}\n` +
              `• *Item / Part:* ${item}\n` +
              `• *Total Bill:* ${formatCurrency(totalAmount)}\n` +
              `${statusLine}\n` +
              `• *Payment Mode:* ${mode}\n` +
              `• *Transaction Ref / UTR:* ${cleanUtr}\n` +
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

    const sanitizedLink = savedLink
      ? {
          ...savedLink,
          status: newStatus,
          paid_amount: newPaid,
          remaining_amount: newRemaining,
          part_details: stripPartialMetadataTag(savedLink.part_details),
        }
      : savedLink;

    return NextResponse.json({
      success: true,
      message:
        newStatus === 'PAID'
          ? 'Payment Recorded & Ledger Updated!'
          : `Partial Payment Recorded! Remaining balance due: ${formatCurrency(newRemaining)}`,
      order_id: ord,
      utr: cleanUtr,
      amount: rawAmt,
      total_amount: totalAmount,
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      payment_mode: mode,
      paid_at: nowIso,
      link: sanitizedLink,
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
