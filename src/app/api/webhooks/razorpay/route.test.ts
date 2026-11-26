import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { POST } from './route';

vi.mock('@/lib/payments/razorpay', async () => {
  const actual = await vi.importActual<any>('@/lib/payments/razorpay');
  return {
    ...actual,
    markPaymentAsPaid: vi.fn().mockResolvedValue({
      id: 'plink_1',
      order_id: 'ORD-CAT-101',
      status: 'PAID',
    }),
  };
});

describe('Razorpay Webhook Route (/api/webhooks/razorpay)', () => {
  const webhookSecret = 'test_webhook_secret_xyz';

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    vi.clearAllMocks();
  });

  it('returns 400 when x-razorpay-signature is missing', async () => {
    const req = new Request('http://localhost:3000/api/webhooks/razorpay', {
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
    const req = new Request('http://localhost:3000/api/webhooks/razorpay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'invalidsig123',
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Invalid signature');
  });

  it('processes payment_link.paid event successfully with valid HMAC signature', async () => {
    const payload = {
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            id: 'plink_998877',
            reference_id: 'ORD-CAT-101',
            amount: 8500,
            amount_paid: 8500,
            status: 'paid',
          },
        },
        payment: {
          entity: {
            id: 'pay_live_554433',
            amount: 8500,
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

    const req = new Request('http://localhost:3000/api/webhooks/razorpay', {
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
    expect(json.orderId).toBe('ORD-CAT-101');
    expect(json.paymentId).toBe('pay_live_554433');

    const { markPaymentAsPaid } = await import('@/lib/payments/razorpay');
    expect(markPaymentAsPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-CAT-101',
        razorpayPaymentId: 'pay_live_554433',
        razorpayPaymentLinkId: 'plink_998877',
        paymentMode: 'upi',
        amount: 85,
      })
    );
  });

  it('processes payment.captured event successfully with notes.order_id', async () => {
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_direct_112233',
            amount: 35000,
            method: 'card',
            notes: {
              order_id: 'ORD-CAT-202',
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

    const req = new Request('http://localhost:3000/api/webhooks/razorpay', {
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
    expect(json.paymentId).toBe('pay_direct_112233');

    const { markPaymentAsPaid } = await import('@/lib/payments/razorpay');
    expect(markPaymentAsPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-CAT-202',
        razorpayPaymentId: 'pay_direct_112233',
        paymentMode: 'card',
        amount: 350,
      })
    );
  });
});
