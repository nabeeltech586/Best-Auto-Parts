import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export function formatAccountTier(tier?: string | null): string {
  if (!tier || tier === 'Partner' || tier === 'Partner Partner') return '⭐ Pro Partner';
  const clean = tier.trim();
  if (clean.toLowerCase().endsWith('partner partner')) return `⭐ ${clean.replace(/partner\s+partner/gi, 'Pro Partner')}`;
  if (clean.toLowerCase().endsWith('partner')) return `⭐ ${clean}`;
  return `⭐ ${clean} Partner`;
}

export function generatePartnerStatementText({
  name,
  phone,
  tier,
  monthlyVolume,
  balanceDue,
  formattedDate,
  orderId,
}: {
  name: string;
  phone: string;
  tier?: string | null;
  monthlyVolume: number;
  balanceDue: number;
  formattedDate: string;
  orderId?: string;
}): string {
  const accountTier = formatAccountTier(tier);
  const formattedMonthly = monthlyVolume.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedBalance = balanceDue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const ord = orderId || `LEDGER_${Date.now().toString().slice(-6)}`;
  const cleanAmount =
    balanceDue > 0
      ? Number.isInteger(balanceDue)
        ? String(balanceDue)
        : balanceDue.toFixed(2)
      : '0';

  const payUrl = `https://best-auto-parts-one.vercel.app/pay?order=${encodeURIComponent(
    ord
  )}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(
    phone
  )}&item=${encodeURIComponent('Partner Ledger Clearance')}&amount=${cleanAmount}`;

  const directUpiUri = `upi://pay?pa=9761224004-2@ybl&pn=Best%20Auto%20Parts&am=${cleanAmount}&cu=INR`;

  let text =
    `🏍️ *BEST AUTO PARTS — PARTNER LEDGER STATEMENT* 🔧\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Partner / Workshop:* ${name}\n` +
    `• *Mobile:* ${phone}\n` +
    `• *Account Tier:* ${accountTier}\n` +
    `• *Monthly Billing:* ₹${formattedMonthly}\n` +
    `• *Net Balance Due:* ₹${formattedBalance}\n` +
    `• *Statement Date:* ${formattedDate}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n`;

    if (balanceDue > 0) {
    text +=
      `Kindly clear your outstanding ledger balance at your earliest convenience.\n\n` +
      `👉 *Pay Online via BestPay / UPI:*\n` +
      `${payUrl}\n` +
      `${directUpiUri}\n` +
      `(UPI ID: 9761224004-2@ybl)\n\n` +
      `📍 *Store:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001 | +91 96347 22174`;
  } else {
    text +=
      `Your running ledger account is 100% CLEAR! Thank you for being a valued trade partner with Best Auto Parts.\n\n` +
      `📍 *Store:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001 | +91 96347 22174`;
  }

  return text;
}

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

    const formattedDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const orderId = `LEDGER_${
      contact.id ? contact.id.slice(0, 6).toUpperCase() : Date.now().toString().slice(-6)
    }`;

    const cleanAmount =
      pendingBalance > 0
        ? Number.isInteger(pendingBalance)
          ? String(pendingBalance)
          : pendingBalance.toFixed(2)
        : '0';

    const payUrl = `https://best-auto-parts-one.vercel.app/pay?order=${encodeURIComponent(
      orderId
    )}&name=${encodeURIComponent(mechanicName)}&phone=${encodeURIComponent(
      contact.phone
    )}&item=${encodeURIComponent('Partner Ledger Clearance')}&amount=${cleanAmount}`;

    const directUpiUri = `upi://pay?pa=9761224004-2@ybl&pn=Best%20Auto%20Parts&am=${cleanAmount}&cu=INR`;

    const statementText = generatePartnerStatementText({
      name: mechanicName,
      phone: contact.phone,
      tier: contact.loyalty_tier,
      monthlyVolume,
      balanceDue: pendingBalance,
      formattedDate,
      orderId,
    });

    return NextResponse.json({
      success: true,
      statementText,
      paymentLink: pendingBalance > 0 ? payUrl : '',
      payUrl: pendingBalance > 0 ? payUrl : '',
      upiUri: pendingBalance > 0 ? directUpiUri : '',
      upiId: '9761224004-2@ybl',
      contact,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
