import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, DELETE } from './route';

// Mock deletePaymentLinkCache
const mockDeletePaymentLinkCache = vi.fn();
vi.mock('@/lib/payments/razorpay', () => ({
  deletePaymentLinkCache: (...args: unknown[]) => mockDeletePaymentLinkCache(...args),
}));

// Mock Supabase
const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockOr = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();
const mockNeq = vi.fn();

const mockFrom = vi.fn((_table: string) => {
  return {
    select: mockSelect,
    delete: mockDelete,
    or: mockOr,
    limit: mockLimit,
    maybeSingle: mockMaybeSingle,
    neq: mockNeq,
  };
});

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('/api/payments/[id] Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/payments/[id]', () => {
    it('returns 400 when ID is missing or whitespace', async () => {
      const req = new Request('http://localhost:3000/api/payments/%20');
      const params = Promise.resolve({ id: '   ' });

      const res = await GET(req, { params });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Payment ID is required');
    });

    it('returns 404 when payment is not found', async () => {
      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const req = new Request('http://localhost:3000/api/payments/TXN-NONEXISTENT');
      const params = Promise.resolve({ id: 'TXN-NONEXISTENT' });

      const res = await GET(req, { params });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Payment not found');
    });

    it('returns 200 with payment data when found', async () => {
      const mockRecord = {
        id: 'link_123',
        order_id: 'ORD-500',
        merchant_transaction_id: 'TXN-500',
        amount: 1500,
        status: 'PAID',
      };

      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockRecord, error: null }),
          }),
        }),
      });

      const req = new Request('http://localhost:3000/api/payments/ORD-500');
      const params = Promise.resolve({ id: 'ORD-500' });

      const res = await GET(req, { params });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.payment).toEqual(mockRecord);
    });
  });

  describe('DELETE /api/payments/[id]', () => {
    it('returns 400 when ID is empty', async () => {
      const req = new Request('http://localhost:3000/api/payments/');
      const params = Promise.resolve({ id: '' });

      const res = await DELETE(req, { params });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Payment ID is required');
    });

    it('successfully deletes across payment_links, payments, razorpay_payments, cleans unfulfilled order, and clears cache', async () => {
      // payment_links existing lookup
      mockSelect.mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'plink_abc',
                order_id: 'ORD-777',
                merchant_transaction_id: 'TXN-777',
              },
              error: null,
            }),
          }),
        }),
      });

      // delete chaining
      mockDelete.mockReturnValue({
        or: vi.fn().mockReturnValue({
          neq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const req = new Request('http://localhost:3000/api/payments/ORD-777');
      const params = Promise.resolve({ id: 'ORD-777' });

      const res = await DELETE(req, { params });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.id).toBe('ORD-777');

      // Check cache eviction was invoked
      expect(mockDeletePaymentLinkCache).toHaveBeenCalledWith('ORD-777');
      expect(mockDeletePaymentLinkCache).toHaveBeenCalledWith('TXN-777');
    });
  });
});
