import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/payments/razorpay', () => ({
  createRazorpayPaymentLink: vi.fn().mockImplementation(async (input) => {
    return {
      success: true,
      paymentLink: 'https://rzp.io/i/test_short_url',
      shortUrl: 'https://rzp.io/i/test_short_url',
      paymentLinkId: 'plink_test_123',
      merchantTransactionId: input.order_id || 'ORD-TEST-999',
      orderId: input.order_id || 'ORD-TEST-999',
      amount: input.amount,
    };
  }),
}));

describe('POST /api/razorpay/create-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when amount is missing or <= 0', async () => {
    const req = new Request('http://localhost:3000/api/razorpay/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 0, customer_name: 'Saud Khan' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Valid positive payment amount is required');
  });

  it('creates payment link with valid amount and returns short_url', async () => {
    const req = new Request('http://localhost:3000/api/razorpay/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1500,
        customer_name: 'Saud Khan',
        customer_phone: '9634722174',
        description: 'Bajaj Pulsar 150 Clutch Plate',
        order_id: 'ORD-TEST-1500',
        ledger_id: 'MECH-001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.short_url).toBe('https://rzp.io/i/test_short_url');
    expect(json.payment_link_id).toBe('plink_test_123');
    expect(json.order_id).toBe('ORD-TEST-1500');
    expect(json.ledger_id).toBe('MECH-001');
    expect(json.amount).toBe(1500);
    expect(json.currency).toBe('INR');

    const { createRazorpayPaymentLink } = await import('@/lib/payments/razorpay');
    expect(createRazorpayPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        customer_name: 'Saud Khan',
        customer_phone: '9634722174',
        description: 'Bajaj Pulsar 150 Clutch Plate',
        order_id: 'ORD-TEST-1500',
        ledger_id: 'MECH-001',
      })
    );
  });
});
