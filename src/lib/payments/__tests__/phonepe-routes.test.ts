import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { POST as createLinkHandler } from '@/app/api/payments/create-link/route'
import { GET as verifyHandler } from '@/app/api/payments/verify/route'
import { POST as webhookHandler } from '@/app/api/webhooks/phonepe/route'
import { getPhonePeConfig } from '../phonepe-link'

// Mock supabaseAdmin
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        limit: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  })),
}))

// Mock engineSendText
vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ success: true }),
}))

describe('PhonePe API Route Endpoints', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/pg/v1/pay')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            code: 'PAYMENT_INITIATED',
            data: {
              merchantId: 'PGTESTPAYUAT',
              merchantTransactionId: 'BAP_TEST_TXN',
              instrumentResponse: {
                type: 'PAY_PAGE',
                redirectInfo: {
                  url: 'https://mercury-uat.phonepe.com/transact/simulator?token=TEST1234',
                  method: 'GET',
                },
              },
            },
          }),
        } as unknown as Response)
      }
      if (url.includes('/pg/v1/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            code: 'PAYMENT_PENDING',
            data: {
              merchantId: 'PGTESTPAYUAT',
              merchantTransactionId: 'BAP_ORD_TEST_123',
              state: 'PENDING',
            },
          }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response)
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })
  describe('POST /api/payments/create-link', () => {
    it('returns 400 when customerPhone is missing', async () => {
      const req = new Request('http://localhost:3000/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partDetails: 'Headlight Assembly',
          amount: 1200,
        }),
      })

      const res = await createLinkHandler(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain('Customer phone')
    })

    it('returns 400 when partDetails is missing', async () => {
      const req = new Request('http://localhost:3000/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: '+919634722174',
          amount: 1200,
        }),
      })

      const res = await createLinkHandler(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain('Part / item details')
    })

    it('returns 400 when amount is non-positive or invalid', async () => {
      const req = new Request('http://localhost:3000/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: '+919634722174',
          partDetails: 'Brake Disc',
          amount: -50,
        }),
      })

      const res = await createLinkHandler(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain('Valid positive amount')
    })

    it('returns 200 with paymentLink on valid input', async () => {
      const req = new Request('http://localhost:3000/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 'ORD_2001',
          customerName: 'Bilal',
          customerPhone: '+919634722174',
          partDetails: 'Brake Shoes',
          amount: 350,
        }),
      })

      const res = await createLinkHandler(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.paymentLink).toContain('/pay/BAP_')
      expect(data.amount).toBe(350)
    })
  })

  describe('GET /api/payments/verify', () => {
    it('returns 400 when txnId is missing', async () => {
      const req = new Request('http://localhost:3000/api/payments/verify')
      const res = await verifyHandler(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain('Transaction ID')
    })

    it('returns 200 with status when txnId is provided', async () => {
      const req = new Request('http://localhost:3000/api/payments/verify?txnId=BAP_ORD_TEST_123')
      const res = await verifyHandler(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.merchantTransactionId).toBe('BAP_ORD_TEST_123')
      expect(['PENDING', 'PAID', 'FAILED']).toContain(data.status)
    })
  })

  describe('POST /api/webhooks/phonepe', () => {
    const { saltKey, saltIndex } = getPhonePeConfig()

    it('returns 401 if x-verify header is missing', async () => {
      const req = new Request('http://localhost:3000/api/webhooks/phonepe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'test' }),
      })

      const res = await webhookHandler(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toContain('Missing x-verify header')
    })

    it('returns 401 if x-verify signature verification fails', async () => {
      const req = new Request('http://localhost:3000/api/webhooks/phonepe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-verify': 'invalidsignature###1',
        },
        body: JSON.stringify({ response: Buffer.from('test').toString('base64') }),
      })

      const res = await webhookHandler(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toContain('Invalid checksum')
    })

    it('returns 200 and processes payment on valid checksum and PAYMENT_SUCCESS payload', async () => {
      const callbackJson = JSON.stringify({
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment Successful',
        data: {
          merchantId: 'PGTESTPAYUAT',
          merchantTransactionId: 'BAP_WEBHOOK_TEST_1',
          transactionId: 'T24010199999',
          amount: 50000,
          state: 'COMPLETED',
          responseCode: 'SUCCESS',
          paymentInstrument: {
            type: 'UPI',
            utr: '123456789012',
          },
        },
      })
      const base64Response = Buffer.from(callbackJson).toString('base64')

      const hash = crypto.createHash('sha256').update(`${base64Response}${saltKey}`).digest('hex')
      const xVerify = `${hash}###${saltIndex}`

      const req = new Request('http://localhost:3000/api/webhooks/phonepe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-verify': xVerify,
        },
        body: JSON.stringify({ response: base64Response }),
      })

      const res = await webhookHandler(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.merchantTransactionId).toBe('BAP_WEBHOOK_TEST_1')
    })
  })
})
