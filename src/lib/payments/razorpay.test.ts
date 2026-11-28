import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  getRazorpayConfig,
  createRazorpayPaymentLink,
  verifyRazorpayWebhookSignature,
  markPaymentAsPaid,
  getPaymentLinkByTxnId,
  creditBestPayLedgerBalance,
  sendWhatsAppReceiptVoucherTemplate,
  processRazorpayPaymentSuccess,
  processRazorpayPaymentFailure,
} from './razorpay';

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ success: true, messageId: 'wamid.test' }),
  engineSendInteractiveButtons: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.btn' }),
  engineSendInteractiveCtaUrl: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.cta' }),
}));

vi.mock('@/lib/inventory/stock-deduction', () => ({
  deductStockForSale: vi.fn().mockResolvedValue({
    success: true,
    deductedCount: 1,
    totalQuantityDeducted: 1,
    details: [
      {
        partId: 'part_123',
        partName: 'Hero Splendor Brake Shoe',
        sku: 'SKU-HER-001',
        quantityDeducted: 1,
        prevStock: 10,
        newStock: 9,
      },
    ],
  }),
}));

describe('Razorpay Payment Links & Webhooks Engine', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_testkey123';
    process.env.RAZORPAY_KEY_SECRET = 'testsecret456';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhooksecret789';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getRazorpayConfig', () => {
    it('returns configured keys and isConfigured flag', () => {
      const cfg = getRazorpayConfig();
      expect(cfg.keyId).toBe('rzp_test_testkey123');
      expect(cfg.keySecret).toBe('testsecret456');
      expect(cfg.webhookSecret).toBe('webhooksecret789');
      expect(cfg.isConfigured).toBe(true);
    });
  });

  describe('verifyRazorpayWebhookSignature', () => {
    it('correctly verifies a valid HMAC SHA256 signature', () => {
      const rawBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: { payment: { entity: { id: 'pay_123' } } },
      });
      const validSignature = crypto
        .createHmac('sha256', 'webhooksecret789')
        .update(rawBody)
        .digest('hex');

      expect(verifyRazorpayWebhookSignature(rawBody, validSignature)).toBe(true);
    });

    it('rejects an invalid signature or mismatched secret', () => {
      const rawBody = '{"event":"payment_link.paid"}';
      expect(verifyRazorpayWebhookSignature(rawBody, 'invalidsignature123')).toBe(false);
      expect(verifyRazorpayWebhookSignature(rawBody, '')).toBe(false);
    });
  });

  describe('createRazorpayPaymentLink', () => {
    it('creates a payment link and returns short_url', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'plink_abc123',
          short_url: 'https://rzp.io/i/testxyz',
          status: 'created',
        }),
      });
      global.fetch = mockFetch;

      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'acc_1' } }),
            }),
          }),
        }),
      });

      const res = await createRazorpayPaymentLink({
        orderId: 'ORD-CAT-999',
        customerName: 'Adnan Pathan',
        customerPhone: '+919634722174',
        partDetails: 'Hero Splendor Brake Shoe',
        amount: 85,
      });

      expect(res.success).toBe(true);
      expect(res.paymentLinkId).toBe('plink_abc123');
      expect(res.shortUrl).toBe('https://rzp.io/i/testxyz');
      expect(res.orderId).toBe('ORD-CAT-999');
      expect(res.amount).toBe(85);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify payload passed to Razorpay
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.razorpay.com/v1/payment_links');
      const body = JSON.parse(callArgs[1].body);
      expect(body.amount).toBe(8500); // in paise
      expect(body.reference_id).toBe('ORD-CAT-999');
      expect(body.currency).toBe('INR');
      expect(body.customer.name).toBe('Adnan Pathan');
    });

    it('falls back to self-hosted checkout URL if Razorpay API fails or is offline', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'acc_1' } }),
            }),
          }),
        }),
      });

      const res = await createRazorpayPaymentLink({
        orderId: 'ORD-TEST-FALLBACK',
        customerName: 'Saud Bhai',
        customerPhone: '919634722174',
        partDetails: 'Bajaj Pulsar Clutch Plate',
        amount: 350,
      });

      expect(res.success).toBe(true);
      expect(res.shortUrl).toContain('/pay?order=ORD-TEST-FALLBACK');
      expect(res.amount).toBe(350);
    });
  });

  describe('markPaymentAsPaid', () => {
    it('updates payment status to PAID, records razorpay_payment_id, deducts stock, and sends receipt', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      const { engineSendText } = await import('@/lib/flows/meta-send');
      const { deductStockForSale } = await import('@/lib/inventory/stock-deduction');

      let updatedLink: any = null;
      let updatedOrder: any = null;

      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'payment_links') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: 'link_1',
                          order_id: 'ORD-CAT-555',
                          merchant_transaction_id: 'ORD-CAT-555',
                          customer_name: 'Rashid Khan',
                          customer_phone: '919634722174',
                          part_details: 'Hero Splendor Brake Shoe',
                          amount: 85,
                          status: 'PENDING',
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
              update: vi.fn((payload) => {
                updatedLink = payload;
                return {
                  eq: vi.fn().mockResolvedValue({ error: null }),
                  or: vi.fn().mockResolvedValue({ error: null }),
                };
              }),
            };
          }
          if (table === 'orders') {
            return {
              update: vi.fn((payload) => {
                updatedOrder = payload;
                return {
                  or: vi.fn().mockResolvedValue({ error: null }),
                };
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'cont_1', account_id: 'acc_1', user_id: 'usr_1' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv_1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      });

      const res = await markPaymentAsPaid({
        orderId: 'ORD-CAT-555',
        razorpayPaymentId: 'pay_ABC123456789',
        paymentMode: 'UPI',
      });

      expect(res).toBeTruthy();
      expect(updatedLink.status).toBe('PAID');
      expect(updatedLink.razorpay_payment_id).toBe('pay_ABC123456789');

      // Verify stock deduction called
      expect(deductStockForSale).toHaveBeenCalledTimes(1);

      // Verify WhatsApp confirmation receipt sent (Receipt via engineSendText and Delivery Preference via engineSendInteractiveButtons)
      expect(engineSendText).toHaveBeenCalledTimes(1);
      const text1 = (engineSendText as any).mock.calls[0][0].text;
      expect(text1).toContain('PAYMENT RECEIPT — BEST AUTO PARTS');
      expect(text1).toContain('ORD-CAT-555');
      expect(text1).toContain('pay_ABC123456789');
      expect(text1).toContain('₹85.00');

      const { engineSendInteractiveButtons } = await import('@/lib/flows/meta-send');
      expect(engineSendInteractiveButtons).toHaveBeenCalledWith(
        expect.objectContaining({
          buttons: [
            { id: 'btn_pickup_ORD-CAT-555', title: '🏪 Store Pickup' },
            { id: 'btn_delivery_ORD-CAT-555', title: '🚚 Home Delivery' },
          ],
        })
      );
    });

    it('idempotently skips stock deduction if payment or order was already marked paid', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      const { deductStockForSale } = await import('@/lib/inventory/stock-deduction');

      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'payment_links') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: 'link_already_paid',
                          order_id: 'ORD-ALREADY-PAID',
                          status: 'PAID',
                          stock_deducted: true,
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        payment_status: 'PAID',
                        stock_deducted: true,
                      },
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'payments') {
            return {
              update: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          return {};
        }),
      });

      await markPaymentAsPaid({
        orderId: 'ORD-ALREADY-PAID',
        razorpayPaymentId: 'pay_duplicate_123',
        skipReceipt: true,
      });

      // Deduct stock must NOT be called again
      expect(deductStockForSale).not.toHaveBeenCalled();
    });
  });

  describe('creditBestPayLedgerBalance', () => {
    it('reduces contact pending_balance and logs debit_payment in mechanic_ledger_entries', async () => {
      let updatedContactPayload: any = null;
      let insertedLedgerPayload: any = null;

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'cont_101',
                        name: 'Nabeel Pathan',
                        account_id: 'acc_101',
                        pending_balance: 2550,
                        khata_stage: 'Running Monthly Khata',
                      },
                    ],
                  }),
                }),
              }),
              update: vi.fn((payload) => {
                updatedContactPayload = payload;
                return {
                  eq: vi.fn().mockResolvedValue({ error: null }),
                };
              }),
            };
          }
          if (table === 'mechanic_ledger_entries') {
            return {
              insert: vi.fn((payload) => {
                insertedLedgerPayload = payload;
                return Promise.resolve({ error: null });
              }),
            };
          }
          if (table === 'payment_links') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          return {};
        }),
      };

      const result = await creditBestPayLedgerBalance({
        amount: 1500,
        paymentId: 'pay_test_credit_101',
        orderId: 'ORD-TEST-101',
        customerPhone: '+919761224004',
        db: mockDb,
      });

      expect(result.credited).toBe(true);
      expect(result.previousBalance).toBe(2550);
      expect(result.newBalance).toBe(1050);

      expect(updatedContactPayload.pending_balance).toBe(1050);
      expect(updatedContactPayload.khata_stage).toBe('Running Monthly Khata');

      expect(insertedLedgerPayload.amount).toBe(1500);
      expect(insertedLedgerPayload.entry_type).toBe('debit_payment');
      expect(insertedLedgerPayload.balance_after).toBe(1050);
      expect(insertedLedgerPayload.reference_id).toBe('pay_test_credit_101');
    });

    it('settles balance to 0 and updates khata_stage to Settled This Month when full payment received', async () => {
      let updatedContactPayload: any = null;

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'cont_102',
                        name: 'Rashid Khan',
                        account_id: 'acc_101',
                        pending_balance: 1500,
                        khata_stage: 'Running Monthly Khata',
                      },
                    ],
                  }),
                }),
              }),
              update: vi.fn((payload) => {
                updatedContactPayload = payload;
                return {
                  eq: vi.fn().mockResolvedValue({ error: null }),
                };
              }),
            };
          }
          if (table === 'mechanic_ledger_entries') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        }),
      };

      const result = await creditBestPayLedgerBalance({
        amount: 1500,
        paymentId: 'pay_test_credit_102',
        ledgerId: 'cont_102',
        db: mockDb,
      });

      expect(result.credited).toBe(true);
      expect(result.previousBalance).toBe(1500);
      expect(result.newBalance).toBe(0);
      expect(updatedContactPayload.pending_balance).toBe(0);
      expect(updatedContactPayload.khata_stage).toBe('Settled This Month');
    });
  });

  describe('sendWhatsAppReceiptVoucherTemplate', () => {
    it('sends free session text receipt by default when ENABLE_PAID_WHATSAPP_TEMPLATES is not set', async () => {
      delete process.env.ENABLE_PAID_WHATSAPP_TEMPLATES;
      const { engineSendText } = await import('@/lib/flows/meta-send');
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'whatsapp_config') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { phone_number_id: 'phone_123', access_token: 'token_123' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'c1', account_id: 'a1', user_id: 'u1' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      (supabaseAdmin as any).mockReturnValue(mockDb);

      const res = await sendWhatsAppReceiptVoucherTemplate({
        customerName: 'Saud Bhai',
        customerPhone: '919634722174',
        receiptId: 'ORD-REC-999',
        description: 'Bajaj Pulsar Brake Shoe',
        amount: 350,
        db: mockDb,
      });

      expect(res.success).toBe(true);
      expect(res.fallbackUsed).toBe(true);
      // Meta template endpoint should NOT be called since paid templates are disabled by default
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(engineSendText).toHaveBeenCalledTimes(1);
      const allTexts = (engineSendText as any).mock.calls.map((c: any) => c[0].text);
      expect(allTexts.some((t: string) => typeof t === 'string' && t.includes('PAYMENT RECEIPT — BEST AUTO PARTS'))).toBe(true);
    });

    it('sends free session text receipt and suppresses paid templates', async () => {
      const { engineSendText } = await import('@/lib/flows/meta-send');
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      global.fetch = fetchSpy;

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'whatsapp_config') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { phone_number_id: 'phone_123', access_token: 'token_123' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'c1', account_id: 'a1', user_id: 'u1' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      (supabaseAdmin as any).mockReturnValue(mockDb);

      const res = await sendWhatsAppReceiptVoucherTemplate({
        customerName: 'Saud Bhai',
        customerPhone: '919634722174',
        receiptId: 'ORD-REC-888',
        description: 'Hero Splendor Brake Shoe',
        amount: 250,
        db: mockDb,
      });

      expect(res.success).toBe(true);
      // Meta template endpoint should NOT be called since paid templates are permanently disabled
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(engineSendText).toHaveBeenCalled();
    });

    it('gracefully falls back to text receipt when WhatsApp Cloud API credentials are not configured', async () => {
      const { engineSendText } = await import('@/lib/flows/meta-send');

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'whatsapp_config') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'c1', account_id: 'a1', user_id: 'u1' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      (supabaseAdmin as any).mockReturnValue(mockDb);

      const res = await sendWhatsAppReceiptVoucherTemplate({
        customerName: 'Saud Bhai',
        customerPhone: '919634722174',
        receiptId: 'ORD-REC-999',
        description: 'Bajaj Pulsar Brake Shoe',
        amount: 350,
        db: mockDb,
      });

      expect(res.success).toBe(true);
      expect(res.fallbackUsed).toBe(true);
      expect(engineSendText).toHaveBeenCalled();
    });
  });

  describe('processRazorpayPaymentSuccess', () => {
    it('executes payment once and idempotently suppresses duplicate events for same paymentId', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'razorpay_payments') {
            return {
              update: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  or: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                      data: [{ id: 'rzp_1', status: 'paid' }],
                      error: null,
                    }),
                  }),
                }),
              }),
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'rzp_1', status: 'paid' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'payment_links') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: 'link_1',
                          order_id: 'ORD-IDEMP-001',
                          merchant_transaction_id: 'ORD-IDEMP-001',
                          customer_name: 'Saud Khan',
                          customer_phone: '919634722174',
                          amount: 100,
                          status: 'PENDING',
                        },
                      }),
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              update: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'c1', pending_balance: 500, khata_stage: 'Running' }],
                  }),
                }),
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'c1', account_id: 'a1', user_id: 'u1' },
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'mechanic_ledger_entries') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      });

      const firstCall = await processRazorpayPaymentSuccess({
        paymentId: 'pay_atomic_test_999',
        orderId: 'ORD-IDEMP-001',
        paymentLinkId: 'plink_atomic_999',
        amount: 100,
        customerPhone: '919634722174',
        customerName: 'Saud Khan',
        sourceEvent: 'payment_link.paid',
      });

      expect(firstCall.success).toBe(true);
      expect(firstCall.alreadyProcessed).toBe(false);

      // Second concurrent or duplicate event for the SAME paymentId
      const secondCall = await processRazorpayPaymentSuccess({
        paymentId: 'pay_atomic_test_999',
        orderId: 'ORD-IDEMP-001',
        paymentLinkId: 'plink_atomic_999',
        amount: 100,
        customerPhone: '919634722174',
        customerName: 'Saud Khan',
        sourceEvent: 'payment.captured',
      });

      expect(secondCall.success).toBe(true);
      expect(secondCall.alreadyProcessed).toBe(true);
      expect(secondCall.message).toContain('Already processed');
    });
  });

  describe('processRazorpayPaymentFailure', () => {
    it('records failed status in razorpay_payments and payment_links without deducting stock', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      const { deductStockForSale } = await import('@/lib/inventory/stock-deduction');

      let updatedLink: any = null;
      let insertedRzp: any = null;

      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'razorpay_payments') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
              insert: vi.fn((payload) => {
                insertedRzp = payload;
                return Promise.resolve({ data: payload, error: null });
              }),
            };
          }
          if (table === 'payment_links') {
            return {
              update: vi.fn((payload) => {
                updatedLink = payload;
                return {
                  or: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      });

      const res = await processRazorpayPaymentFailure({
        paymentId: 'pay_fail_123',
        orderId: 'ORD-FAIL-001',
        paymentLinkId: 'plink_fail_123',
        amount: 250,
        customerPhone: '919634722174',
        customerName: 'Saud Khan',
        description: 'Brake Disc for Pulsar',
        errorCode: 'BAD_REQUEST_ERROR',
        errorDescription: 'Payment failed at bank',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('failed');
      expect(insertedRzp.status).toBe('failed');
      expect(insertedRzp.amount).toBe(250);
      expect(updatedLink.status).toBe('FAILED');

      // Verify stock was NOT deducted on failure
      expect(deductStockForSale).not.toHaveBeenCalled();
    });

    it('handles payment_link.expired and payment_link.cancelled without deducting stock', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      const { deductStockForSale } = await import('@/lib/inventory/stock-deduction');

      let updatedLink: any = null;
      let insertedRzp: any = null;

      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'razorpay_payments') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
              insert: vi.fn((payload) => {
                insertedRzp = payload;
                return Promise.resolve({ data: payload, error: null });
              }),
            };
          }
          if (table === 'payment_links') {
            return {
              update: vi.fn((payload) => {
                updatedLink = payload;
                return {
                  or: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            };
          }
          if (table === 'orders' || table === 'payments') {
            const chainable: any = {
              neq: vi.fn(() => chainable),
              then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
            };
            return {
              update: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue(chainable),
              }),
            };
          }
          return {};
        }),
      });

      const resExpired = await processRazorpayPaymentFailure({
        paymentId: 'plink_expired_001',
        orderId: 'ORD-EXP-001',
        paymentLinkId: 'plink_expired_001',
        amount: 500,
        customerPhone: '919634722174',
        customerName: 'Saud Khan',
        sourceEvent: 'payment_link.expired',
      });

      expect(resExpired.success).toBe(true);
      expect(resExpired.status).toBe('failed');
      expect(insertedRzp.status).toBe('failed');
      expect(updatedLink.status).toBe('FAILED');
      expect(deductStockForSale).not.toHaveBeenCalled();
    });

    it('sends interactive CTA URL with Retry Payment button on payment failure', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      const { engineSendInteractiveCtaUrl } = await import('@/lib/flows/meta-send');

      (supabaseAdmin as any).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'razorpay_payments') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'payment_links') {
            return {
              update: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        order_id: 'ORD-FAIL-CTA',
                        razorpay_payment_link_url: 'https://rzp.io/i/retryTest123',
                      },
                    ],
                  }),
                }),
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'cont_1', account_id: 'acc_1', user_id: 'usr_1', phone: '919634722174' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv_1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      });

      const res = await processRazorpayPaymentFailure({
        paymentId: 'pay_fail_cta_999',
        orderId: 'ORD-FAIL-CTA',
        amount: 350,
        customerPhone: '919634722174',
        customerName: 'Saud Khan',
        description: 'Brake Disc for Pulsar',
      });

      expect(res.success).toBe(true);
      expect(engineSendInteractiveCtaUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          buttonText: '🔄 Retry Payment',
          headerText: '❌ Payment Failed',
          url: expect.stringContaining('https://rzp.io/'),
          bodyText: expect.stringContaining('Payment Failed — Order Not Confirmed'),
        })
      );
    });
  });

  describe('sendWhatsAppPaymentConfirmation', () => {
    it('sends receipt and interactive buttons for Store Pickup and Home Delivery', async () => {
      const { supabaseAdmin } = await import('@/lib/flows/admin-client');
      const { engineSendText, engineSendInteractiveButtons } = await import('@/lib/flows/meta-send');
      const { sendWhatsAppPaymentConfirmation } = await import('./razorpay');

      const mockDb: any = {
        from: vi.fn((table: string) => {
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'cont_1', account_id: 'acc_1', user_id: 'usr_1', phone: '919634722174' },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv_1' } }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      await sendWhatsAppPaymentConfirmation(
        {
          order_id: 'ORD-CAT-888',
          merchant_transaction_id: 'ORD-CAT-888',
          customer_name: 'Rashid Khan',
          customer_phone: '919634722174',
          part_details: 'Clutch Plate (x1)',
          amount: 450,
          status: 'PAID',
          gateway: 'razorpay',
          payment_mode: 'RAZORPAY',
          razorpay_payment_id: 'pay_success_123',
          paid_at: new Date().toISOString(),
        },
        'pay_success_123',
        mockDb
      );

      // Verify Message 1 (Receipt) sent via engineSendText
      expect(engineSendText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('PAYMENT RECEIPT — BEST AUTO PARTS'),
        })
      );

      // Verify Message 2 (Interactive Buttons) sent with Store Pickup & Home Delivery
      expect(engineSendInteractiveButtons).toHaveBeenCalledWith(
        expect.objectContaining({
          buttons: [
            { id: 'btn_pickup_ORD-CAT-888', title: '🏪 Store Pickup' },
            { id: 'btn_delivery_ORD-CAT-888', title: '🚚 Home Delivery' },
          ],
        })
      );
    });
  });
});
