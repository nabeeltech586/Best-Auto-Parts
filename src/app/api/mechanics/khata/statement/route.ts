import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { createPhonePePaymentLink } from '@/lib/payments/phonepe-link';

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const body = await request.json();

    const contactId = body.contact_id;
    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, name, phone, company, pending_balance, monthly_purchases, loyalty_tier')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const mechanicName = contact.name || contact.company || 'Valued Workshop Partner';
    const pendingBalance = Number(contact.pending_balance) || 0;
    const monthlyVolume = Number(contact.monthly_purchases) || 0;
    const tier = contact.loyalty_tier || 'Partner';

    let paymentLink = '';
    let merchantTxnId = '';

    if (pendingBalance > 0) {
      try {
        const linkRes = await createPhonePePaymentLink({
          orderId: `KHATA_${Date.now().toString().slice(-6)}`,
          customerName: mechanicName,
          customerPhone: contact.phone,
          partDetails: `Monthly Khata Ledger Clearance (${mechanicName})`,
          amount: pendingBalance,
          accountId,
        });

        if (linkRes.success) {
          paymentLink = linkRes.paymentLink;
          merchantTxnId = linkRes.merchantTransactionId;
        }
      } catch (linkErr) {
        console.warn('[mechanics/khata/statement] PhonePe link creation failed:', linkErr);
      }
    }

    const todayStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const paymentLinkSection = paymentLink
      ? `\n👉 *Pay Khata Online via PhonePe / UPI:*\n${paymentLink}\n`
      : pendingBalance > 0
      ? `\n👉 *Pay via UPI to:* 9634722174@ybl\n`
      : '';

    const statementText =
      `🏍️ *BEST AUTO PARTS — MECHANIC KHATA STATEMENT* 🔧\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Workshop / Mechanic:* ${mechanicName}\n` +
      `• *Mobile:* ${contact.phone}\n` +
      `• *Loyalty Tier:* ⭐ ${tier} Partner\n` +
      `• *Monthly Volume:* ₹${monthlyVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      `• *Current Balance Due:* ₹${pendingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      `• *Date:* ${todayStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (pendingBalance > 0
        ? `Kindly clear your running Khata balance at your earliest convenience.\n${paymentLinkSection}`
        : `Your running ledger account is 100% CLEAR! Thank you for being a valued trade partner with Best Auto Parts.\n`) +
      `\n📍 *Store Address:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
      `📞 *Direct Contact / Saud Bhai:* +91 96347 22174`;

    return NextResponse.json({
      success: true,
      statementText,
      paymentLink,
      merchantTransactionId: merchantTxnId,
      contact,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
