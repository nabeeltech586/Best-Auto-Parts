import { NextResponse } from 'next/server'
import { verifyAndSyncPaymentStatus, getPaymentLinkByTxnId } from '@/lib/payments/phonepe-link'

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
      customerName: record?.customer_name,
      partDetails: record?.part_details,
      paymentMode: record?.payment_mode,
      phonepeTransactionId: record?.phonepe_transaction_id,
      paidAt: record?.paid_at,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API /api/payments/verify] Error:', message)
    return NextResponse.json({ error: message || 'Failed to verify transaction' }, { status: 500 })
  }
}
