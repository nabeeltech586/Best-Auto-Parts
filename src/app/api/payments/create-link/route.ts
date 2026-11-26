import { NextResponse } from 'next/server'
import { createRazorpayPaymentLink } from '@/lib/payments/razorpay'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, customerName, customerPhone, partDetails, amount, conversationId, accountId, userId } = body

    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return NextResponse.json(
        { error: 'Customer phone number is required.' },
        { status: 400 }
      )
    }

    if (!partDetails || typeof partDetails !== 'string' || !partDetails.trim()) {
      return NextResponse.json(
        { error: 'Part / item details are required.' },
        { status: 400 }
      )
    }

    const numericAmount = Number(amount)
    if (!numericAmount || Number.isNaN(numericAmount) || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: 'Valid positive amount in INR is required.' },
        { status: 400 }
      )
    }

    const result = await createRazorpayPaymentLink({
      orderId,
      customerName,
      customerPhone,
      partDetails,
      amount: numericAmount,
      conversationId,
      accountId,
      userId,
    })

    return NextResponse.json({
      success: true,
      paymentLink: result.paymentLink,
      shortUrl: result.shortUrl,
      merchantTransactionId: result.merchantTransactionId,
      orderId: result.orderId,
      amount: result.amount,
      razorpayPaymentLinkId: result.paymentLinkId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API /api/payments/create-link] Error:', message)
    return NextResponse.json(
      { error: message || 'Failed to create payment link' },
      { status: 500 }
    )
  }
}
