/**
 * src/app/api/razorpay/create-link/route.ts
 *
 * Creates live Razorpay Payment Links in INR for Best Auto Parts customers & mechanics.
 * - Uses RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from process.env (via createRazorpayPaymentLink)
 * - Accepts amount, customer_name, customer_phone, description, ledger_id, order_id, notes
 * - Saves initial record in Supabase public.razorpay_payments table with status 'created'
 * - Returns { success: true, short_url, payment_link_id, order_id, ledger_id, amount, currency: 'INR' }
 */

import { NextResponse } from 'next/server';
import { createRazorpayPaymentLink } from '@/lib/payments/razorpay';

export const dynamic = 'force-dynamic';

export interface CreateLinkBody {
  amount: number;
  customer_name?: string;
  customerName?: string;
  customer_phone?: string;
  customerPhone?: string;
  description?: string;
  partDetails?: string;
  ledger_id?: string;
  ledgerId?: string;
  order_id?: string;
  orderId?: string;
  notes?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const body: CreateLinkBody = await request.json().catch(() => ({} as CreateLinkBody));

    const amount = Number(body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid positive payment amount is required' },
        { status: 400 }
      );
    }

    const customerName = (body.customer_name || body.customerName || 'Valued Customer').trim();
    const customerPhone = (body.customer_phone || body.customerPhone || '').trim();
    const description = (
      body.description ||
      body.partDetails ||
      'Two-Wheeler Spare Parts Order'
    ).trim();
    const orderId = (body.order_id || body.orderId || '').trim();
    const ledgerId = (body.ledger_id || body.ledgerId || '').trim();

    const linkResult = await createRazorpayPaymentLink({
      amount,
      customer_name: customerName,
      customer_phone: customerPhone,
      description,
      order_id: orderId || undefined,
      ledger_id: ledgerId || undefined,
      notes: {
        ...(body.notes || {}),
        customer_name: customerName,
        customer_phone: customerPhone,
        ledger_id: ledgerId,
        order_id: orderId,
      },
    });

    return NextResponse.json({
      success: true,
      short_url: linkResult.shortUrl,
      payment_link_id: linkResult.paymentLinkId,
      order_id: linkResult.orderId,
      ledger_id: ledgerId || null,
      amount: linkResult.amount,
      currency: 'INR',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/razorpay/create-link] Error:', message);
    return NextResponse.json(
      { error: message || 'Failed to create Razorpay payment link' },
      { status: 500 }
    );
  }
}
