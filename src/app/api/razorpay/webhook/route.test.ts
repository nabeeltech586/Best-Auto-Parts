import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { POST } from './route';

vi.mock('@/lib/payments/razorpay', () => ({
  verifyRazorpayWebhookSignature: vi.fn((body, sig, secret) => {
    if (!body || !sig) return false;
    const sec = secret || process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!sec) return false;
    const expected = crypto.createHmac('sha256', sec).update(body).digest('hex');
    return expected === sig;
  }),
  processRazorpayPaymentSuccess: vi.fn().mockImplementation(async (input) => {
    if (input.paymentId === 'pay_already_processed') {
      return {
        success: true,
        alreadyProcessed: true,
        paymentId: input.paymentId,
        orderId: input.orderId,
        deliveryOrderId: input.orderId,
        message: 'Already processed (idempotent)',
      };
    }
    return {
      success: true,
      alreadyProcessed: false,
      paymentId: input.paymentId,
      orderId: input.orderId,
      deliveryOrderId: input.orderId,
      ledgerCredited: true,
      receiptSent: true,
      message: 'Payment processed successfully',
    };
  }),
}));

describe('POST /api/razorpay/webhook', () => {
  const webhookSecret = 'test_webhook_secret_999';

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    vi.clearAllMocks();
  });

  it('returns 400 when x-razorpay-signature header is missing', async () => {
    const req = new Request('http://localhost:3000/api/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.captured' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing x-razorpay-signature header');
  });

  it('returns 401 when signature verification fails', async () => {
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const req = new Request('http://localhost:3000/api/razorpay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'invalid_signature_xyz',
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Invalid signature');
  });

  it('processes payment_link.paid event and delegates to processRazorpayPaymentSuccess', async () => {
    const payload = {
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            id: 'plink_776655',
            reference_id: 'ORD-CAT-1500',
            amount: 150000,
            amount_paid: 150000,
            status: 'paid',
            notes: {
              ledger_id: 'MECH-007',
            },
            customer: {
              name: 'Nabeel Pathan',
              contact: '+919761224004',
            },
            description: 'Bajaj Pulsar Cylinder Kit',
          },
        },
        payment: {
          entity: {
            id: 'pay_live_776655',
            amount: 150000,
            method: 'upi',
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const req = new Request('http://localhost:3000/api/razorpay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature,
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.paymentId).toBe('pay_live_776655');
    expect(json.orderId).toBe('ORD-CAT-1500');
    expect(json.ledgerCredited).toBe(true);

    const { processRazorpayPaymentSuccess } = await import('@/lib/payments/razorpay');
    expect(processRazorpayPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-CAT-1500',
        paymentId: 'pay_live_776655',
        paymentLinkId: 'plink_776655',
        paymentMode: 'upi',
        amount: 1500,
        ledgerId: 'MECH-007',
        customerName: 'Nabeel Pathan',
        customerPhone: '+919761224004',
      })
    );
  });

  it('processes payment.captured event successfully', async () => {
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_cap_9988',
            amount: 85000,
            method: 'netbanking',
            description: 'Hero Splendor Chain Sprocket',
            contact: '+919634722174',
            notes: {
              order_id: 'ORD-CAT-850',
              customer_name: 'Rashid Khan',
            },
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const req = new Request('http://localhost:3000/api/razorpay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature,
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.paymentId).toBe('pay_cap_9988');
    expect(json.orderId).toBe('ORD-CAT-850');
  });

  it('processes order.paid event successfully', async () => {
    const payload = {
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: 'order_rzp_4433',
            receipt: 'ORD-CAT-777',
            amount: 55000,
            amount_paid: 55000,
            notes: {
              customer_name: 'Saud Bhai',
              customer_phone: '+919634722174',
            },
          },
        },
        payment: {
          entity: {
            id: 'pay_order_4433',
            amount: 55000,
            method: 'upi',
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const req = new Request('http://localhost:3000/api/razorpay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature,
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.paymentId).toBe('pay_order_4433');
    expect(json.orderId).toBe('ORD-CAT-777');
  });

  it('handles idempotency by returning 200 without reprocessing when already paid', async () => {
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_already_processed',
            amount: 250000,
            method: 'upi',
            notes: { order_id: 'ORD-DUP-001' },
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const req = new Request('http://localhost:3000/api/razorpay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature,
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('Already processed (idempotent)');
    expect(json.alreadyProcessed).toBe(true);
  });
});
