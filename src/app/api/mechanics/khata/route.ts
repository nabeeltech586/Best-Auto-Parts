import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import type { MechanicLoyaltyTier, MechanicKhataStage } from '@/types/inventory';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search')?.trim() || '';
    const stage = searchParams.get('stage')?.trim() || '';

    // 1. Fetch tags to identify 'Wholesale / Mechanic'
    const { data: mechanicTag } = await supabase
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', '%Mechanic%')
      .limit(1)
      .maybeSingle();

    let query = supabase
      .from('contacts')
      .select('id, account_id, name, phone, company, pending_balance, monthly_purchases, loyalty_tier, khata_stage, created_at, updated_at')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false });

    // Filter by tag if mechanic tag exists and no explicit search
    if (mechanicTag && !search && !stage) {
      const { data: taggedContacts } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .eq('tag_id', mechanicTag.id);

      const contactIds = (taggedContacts || []).map((t) => t.contact_id);
      if (contactIds.length > 0) {
        query = query.in('id', contactIds);
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%`);
    }

    if (stage && stage !== 'all') {
      query = query.eq('khata_stage', stage);
    }

    const { data: contacts, error } = await query;
    if (error) {
      console.error('[mechanics/khata GET] Query error:', error);
      return NextResponse.json({ mechanics: [], metrics: {} });
    }

    const mechanicsList = (contacts || []).map((c) => ({
      id: c.id,
      account_id: c.account_id,
      name: c.name || 'Workshop / Mechanic',
      phone: c.phone,
      company: c.company || '',
      pending_balance: Number(c.pending_balance) || 0,
      monthly_purchases: Number(c.monthly_purchases) || 0,
      loyalty_tier: (c.loyalty_tier || 'Partner') as MechanicLoyaltyTier,
      khata_stage: (c.khata_stage || 'Active Clear') as MechanicKhataStage,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    // Compute metrics
    const totalPendingBalance = mechanicsList.reduce((acc, m) => acc + m.pending_balance, 0);
    const totalMonthlyVolume = mechanicsList.reduce((acc, m) => acc + m.monthly_purchases, 0);
    const activeKhataCount = mechanicsList.filter((m) => m.pending_balance > 0).length;
    const settledCount = mechanicsList.filter((m) => m.pending_balance === 0).length;

    return NextResponse.json({
      mechanics: mechanicsList,
      metrics: {
        totalMechanics: mechanicsList.length,
        totalPendingBalance,
        totalMonthlyVolume,
        activeKhataCount,
        settledCount,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json();

    const contactId = body.contact_id;
    const entryType: 'credit_udhaar' | 'debit_payment' = body.entry_type;
    const amount = Math.max(0, Number(body.amount) || 0);
    const description = body.description?.trim() || null;
    let paymentMode: 'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque' | null = null;
    if (body.payment_mode) {
      const m = String(body.payment_mode).toLowerCase();
      if (m.includes('bank') || m.includes('transfer')) paymentMode = 'Bank Transfer';
      else if (m.includes('cash')) paymentMode = 'Cash';
      else if (m.includes('cheque') || m.includes('check')) paymentMode = 'Cheque';
      else paymentMode = 'UPI';
    }
    const referenceId = body.reference_id?.trim() || null;

    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 });
    }

    if (!entryType || (entryType !== 'credit_udhaar' && entryType !== 'debit_payment')) {
      return NextResponse.json({ error: 'Valid entry_type (credit_udhaar or debit_payment) is required' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    // 1. Fetch current contact state
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, name, phone, pending_balance, monthly_purchases, loyalty_tier, khata_stage')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Mechanic contact not found' }, { status: 404 });
    }

    const currentBalance = Number(contact.pending_balance) || 0;
    const currentMonthly = Number(contact.monthly_purchases) || 0;

    let newBalance = currentBalance;
    let newMonthly = currentMonthly;

    if (entryType === 'credit_udhaar') {
      newBalance = currentBalance + amount;
      newMonthly = currentMonthly + amount;
    } else {
      newBalance = Math.max(0, currentBalance - amount);
    }

    // Derive Loyalty Tier based on volume
    let newTier: MechanicLoyaltyTier = 'Partner';
    if (newMonthly >= 25000) newTier = 'VIP';
    else if (newMonthly >= 10000) newTier = 'Gold';
    else if (newMonthly >= 5000) newTier = 'Silver';

    // Derive Khata Stage
    let newStage: MechanicKhataStage = 'Active Clear';
    if (newTier === 'Gold' || newTier === 'VIP') {
      newStage = 'Gold & VIP Partners';
    } else if (newBalance === 0) {
      newStage = 'Settled This Month';
    } else if (entryType === 'credit_udhaar') {
      newStage = 'Running Monthly Khata';
    } else {
      newStage = 'Payment Due';
    }

    // 2. Insert into mechanic_ledger_entries
    const { data: entryRecord, error: entryErr } = await supabase
      .from('mechanic_ledger_entries')
      .insert({
        account_id: accountId,
        contact_id: contactId,
        user_id: userId,
        entry_type: entryType,
        amount,
        description: description || (entryType === 'credit_udhaar' ? 'Parts Udhaar / Credit' : 'Khata Payment'),
        payment_mode: paymentMode,
        reference_id: referenceId,
        balance_after: newBalance,
      })
      .select()
      .single();

    if (entryErr) {
      console.error('[mechanics/khata POST] Ledger insert error:', entryErr);
      return NextResponse.json({ error: entryErr.message }, { status: 500 });
    }

    // 3. Update contact record
    const { data: updatedContact, error: updateErr } = await supabase
      .from('contacts')
      .update({
        pending_balance: newBalance,
        monthly_purchases: newMonthly,
        loyalty_tier: newTier,
        khata_stage: newStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (updateErr) {
      console.error('[mechanics/khata POST] Contact update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 4. Auto-sync to BestPay Collections & Ledger (payment_links)
    try {
      const ledgerTxnId = `LEDGER_${contactId}`;
      const ledgerOrderId = `LEDGER_${contactId.slice(0, 8).toUpperCase()}`;
      const partnerName = contact.name || 'Workshop Partner';
      const partnerPhone = contact.phone || '';
      const nowIso = new Date().toISOString();

      if (newBalance > 0) {
        const { data: existingLink } = await supabase
          .from('payment_links')
          .select('id, status')
          .eq('merchant_transaction_id', ledgerTxnId)
          .maybeSingle();

        if (existingLink) {
          await supabase
            .from('payment_links')
            .update({
              amount: newBalance,
              status: 'PENDING',
              customer_name: partnerName,
              customer_phone: partnerPhone,
              part_details: `Monthly Partner Ledger Clearance (${partnerName})`,
              updated_at: nowIso,
            })
            .eq('id', existingLink.id);
        } else {
          await supabase
            .from('payment_links')
            .insert({
              order_id: ledgerOrderId,
              merchant_transaction_id: ledgerTxnId,
              customer_name: partnerName,
              customer_phone: partnerPhone,
              part_details: `Monthly Partner Ledger Clearance (${partnerName})`,
              amount: newBalance,
              status: 'PENDING',
              payment_mode: 'UPI / QR',
              created_at: nowIso,
              updated_at: nowIso,
            });
        }
      } else {
        await supabase
          .from('payment_links')
          .update({
            status: 'PAID',
            paid_at: nowIso,
            updated_at: nowIso,
          })
          .eq('merchant_transaction_id', ledgerTxnId)
          .eq('status', 'PENDING');
      }
    } catch (syncErr) {
      console.warn('[mechanics/khata POST] Payment link sync warning:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message:
        entryType === 'credit_udhaar'
          ? `Added ₹${amount.toFixed(2)} Ledger Entry. New Balance: ₹${newBalance.toFixed(2)}`
          : `Recorded ₹${amount.toFixed(2)} Settlement. Remaining Balance: ₹${newBalance.toFixed(2)}`,
      entry: entryRecord,
      contact: updatedContact,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
