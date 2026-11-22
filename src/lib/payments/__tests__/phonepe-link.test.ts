import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import {
  generatePayChecksum,
  generateStatusChecksum,
  verifyWebhookChecksum,
  generateMerchantTransactionId,
  createPhonePePaymentLink,
  getPaymentLinkByTxnId,
  markPaymentAsPaid,
  verifyAndSyncPaymentStatus,
  deductStockForPaidOrder,
} from '../phonepe-link'

// Mock supabaseAdmin
vi.mock('@/lib/flows/admin-client', () => {
  const createChainable = () => {
    const chain: any = {
      eq: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    return chain
  }

  return {
    supabaseAdmin: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn(() => createChainable()),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })),
  }
})

// Mock engineSendText
vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ success: true, messageId: 'wamid_123' }),
}))

describe('PhonePe Payment Link Module', () => {
  const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399'
  const saltIndex = '1'
  const merchantId = 'PGTESTPAYUAT'

  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/pg/v1/pay')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            code: 'PAYMENT_INITIATED',
            message: 'Payment initiated successfully',
            data: {
              merchantId: 'PGTESTPAYUAT',
              merchantTransactionId: 'BAP_ORD_1001_TEST',
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
            code: 'PAYMENT_SUCCESS',
            message: 'Payment Successful',
            data: {
              merchantId: 'PGTESTPAYUAT',
              merchantTransactionId: 'BAP_TEST_TXN',
              transactionId: 'T2401011200000001',
              amount: 25000,
              state: 'COMPLETED',
              responseCode: 'SUCCESS',
              paymentInstrument: {
                type: 'UPI',
                utr: '987654321098',
              },
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

  describe('Checksum Generation & Verification', () => {
    it('generatePayChecksum generates correct SHA256 checksum with salt index', () => {
      const payload = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64')
      const checksum = generatePayChecksum(payload, saltKey, saltIndex)

      const expectedHash = crypto
        .createHash('sha256')
        .update(`${payload}/pg/v1/pay${saltKey}`)
        .digest('hex')
      const expected = `${expectedHash}###${saltIndex}`

      expect(checksum).toBe(expected)
      expect(checksum.endsWith('###1')).toBe(true)
    })

    it('generateStatusChecksum generates correct status verification checksum', () => {
      const txnId = 'BAP_ORD1001_1700000000'
      const checksum = generateStatusChecksum(merchantId, txnId, saltKey, saltIndex)

      const expectedHash = crypto
        .createHash('sha256')
        .update(`/pg/v1/status/${merchantId}/${txnId}${saltKey}`)
        .digest('hex')
      const expected = `${expectedHash}###${saltIndex}`

      expect(checksum).toBe(expected)
      expect(checksum).toContain('###1')
    })

    it('verifyWebhookChecksum returns true for valid response checksum', () => {
      const responsePayload = Buffer.from(
        JSON.stringify({
          success: true,
          code: 'PAYMENT_SUCCESS',
          data: { merchantTransactionId: 'BAP_TEST_123' },
        })
      ).toString('base64')

      const validHash = crypto
        .createHash('sha256')
        .update(`${responsePayload}${saltKey}`)
        .digest('hex')
      const validXVerify = `${validHash}###${saltIndex}`

      const isValid = verifyWebhookChecksum(responsePayload, validXVerify, saltKey, saltIndex)
      expect(isValid).toBe(true)
    })

    it('verifyWebhookChecksum returns false for invalid checksum or tampered payload', () => {
      const responsePayload = Buffer.from(JSON.stringify({ success: true })).toString('base64')
      const invalidXVerify = 'fakehash123###1'

      expect(verifyWebhookChecksum(responsePayload, invalidXVerify, saltKey, saltIndex)).toBe(false)
      expect(verifyWebhookChecksum('', invalidXVerify, saltKey, saltIndex)).toBe(false)
      expect(verifyWebhookChecksum(responsePayload, '', saltKey, saltIndex)).toBe(false)
    })
  })

  describe('Merchant Transaction ID Generation', () => {
    it('generates unique IDs prefixed with BAP_ and sanitized orderId', () => {
      const id1 = generateMerchantTransactionId('ORD-9021')
      const id2 = generateMerchantTransactionId('ORD-9021')

      expect(id1).toMatch(/^BAP_ORD_9021_\d+_[A-F0-9]{4}$/)
      expect(id2).toMatch(/^BAP_ORD_9021_\d+_[A-F0-9]{4}$/)
      expect(id1).not.toBe(id2) // uniqueness check
    })

    it('generates fallback order ID when orderId is omitted', () => {
      const id = generateMerchantTransactionId()
      expect(id).toMatch(/^BAP_ORD_/)
    })
  })

  describe('createPhonePePaymentLink', () => {
    it('creates a payment link and caches the record with status PENDING', async () => {
      // Mock PhonePe /pg/v1/pay API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          code: 'PAYMENT_INITIATED',
          message: 'Payment initiated successfully',
          data: {
            merchantId: 'PGTESTPAYUAT',
            merchantTransactionId: 'BAP_ORD_1001_TEST',
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

      const result = await createPhonePePaymentLink({
        orderId: 'ORD_1001',
        customerName: 'Ahmad Khan',
        customerPhone: '+919634722174',
        partDetails: 'Brake Disc Caliper',
        amount: 850,
      })

      expect(result.success).toBe(true)
      expect(result.amount).toBe(850)
      expect(result.paymentLink).toContain('/pay/BAP_')
      expect(result.phonePeRedirectUrl).toContain('mercury-uat.phonepe.com')

      // Verify cached record
      const record = await getPaymentLinkByTxnId(result.merchantTransactionId)
      expect(record).not.toBeNull()
      expect(record?.status).toBe('PENDING')
      expect(record?.amount).toBe(850)
      expect(record?.customer_name).toBe('Ahmad Khan')
      expect(record?.part_details).toBe('Brake Disc Caliper')
    })

    it('handles PhonePe API sandbox fallback gracefully when fetch returns error', async () => {
      // Mock network error or non-200
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false }),
        text: async () => 'Internal Server Error',
      } as unknown as Response)

      const result = await createPhonePePaymentLink({
        orderId: 'ORD_FALLBACK',
        customerPhone: '+919634722174',
        partDetails: 'Engine Oil Filter',
        amount: 320,
      })

      expect(result.success).toBe(true)
      expect(result.amount).toBe(320)
      expect(result.phonePeRedirectUrl).toContain('simulated=true')
    })
  })

  describe('markPaymentAsPaid', () => {
    it('updates status to PAID and sets payment details', async () => {
      const created = await createPhonePePaymentLink({
        orderId: 'ORD_PAID_TEST',
        customerName: 'Sanjay',
        customerPhone: '+919634722174',
        partDetails: 'Spark Plug Set',
        amount: 450,
      })

      const updated = await markPaymentAsPaid({
        merchantTransactionId: created.merchantTransactionId,
        phonepeTransactionId: 'PP_TEST_998877',
        paymentMode: 'UPI_COLLECT',
      })

      expect(updated).not.toBeNull()
      expect(updated?.status).toBe('PAID')
      expect(updated?.phonepe_transaction_id).toBe('PP_TEST_998877')
      expect(updated?.payment_mode).toBe('UPI_COLLECT')
      expect(updated?.paid_at).toBeDefined()
    })
  })

  describe('verifyAndSyncPaymentStatus', () => {
    it('queries PhonePe status API and updates record on PAYMENT_SUCCESS', async () => {
      const created = await createPhonePePaymentLink({
        orderId: 'ORD_VERIFY_TEST',
        customerPhone: '+919634722174',
        partDetails: 'Clutch Cable',
        amount: 250,
      })

      // Mock Status API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          code: 'PAYMENT_SUCCESS',
          message: 'Payment Successful',
          data: {
            merchantId: 'PGTESTPAYUAT',
            merchantTransactionId: created.merchantTransactionId,
            transactionId: 'T2401011200000001',
            amount: 25000,
            state: 'COMPLETED',
            responseCode: 'SUCCESS',
            paymentInstrument: {
              type: 'UPI',
              utr: '987654321098',
            },
          },
        }),
      } as unknown as Response)

      const result = await verifyAndSyncPaymentStatus(created.merchantTransactionId)
      expect(result.status).toBe('PAID')
      expect(result.record?.phonepe_transaction_id).toBe('T2401011200000001')
      expect(result.record?.payment_mode).toBe('UPI')
    })
  })

  describe('deductStockForPaidOrder', () => {
    it('handles empty part details gracefully', async () => {
      const res = await deductStockForPaidOrder({
        order_id: 'ORD_EMPTY',
        merchant_transaction_id: 'BAP_EMPTY_1',
        customer_phone: '+919634722174',
        part_details: '',
        amount: 100,
        status: 'PAID',
      })
      expect(res.deducted).toBe(false)
    })

    it('matches part and executes stock deduction and audit trail', async () => {
      const mockDb: any = {
        from: vi.fn((table: string) => {
          if (table === 'parts_catalog') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockReturnThis(),
                ilike: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'part-uuid-123',
                        account_id: 'acc-uuid-1',
                        part_name: 'Hero Splendor Brake Shoe',
                        oem_number: '43125-KCC-900',
                        quantity_in_stock: 12,
                        low_stock_threshold: 4,
                      },
                    ],
                  }),
                }),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            }
          }
          if (table === 'stock_movements') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          if (table === 'accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { owner_user_id: 'user-uuid-99' },
                  }),
                }),
              })),
            }
          }
          if (table === 'notifications') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      const res = await deductStockForPaidOrder(
        {
          order_id: 'ORD_STOCK_TEST',
          merchant_transaction_id: 'BAP_STOCK_1',
          customer_phone: '+919634722174',
          part_details: 'Hero Splendor Brake Shoe (Genuine)',
          amount: 220,
          status: 'PAID',
        },
        mockDb
      )

      expect(res.deducted).toBe(true)
      expect(res.partId).toBe('part-uuid-123')
      expect(res.remainingStock).toBe(11)
      expect(mockDb.from).toHaveBeenCalledWith('parts_catalog')
      expect(mockDb.from).toHaveBeenCalledWith('stock_movements')
    })
  })
})
