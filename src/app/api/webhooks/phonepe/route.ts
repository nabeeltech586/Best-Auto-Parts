import { NextResponse } from 'next/server'
import {
  getPhonePeConfig,
  verifyWebhookChecksum,
  markPaymentAsPaid,
} from '@/lib/payments/phonepe-link'

export async function POST(request: Request) {
  try {
    const xVerify = request.headers.get('x-verify') || request.headers.get('X-VERIFY')
    if (!xVerify) {
      console.warn('[PhonePe Webhook] Missing x-verify header')
      return NextResponse.json({ error: 'Missing x-verify header' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || !body.response) {
      console.warn('[PhonePe Webhook] Missing response body')
      return NextResponse.json({ error: 'Missing response body' }, { status: 400 })
    }

    const { saltKey, saltIndex } = getPhonePeConfig()
    const isValid = verifyWebhookChecksum(body.response, xVerify, saltKey, saltIndex)

    if (!isValid) {
      console.warn('[PhonePe Webhook] Invalid checksum verification failed')
      return NextResponse.json({ error: 'Invalid checksum' }, { status: 401 })
    }

    // Decode base64 payload
    const decodedString = Buffer.from(body.response, 'base64').toString('utf8')
    const payload = JSON.parse(decodedString)

    console.log('[PhonePe Webhook] Received event code:', payload.code, 'merchantTransactionId:', payload.data?.merchantTransactionId)

    if (payload.code === 'PAYMENT_SUCCESS' && payload.data?.merchantTransactionId) {
      const merchantTransactionId = payload.data.merchantTransactionId
      const phonepeTransactionId = payload.data.transactionId
      const paymentMode = payload.data.paymentInstrument?.type || 'UPI'

      await markPaymentAsPaid({
        merchantTransactionId,
        phonepeTransactionId,
        paymentMode,
      })

      return NextResponse.json({
        success: true,
        message: 'Payment verified and recorded successfully',
        merchantTransactionId,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Event processed: ${payload.code}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PhonePe Webhook] Unexpected error:', message)
    return NextResponse.json({ error: message || 'Webhook processing failed' }, { status: 500 })
  }
}
