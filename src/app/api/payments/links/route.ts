import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    const db = supabaseAdmin();

    // 1. Initial / On-Load Sync: Auto-sync any Pipeline partner with balance_due > 0 (Mohd ali ₹250, etc.)
    try {
      const { data: debtContacts } = await db
        .from('contacts')
        .select('id, name, phone, company, pending_balance')
        .gt('pending_balance', 0);

      if (debtContacts && debtContacts.length > 0) {
        const nowIso = new Date().toISOString();
        const ledgerTxnIds = debtContacts.map((c: { id: string }) => `LEDGER_${c.id}`);

        const { data: existingLinks } = await db
          .from('payment_links')
          .select('id, merchant_transaction_id, amount, status')
          .in('merchant_transaction_id', ledgerTxnIds);

        const linkMap = new Map((existingLinks || []).map((l: { merchant_transaction_id: string }) => [l.merchant_transaction_id, l]));
        const toInsert: Record<string, unknown>[] = [];
        const toUpdate: PromiseLike<unknown>[] = [];

        for (const contact of debtContacts) {
          const txnId = `LEDGER_${contact.id}`;
          const balance = Number(contact.pending_balance) || 0;
          const partnerName = contact.name || contact.company || 'Workshop Partner';
          const partnerPhone = contact.phone || '';
          const existing = linkMap.get(txnId) as { id: string; status: string; amount: number } | undefined;

          if (!existing) {
            toInsert.push({
              order_id: `LEDGER_${contact.id.slice(0, 8).toUpperCase()}`,
              merchant_transaction_id: txnId,
              customer_name: partnerName,
              customer_phone: partnerPhone,
              part_details: `Monthly Partner Ledger Clearance (${partnerName})`,
              amount: balance,
              status: 'PENDING',
              payment_mode: 'UPI / QR',
              created_at: nowIso,
              updated_at: nowIso,
            });
          } else if (existing.status === 'PENDING' && Number(existing.amount) !== balance) {
            toUpdate.push(
              db
                .from('payment_links')
                .update({
                  amount: balance,
                  customer_name: partnerName,
                  customer_phone: partnerPhone,
                  part_details: `Monthly Partner Ledger Clearance (${partnerName})`,
                  updated_at: nowIso,
                })
                .eq('id', existing.id)
            );
          }
        }

        if (toInsert.length > 0) {
          await db.from('payment_links').insert(toInsert);
        }
        if (toUpdate.length > 0) {
          await Promise.all(toUpdate);
        }
      }

      // Also ensure contacts with 0 balance have any pending ledger link marked PAID
      const { data: clearedContacts } = await db
        .from('contacts')
        .select('id')
        .lte('pending_balance', 0);

      if (clearedContacts && clearedContacts.length > 0) {
        const clearedTxnIds = clearedContacts.map((c: { id: string }) => `LEDGER_${c.id}`);
        await db
          .from('payment_links')
          .update({ status: 'PAID', updated_at: new Date().toISOString() })
          .in('merchant_transaction_id', clearedTxnIds)
          .eq('status', 'PENDING');
      }
    } catch (syncErr) {
      console.warn('[API /api/payments/links] Auto-sync pipeline partners warning:', syncErr);
    }

    // 2. Query payment links and metrics in parallel
    let query = db
      .from('payment_links')
      .select('id, order_id, merchant_transaction_id, customer_name, customer_phone, part_details, amount, status, phonepe_redirect_url, phonepe_transaction_id, payment_mode, paid_at, created_at')
      .order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(
        `order_id.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,part_details.ilike.%${search}%,merchant_transaction_id.ilike.%${search}%`
      );
    }

    const [linksRes, metricsRes] = await Promise.all([
      query.limit(100),
      db.from('payment_links').select('amount, status'),
    ]);

    const links = linksRes.data || [];
    const allRows = metricsRes.data || [];

    let totalCollected = 0;
    let pendingAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    const totalCount = allRows.length;

    for (const row of allRows) {
      const amt = Number(row.amount) || 0;
      if (row.status === 'PAID') {
        totalCollected += amt;
        paidCount++;
      } else if (row.status === 'PENDING') {
        pendingAmount += amt;
        pendingCount++;
      }
    }

    return NextResponse.json({
      links,
      metrics: {
        totalCollected,
        pendingAmount,
        paidCount,
        pendingCount,
        totalCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API /api/payments/links] Error:', message);
    return NextResponse.json({ error: message || 'Failed to fetch links' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { merchant_transaction_id, status } = body;

    if (!merchant_transaction_id) {
      return NextResponse.json({ error: 'merchant_transaction_id is required' }, { status: 400 });
    }

    if (!status || !['PENDING', 'PAID', 'FAILED'].includes(status)) {
      return NextResponse.json(
        { error: 'Valid status (PENDING, PAID, FAILED) is required' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // 1. Fetch current payment link
    const { data: currentLink, error: fetchErr } = await db
      .from('payment_links')
      .select('*')
      .eq('merchant_transaction_id', merchant_transaction_id)
      .single();

    if (fetchErr || !currentLink) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    const previousStatus = currentLink.status;
    const paidAmount = Number(currentLink.amount) || 0;

    // 2. Update payment link status in Supabase
    const { data: updatedLink, error: updateErr } = await db
      .from('payment_links')
      .update({
        status,
        paid_at: status === 'PAID' ? currentLink.paid_at || new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('merchant_transaction_id', merchant_transaction_id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 3. Deduct from Partner Ledger (contacts.pending_balance) when marked PAID
    if (status === 'PAID' && previousStatus !== 'PAID') {
      const customerPhone = currentLink.customer_phone?.trim();
      if (customerPhone) {
        const cleanDigits = customerPhone.replace(/[^0-9]/g, '').slice(-10);
        let contactQuery = db
          .from('contacts')
          .select('id, name, account_id, pending_balance, monthly_purchases, loyalty_tier, khata_stage');

        if (currentLink.account_id) {
          contactQuery = contactQuery.eq('account_id', currentLink.account_id);
        }

        const { data: matchingContacts } = await contactQuery.or(
          `phone.ilike.%${cleanDigits}%,phone.eq.${customerPhone}`
        );

        const contact = matchingContacts?.[0];
        if (contact) {
          const currentDue = Number(contact.pending_balance) || 0;
          const newDue = Math.max(0, currentDue - paidAmount);

          await db
            .from('contacts')
            .update({
              pending_balance: newDue,
              khata_stage: newDue === 0 ? 'Settled This Month' : contact.khata_stage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', contact.id);

          // Log entry into mechanic_ledger_entries for complete audit trail
          try {
            await db.from('mechanic_ledger_entries').insert({
              account_id: currentLink.account_id || contact.account_id,
              contact_id: contact.id,
              entry_type: 'debit_payment',
              amount: paidAmount,
              payment_mode: currentLink.payment_mode || 'UPI',
              reference_id: merchant_transaction_id,
              description: `Payment marked PAID via /payments for Order #${currentLink.order_id}`,
            });
          } catch (ledgerErr) {
            console.warn('[PATCH /api/payments/links] Ledger insert warning:', ledgerErr);
          }
        }
      }
    }

    // 4. Recalculate metrics
    const { data: allRows } = await db.from('payment_links').select('amount, status');

    let totalCollected = 0;
    let pendingAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    const totalCount = allRows?.length || 0;

    if (allRows) {
      for (const row of allRows) {
        const amt = Number(row.amount) || 0;
        if (row.status === 'PAID') {
          totalCollected += amt;
          paidCount++;
        } else if (row.status === 'PENDING') {
          pendingAmount += amt;
          pendingCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      link: updatedLink,
      metrics: {
        totalCollected,
        pendingAmount,
        paidCount,
        pendingCount,
        totalCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PATCH /api/payments/links] Error:', message);
    return NextResponse.json(
      { error: message || 'Failed to update payment link status' },
      { status: 500 }
    );
  }
}
