import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    const db = supabaseAdmin();

    let query = db
      .from('payment_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(
        `order_id.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,part_details.ilike.%${search}%,merchant_transaction_id.ilike.%${search}%`
      );
    }

    const { data: links, error } = await query.limit(100);

    if (error) {
      console.warn('[API /api/payments/links] DB error:', error.message);
      return NextResponse.json({
        links: [],
        metrics: {
          totalCollected: 0,
          pendingAmount: 0,
          paidCount: 0,
          pendingCount: 0,
          totalCount: 0,
        },
      });
    }

    // Calculate metrics
    const { data: allRows } = await db
      .from('payment_links')
      .select('amount, status');

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
      links: links || [],
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
