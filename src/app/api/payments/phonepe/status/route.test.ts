import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { PaymentService } from '@/lib/payments/payment-service';

vi.mock('@/lib/payments/payment-service', () => ({
  PaymentService: {
    reconcilePaymentStatus: vi.fn(),
  },
}));

describe('PhonePe Status Route (/api/payments/phonepe/status)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 Bad Request when order query parameter is missing', async () => {
    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/status', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing order reference');
  });

  it('returns reconciled payment status for valid order parameter', async () => {
    vi.mocked(PaymentService.reconcilePaymentStatus).mockResolvedValueOnce({
      success: true,
      status: 'PAID',
      merchantTransactionId: 'BAP_TXN_VALID',
      utr: 'UTR_RECONCILED',
    });

    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/status?order=BAP_TXN_VALID', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('PAID');
    expect(data.success).toBe(true);
    expect(data.utr).toBe('UTR_RECONCILED');
  });
});
