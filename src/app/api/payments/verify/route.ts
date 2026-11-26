import { NextResponse } from 'next/server'
import { verifyAndSyncPaymentStatus, getPaymentLinkByTxnId } from '@/lib/payments/razorpay'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const txnId = searchParams.get('txnId')

    if (!txnId || !txnId.trim()) {
      return NextResponse.json({ error: 'Transaction ID (txnId) is required' }, { status: 400 })
    }

    const cleanTxnId = txnId.trim()
    const result = await verifyAndSyncPaymentStatus(cleanTxnId)

    const record = result.record || (await getPaymentLinkByTxnId(cleanTxnId))

    return NextResponse.json({
      success: true,
      status: result.status,
      merchantTransactionId: cleanTxnId,
      orderId: record?.order_id,
      amount: record?.amount,
      paidAmount: record?.paid_amount !== undefined ? record.paid_amount : (record?.status === 'PAID' ? record?.amount : 0),
      remainingAmount: record?.remaining_amount !== undefined ? record.remaining_amount : (record?.status === 'PAID' ? 0 : record?.amount),
      customerName: record?.customer_name,
      partDetails: record?.part_details,
      paymentMode: record?.payment_mode,
      razorpayPaymentId: record?.razorpay_payment_id || record?.phonepe_transaction_id,
      paidAt: record?.paid_at,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API /api/payments/verify] Error:', message)
    return NextResponse.json({ error: message || 'Failed to verify transaction' }, { status: 500 })
  }
}
