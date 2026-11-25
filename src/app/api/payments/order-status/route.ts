import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderParam = searchParams.get('order')?.trim();
    const phoneParam = searchParams.get('phone')?.trim();
    const amountParam = searchParams.get('amount')?.trim();
    const fallbackAmount = Math.max(1, Number(amountParam) || 0);

    if (!orderParam && !phoneParam) {
      return NextResponse.json(
        { error: 'Order ID or phone number is required' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const ord = orderParam || '';

    // 1. Check in payment_links
    let existingLink = null;
    if (ord) {
      const { data: linkByOrd } = await db
        .from('payment_links')
        .select('*')
        .or(`order_id.eq.${ord},merchant_transaction_id.eq.${ord}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (linkByOrd) {
        existingLink = linkByOrd;
      }
    }

    if (existingLink) {
      const rawTotal = Number(existingLink.amount) || fallbackAmount || 340;
      let rawPaid =
        existingLink.paid_amount !== undefined && existingLink.paid_amount !== null
          ? Number(existingLink.paid_amount)
          : existingLink.status === 'PAID'
          ? rawTotal
          : 0;

      let rawRemaining =
        existingLink.remaining_amount !== undefined && existingLink.remaining_amount !== null
          ? Number(existingLink.remaining_amount)
          : Math.max(0, rawTotal - rawPaid);

      let effectiveStatus = existingLink.status;
      if (effectiveStatus === 'PAID' || rawRemaining <= 0) {
        effectiveStatus = 'PAID';
        rawPaid = rawTotal;
        rawRemaining = 0;
      } else if (effectiveStatus === 'PARTIAL' || (rawPaid > 0 && rawRemaining > 0)) {
        effectiveStatus = 'PARTIAL';
      } else {
        effectiveStatus = 'PENDING';
        rawPaid = 0;
        rawRemaining = rawTotal;
      }

      const res = NextResponse.json({
        success: true,
        source: 'payment_links',
        orderId: existingLink.order_id || ord,
        merchantTransactionId: existingLink.merchant_transaction_id,
        customerName: existingLink.customer_name || 'Valued Customer',
        customerPhone: existingLink.customer_phone || phoneParam || '',
        itemDescription: existingLink.part_details || 'Motorcycle Genuine Spare Parts',
        totalAmount: rawTotal,
        paidAmount: rawPaid,
        remainingAmount: rawRemaining,
        status: effectiveStatus,
        paymentMode: existingLink.payment_mode || 'UPI / QR',
        referenceId: existingLink.phonepe_transaction_id || 'VERIFIED',
        paidAt: existingLink.paid_at || null,
        createdAt: existingLink.created_at,
      });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res;
    }

    // 2. Check in orders table
    if (ord) {
      try {
        const { data: orderData } = await db
          .from('orders')
          .select('id, total_amount, order_status, metadata, created_at, updated_at, contact_id')
          .or(`id.eq.${ord},metadata->>order_id.eq.${ord}`)
          .maybeSingle();

        if (orderData) {
          const rawTotal = Number(orderData.total_amount) || fallbackAmount || 340;
          const isPaid = orderData.order_status === 'paid' || orderData.order_status === 'completed';

          let customerName = 'Valued Customer';
          let customerPhone = phoneParam || '';
          if (orderData.contact_id) {
            const { data: contact } = await db
              .from('contacts')
              .select('name, phone')
              .eq('id', orderData.contact_id)
              .maybeSingle();
            if (contact) {
              customerName = contact.name || customerName;
              customerPhone = contact.phone || customerPhone;
            }
          }

          const res = NextResponse.json({
            success: true,
            source: 'orders',
            orderId: ord,
            merchantTransactionId: ord,
            customerName,
            customerPhone,
            itemDescription: 'Motorcycle Genuine Spare Parts',
            totalAmount: rawTotal,
            paidAmount: isPaid ? rawTotal : 0,
            remainingAmount: isPaid ? 0 : rawTotal,
            status: isPaid ? 'PAID' : 'PENDING',
            paymentMode: 'UPI / QR',
            referenceId: 'VERIFIED',
            paidAt: isPaid ? orderData.updated_at || orderData.created_at : null,
            createdAt: orderData.created_at,
          });
          res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          return res;
        }
      } catch {
        // Fallback
      }
    }

    // 3. Check in contacts table if ledger clearance (LEDGER_...) or by phone
    if (phoneParam || ord.startsWith('LEDGER_')) {
      try {
        let contactMatch = null;
        if (ord.startsWith('LEDGER_')) {
          const contactIdFragment = ord.replace('LEDGER_', '').toLowerCase();
          const { data: contacts } = await db
            .from('contacts')
            .select('id, name, phone, pending_balance, updated_at')
            .ilike('id', `${contactIdFragment}%`);
          if (contacts && contacts.length > 0) {
            contactMatch = contacts[0];
          }
        }

        if (!contactMatch && phoneParam) {
          const digits = phoneParam.replace(/[^0-9]/g, '').slice(-10);
          if (digits) {
            const { data: contacts } = await db
              .from('contacts')
              .select('id, name, phone, pending_balance, updated_at')
              .or(`phone.ilike.%${digits}%,phone.eq.${phoneParam}`);
            if (contacts && contacts.length > 0) {
              contactMatch = contacts[0];
            }
          }
        }

        if (contactMatch) {
          const pendingBalance = Number(contactMatch.pending_balance) || 0;
          const originalAmount = fallbackAmount || (pendingBalance > 0 ? pendingBalance : 340);

          if (pendingBalance <= 0) {
            const res = NextResponse.json({
              success: true,
              source: 'contacts_settled',
              orderId: ord || `LEDGER_${contactMatch.id.slice(0, 8).toUpperCase()}`,
              merchantTransactionId: `LEDGER_${contactMatch.id}`,
              customerName: contactMatch.name || 'Workshop Partner',
              customerPhone: contactMatch.phone || phoneParam || '',
              itemDescription: 'Monthly Partner Ledger Clearance',
              totalAmount: originalAmount,
              paidAmount: originalAmount,
              remainingAmount: 0,
              status: 'PAID',
              paymentMode: 'UPI / QR',
              referenceId: 'LEDGER_SETTLED',
              paidAt: contactMatch.updated_at || new Date().toISOString(),
              createdAt: contactMatch.updated_at || new Date().toISOString(),
            });
            res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res;
          } else if (fallbackAmount > 0 && pendingBalance < fallbackAmount) {
            // Partial payment detected
            const paid = Math.max(0, fallbackAmount - pendingBalance);
            const res = NextResponse.json({
              success: true,
              source: 'contacts_partial',
              orderId: ord || `LEDGER_${contactMatch.id.slice(0, 8).toUpperCase()}`,
              merchantTransactionId: `LEDGER_${contactMatch.id}`,
              customerName: contactMatch.name || 'Workshop Partner',
              customerPhone: contactMatch.phone || phoneParam || '',
              itemDescription: 'Monthly Partner Ledger Clearance',
              totalAmount: fallbackAmount,
              paidAmount: paid,
              remainingAmount: pendingBalance,
              status: 'PARTIAL',
              paymentMode: 'UPI / QR',
              referenceId: 'PARTIAL_BALANCE',
              paidAt: contactMatch.updated_at || null,
              createdAt: contactMatch.updated_at || new Date().toISOString(),
            });
            res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res;
          }
        }
      } catch {
        // Fallback
      }
    }

    // 4. Default / Fallback: Unpaid / Pending record
    const res = NextResponse.json({
      success: true,
      source: 'fallback',
      orderId: ord || 'BAP-ORDER',
      merchantTransactionId: ord || 'BAP-ORDER',
      customerName: 'Valued Customer',
      customerPhone: phoneParam || '+91 96347 22174',
      itemDescription: 'Motorcycle Genuine Spare Parts',
      totalAmount: fallbackAmount || 340,
      paidAmount: 0,
      remainingAmount: fallbackAmount || 340,
      status: 'PENDING',
      paymentMode: 'UPI / QR',
      referenceId: 'PENDING',
      paidAt: null,
      createdAt: new Date().toISOString(),
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/payments/order-status] Error:', msg);
    return NextResponse.json(
      { error: msg || 'Failed to fetch payment status' },
      { status: 500 }
    );
  }
}
