import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  encodePartialMetadata,
  stripPartialMetadataTag,
  parsePaymentAmountsAndStatus,
} from '@/lib/payments/partial-metadata';

/**
 * Helper to fetch all supplier (Distributor & Wholesaler) phone numbers and contact IDs
 * so buying / supplier restock dues never mix with customer / mechanic sales collections.
 */
async function getSupplierIdentifiers(db: ReturnType<typeof supabaseAdmin>) {
  try {
    let supplierContacts: Array<{ id?: string; phone?: string | null }> = [];
    try {
      const { data } = await db
        .from('contacts')
        .select('id, phone, category')
        .in('category', ['Distributor', 'Wholesaler']);
      supplierContacts = (data as Array<{ id?: string; phone?: string | null }>) || [];
    } catch {
      supplierContacts = [];
    }

    let distributorsData: Array<{ whatsapp_number?: string | null; phone?: string | null }> = [];
    try {
      const { data } = await db.from('distributors').select('whatsapp_number, phone');
      distributorsData =
        (data as Array<{ whatsapp_number?: string | null; phone?: string | null }>) || [];
    } catch {
      distributorsData = [];
    }

    const supplierIds = new Set<string>();
    const supplierPhones = new Set<string>();

    for (const c of supplierContacts) {
      if (c?.id) supplierIds.add(String(c.id));
      if (c?.phone) {
        const digits = String(c.phone).replace(/[^0-9]/g, '').slice(-10);
        if (digits) supplierPhones.add(digits);
      }
    }

    for (const d of distributorsData) {
      const p = d?.whatsapp_number || d?.phone;
      if (p) {
        const digits = String(p).replace(/[^0-9]/g, '').slice(-10);
        if (digits) supplierPhones.add(digits);
      }
    }

    return { supplierIds, supplierPhones };
  } catch (err) {
    console.warn('[getSupplierIdentifiers] Warning fetching suppliers:', err);
    return { supplierIds: new Set<string>(), supplierPhones: new Set<string>() };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const categoryParam = searchParams.get('category')?.trim();

    const db = supabaseAdmin();

    const { supplierIds, supplierPhones } = await getSupplierIdentifiers(db);

    // 1. Initial / On-Load Sync: Auto-sync any Pipeline Customer or Mechanic with balance_due > 0
    try {
      const { data: debtContacts } = await db
        .from('contacts')
        .select('id, name, phone, company, pending_balance, category')
        .gt('pending_balance', 0);

      const customerMechanicDebts = (debtContacts || []).filter((c: { id: string; phone?: string | null; category?: string | null }) => {
        if (c.category === 'Distributor' || c.category === 'Wholesaler') return false;
        if (supplierIds.has(c.id)) return false;
        if (c.phone) {
          const digits = c.phone.replace(/[^0-9]/g, '').slice(-10);
          if (supplierPhones.has(digits)) return false;
        }
        return true;
      });

      if (customerMechanicDebts.length > 0) {
        const nowIso = new Date().toISOString();
        const ledgerTxnIds = customerMechanicDebts.map((c: { id: string }) => `LEDGER_${c.id}`);

        const { data: existingLinks } = await db
          .from('payment_links')
          .select('id, merchant_transaction_id, amount, status')
          .in('merchant_transaction_id', ledgerTxnIds);

        const linkMap = new Map((existingLinks || []).map((l: { merchant_transaction_id: string }) => [l.merchant_transaction_id, l]));
        const toInsert: Record<string, unknown>[] = [];
        const toUpdate: PromiseLike<unknown>[] = [];

        for (const contact of customerMechanicDebts) {
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

      // Also ensure customer/mechanic contacts with 0 balance have any pending ledger link marked PAID
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
      console.warn('[API /api/payments/links] Auto-sync customer/mechanic partners warning:', syncErr);
    }

    // 2. Query contacts to attach role (Mechanic vs Customer)
    const { data: contactsData } = await db
      .from('contacts')
      .select('id, name, phone, company, category, unique_code');

    const categoryByPhone = new Map<string, 'Mechanic' | 'Customer'>();
    const categoryById = new Map<string, 'Mechanic' | 'Customer'>();

    for (const c of contactsData || []) {
      if (c.category === 'Distributor' || c.category === 'Wholesaler') continue;
      const cat = c.category === 'Mechanic' ? 'Mechanic' : 'Customer';
      if (c.id) categoryById.set(c.id, cat);
      if (c.phone) {
        const digits = c.phone.replace(/[^0-9]/g, '').slice(-10);
        if (digits) categoryByPhone.set(digits, cat);
      }
    }

    let query = db
      .from('payment_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
      if (status === 'PENDING') {
        query = query.in('status', ['PENDING', 'PARTIAL']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (search) {
      const searchConditions = [
        `order_id.ilike.%${search}%`,
        `customer_name.ilike.%${search}%`,
        `customer_phone.ilike.%${search}%`,
        `part_details.ilike.%${search}%`,
        `merchant_transaction_id.ilike.%${search}%`,
      ];

      // If search is a unique contact code, resolve partner details
      if (/^BAP-/i.test(search)) {
        try {
          const { data: matchedContact } = await db
            .from('contacts')
            .select('name, phone, company')
            .ilike('unique_code', `%${search}%`)
            .maybeSingle();

          if (matchedContact) {
            if (matchedContact.phone) searchConditions.push(`customer_phone.ilike.%${matchedContact.phone}%`);
            if (matchedContact.name) searchConditions.push(`customer_name.ilike.%${matchedContact.name}%`);
            if (matchedContact.company) searchConditions.push(`customer_name.ilike.%${matchedContact.company}%`);
          }
        } catch {
          // Non-critical optimization
        }
      }

      query = query.or(searchConditions.join(','));
    }

    const [linksRes, allRowsRes] = await Promise.all([
      query.limit(200),
      db.from('payment_links').select('*'),
    ]);

    const rawLinks = linksRes.data || [];
    const allRows = allRowsRes.data || [];

    // Filter out supplier entries and tag contact_category
    const enrichAndFilter = (item: {
      merchant_transaction_id?: string | null;
      customer_phone?: string | null;
      customer_name?: string | null;
      part_details?: string | null;
    }) => {
      // Exclude if merchant_transaction_id belongs to a distributor/wholesaler
      if (item.merchant_transaction_id?.startsWith('LEDGER_')) {
        const contactId = item.merchant_transaction_id.replace('LEDGER_', '');
        if (supplierIds.has(contactId)) return null;
      }

      // Exclude if customer_phone belongs to a distributor/wholesaler
      const cleanDigits = (item.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);
      if (cleanDigits && supplierPhones.has(cleanDigits)) {
        return null;
      }

      // Determine category (Mechanic vs Customer)
      let contactCategory: 'Mechanic' | 'Customer' = 'Customer';
      if (item.merchant_transaction_id?.startsWith('LEDGER_')) {
        const contactId = item.merchant_transaction_id.replace('LEDGER_', '');
        if (categoryById.has(contactId)) {
          contactCategory = categoryById.get(contactId)!;
        }
      }

      if (contactCategory === 'Customer' && cleanDigits && categoryByPhone.has(cleanDigits)) {
        contactCategory = categoryByPhone.get(cleanDigits)!;
      }

      // Heuristic fallback for partner ledger / workshop names
      if (contactCategory === 'Customer') {
        const details = (item.part_details || '').toLowerCase();
        const name = (item.customer_name || '').toLowerCase();
        if (
          details.includes('partner ledger') ||
          details.includes('khata') ||
          details.includes('mechanic') ||
          name.includes('moters') ||
          name.includes('motors') ||
          name.includes('auto')
        ) {
          contactCategory = 'Mechanic';
        }
      }

      return contactCategory;
    };

    // Calculate metrics strictly across Customer and Mechanic links (excluding suppliers)
    let totalCollected = 0;
    let pendingAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let mechanicCount = 0;
    let customerCount = 0;
    let totalCount = 0;

    for (const row of allRows) {
      const cat = enrichAndFilter(row);
      if (!cat) continue; // Excluded supplier

      totalCount++;
      const parsed = parsePaymentAmountsAndStatus(row);

      if (parsed.status === 'PAID') {
        totalCollected += parsed.paidAmount;
        paidCount++;
      } else if (parsed.status === 'PARTIAL') {
        totalCollected += parsed.paidAmount;
        pendingAmount += parsed.remainingAmount;
        pendingCount++;
      } else if (parsed.status === 'PENDING') {
        pendingAmount += parsed.remainingAmount;
        pendingCount++;
      }

      if (cat === 'Mechanic') {
        mechanicCount++;
      } else {
        customerCount++;
      }
    }

    // Process returned links
    const filteredLinks: Record<string, unknown>[] = [];
    for (const link of rawLinks) {
      const cat = enrichAndFilter(link);
      if (!cat) continue; // Excluded supplier

      if (categoryParam) {
        if (categoryParam.toLowerCase() === 'mechanic' && cat !== 'Mechanic') continue;
        if (categoryParam.toLowerCase() === 'customer' && cat !== 'Customer') continue;
      }

      const parsed = parsePaymentAmountsAndStatus(link);

      filteredLinks.push({
        ...link,
        amount: parsed.totalAmount,
        paid_amount: parsed.paidAmount,
        remaining_amount: parsed.remainingAmount,
        status: parsed.status,
        part_details: stripPartialMetadataTag(link.part_details),
        contact_category: cat,
      });
    }

    return NextResponse.json({
      links: filteredLinks,
      metrics: {
        totalCollected,
        pendingAmount,
        paidCount,
        pendingCount,
        totalCount,
        mechanicCount,
        customerCount,
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

    if (!status || !['PENDING', 'PAID', 'PARTIAL', 'FAILED'].includes(status)) {
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
    const totalAmount = Number(currentLink.amount) || 0;

    const currentParsed = parsePaymentAmountsAndStatus(currentLink);
    const bodyPaidAmt =
      body.paid_amount !== undefined && body.paid_amount !== null
        ? Number(body.paid_amount)
        : currentParsed.paidAmount;
    const bodyRemAmt =
      body.remaining_amount !== undefined && body.remaining_amount !== null
        ? Number(body.remaining_amount)
        : Math.max(0, totalAmount - bodyPaidAmt);

    const nowIso = new Date().toISOString();
    const cleanItemDetails = stripPartialMetadataTag(currentLink.part_details);
    const updatedPartDetails =
      status === 'PARTIAL'
        ? `${cleanItemDetails} ${encodePartialMetadata({
            paidAmount: bodyPaidAmt,
            remainingAmount: bodyRemAmt,
            mode: body.payment_mode || currentLink.payment_mode,
            utr: body.utr || currentLink.phonepe_transaction_id,
          })}`.trim()
        : cleanItemDetails;

    const fallbackTxnId =
      status === 'PARTIAL'
        ? `PARTIAL:${bodyPaidAmt}:${bodyRemAmt}:${body.utr || currentLink.phonepe_transaction_id || ''}`
        : currentLink.phonepe_transaction_id;

    // 2. Prepare update payload
    const updatePayload: Record<string, unknown> = {
      status,
      paid_at: status === 'PAID' ? currentLink.paid_at || nowIso : currentLink.paid_at,
      updated_at: nowIso,
      part_details: updatedPartDetails,
    };

    if (status === 'PAID') {
      updatePayload.paid_amount = totalAmount;
      updatePayload.remaining_amount = 0;
    } else if (status === 'PARTIAL') {
      updatePayload.paid_amount = bodyPaidAmt;
      updatePayload.remaining_amount = bodyRemAmt;
    } else if (status === 'PENDING') {
      updatePayload.paid_amount = 0;
      updatePayload.remaining_amount = totalAmount;
    }

    let updatedLink = null;
    const { data: updData, error: updateErr } = await db
      .from('payment_links')
      .update(updatePayload)
      .eq('merchant_transaction_id', merchant_transaction_id)
      .select()
      .single();

    if (updateErr) {
      // Fallback update without new columns if needed (using 'PENDING' in DB column if constraint rejects 'PARTIAL')
      const fallbackStatus = status === 'PAID' ? 'PAID' : status === 'FAILED' ? 'FAILED' : 'PENDING';
      const { data: fbData, error: fbErr } = await db
        .from('payment_links')
        .update({
          status: fallbackStatus,
          part_details: updatedPartDetails,
          phonepe_transaction_id: fallbackTxnId,
          paid_at: status === 'PAID' ? currentLink.paid_at || nowIso : currentLink.paid_at,
          updated_at: nowIso,
        })
        .eq('merchant_transaction_id', merchant_transaction_id)
        .select()
        .single();

      if (fbErr) {
        return NextResponse.json({ error: fbErr.message }, { status: 500 });
      }
      updatedLink = {
        ...fbData,
        status,
        paid_amount: status === 'PAID' ? totalAmount : status === 'PARTIAL' ? bodyPaidAmt : 0,
        remaining_amount: status === 'PAID' ? 0 : status === 'PARTIAL' ? bodyRemAmt : totalAmount,
        part_details: cleanItemDetails,
      };
    } else {
      updatedLink = {
        ...updData,
        part_details: cleanItemDetails,
      };
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
          const newDue = Math.max(0, currentDue - totalAmount);

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
              amount: totalAmount,
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

    // 4. Recalculate metrics strictly across customer/mechanic rows
    const { supplierIds, supplierPhones } = await getSupplierIdentifiers(db);
    const { data: allRows } = await db.from('payment_links').select('amount, status, part_details, phonepe_transaction_id');

    let totalCollected = 0;
    let pendingAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let totalCount = 0;

    if (allRows) {
      for (const rawRow of allRows) {
        const row = rawRow as Record<string, unknown>;
        const txnId = typeof row.merchant_transaction_id === 'string' ? row.merchant_transaction_id : '';
        if (txnId.startsWith('LEDGER_')) {
          const contactId = txnId.replace('LEDGER_', '');
          if (supplierIds.has(contactId)) continue;
        }
        const rawPhone = typeof row.customer_phone === 'string' ? row.customer_phone : '';
        const cleanDigits = rawPhone.replace(/[^0-9]/g, '').slice(-10);
        if (cleanDigits && supplierPhones.has(cleanDigits)) continue;

        totalCount++;
        const parsed = parsePaymentAmountsAndStatus(row);

        if (parsed.status === 'PAID') {
          totalCollected += parsed.paidAmount;
          paidCount++;
        } else if (parsed.status === 'PARTIAL') {
          totalCollected += parsed.paidAmount;
          pendingAmount += parsed.remainingAmount;
          pendingCount++;
        } else if (parsed.status === 'PENDING') {
          pendingAmount += parsed.remainingAmount;
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
