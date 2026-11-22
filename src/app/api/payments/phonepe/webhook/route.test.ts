import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { PaymentService } from '@/lib/payments/payment-service';

vi.mock('@/lib/payments/payment-service', () => ({
  PaymentService: {
    processWebhook: vi.fn(),
  },
}));

describe('PhonePe Webhook Route (/api/payments/phonepe/webhook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 Bad Request when payload structure is missing merchantOrderId', async () => {
    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'PAYMENT_SUCCESS', payload: {} }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid webhook payload structure');
  });

  it('returns 401 Unauthorized when signature / credentials verification fails', async () => {
    vi.mocked(PaymentService.processWebhook).mockResolvedValueOnce({
      success: false,
      status: 'INVALID_AUTH',
    });

    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'PAYMENT_SUCCESS',
        payload: { merchantOrderId: 'BAP_TXN_INVALID' },
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic invalid_token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('returns 404 Not Found when order reference does not exist in CRM', async () => {
    vi.mocked(PaymentService.processWebhook).mockResolvedValueOnce({
      success: false,
      status: 'NOT_FOUND',
    });

    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'PAYMENT_SUCCESS',
        payload: { merchantOrderId: 'BAP_TXN_NOTFOUND' },
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic valid_token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Order reference not found');
  });

  it('returns 400 Bad Request when payment amount does not match order amount', async () => {
    vi.mocked(PaymentService.processWebhook).mockResolvedValueOnce({
      success: false,
      status: 'AMOUNT_MISMATCH',
    });

    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'PAYMENT_SUCCESS',
        payload: { merchantOrderId: 'BAP_TXN_MISMATCH', amount: 100 },
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic valid_token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Payment amount mismatch');
  });

  it('returns 200 OK when payment is verified successfully', async () => {
    vi.mocked(PaymentService.processWebhook).mockResolvedValueOnce({
      success: true,
      status: 'PAID',
      merchantTransactionId: 'BAP_TXN_123',
      orderId: 'order-123',
      utr: 'UTR999',
    });

    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'PAYMENT_SUCCESS',
        payload: { merchantOrderId: 'BAP_TXN_123', amount: 69000 },
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic valid_token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('SUCCESS');
    expect(data.outcome).toBe('PAID');
    expect(data.merchantTransactionId).toBe('BAP_TXN_123');
  });

  it('returns 200 OK on duplicate webhook delivery (idempotent)', async () => {
    vi.mocked(PaymentService.processWebhook).mockResolvedValueOnce({
      success: true,
      status: 'ALREADY_PROCESSED',
      merchantTransactionId: 'BAP_TXN_123',
      orderId: 'order-123',
      utr: 'UTR999',
    });

    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'PAYMENT_SUCCESS',
        payload: { merchantOrderId: 'BAP_TXN_123', amount: 69000 },
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic valid_token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('SUCCESS');
    expect(data.outcome).toBe('ALREADY_PROCESSED');
  });
});
