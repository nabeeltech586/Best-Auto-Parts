import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

// Mock supabaseAdmin
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();

const mockFrom = vi.fn((_table: string) => {
  return {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    eq: mockEq,
    or: mockOr,
    order: mockOrder,
    limit: mockLimit,
    single: mockSingle,
  };
});

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('/api/payments/links Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PATCH /api/payments/links', () => {
    it('returns 400 when merchant_transaction_id is missing', async () => {
      const req = new Request('http://localhost:3000/api/payments/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('merchant_transaction_id is required');
    });

    it('returns 400 when status is invalid', async () => {
      const req = new Request('http://localhost:3000/api/payments/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_transaction_id: 'TXN-123',
          status: 'INVALID_STATUS',
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Valid status (PENDING, PAID, FAILED) is required');
    });

    it('returns 404 when payment link does not exist', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        }),
      });

      const req = new Request('http://localhost:3000/api/payments/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_transaction_id: 'TXN-NOTFOUND',
          status: 'PAID',
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Payment link not found');
    });

    it('successfully marks status as PAID, deducts contact pending balance, and recalculates metrics', async () => {
      const mockCurrentLink = {
        merchant_transaction_id: 'TXN-999',
        order_id: 'BAP-ORD-101',
        amount: 340,
        status: 'PENDING',
        customer_phone: '+919634722174',
        account_id: 'acc-1',
      };

      const mockUpdatedLink = {
        ...mockCurrentLink,
        status: 'PAID',
        paid_at: '2026-11-24T09:00:00.000Z',
      };

      const mockContact = {
        id: 'contact-saud',
        account_id: 'acc-1',
        name: 'Saud Bhai',
        phone: '+919634722174',
        pending_balance: 500,
        khata_stage: 'Active',
      };

      const mockAllRows = [
        { amount: 340, status: 'PAID' },
        { amount: 1500, status: 'PENDING' },
      ];

      // Setup mock behavior based on table
      mockFrom.mockImplementation((table: string) => {
        if (table === 'payment_links') {
          return {
            select: vi.fn((fields: string) => {
              if (fields === 'amount, status') {
                return Promise.resolve({ data: mockAllRows, error: null });
              }
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockCurrentLink, error: null }),
                }),
              };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockUpdatedLink, error: null }),
                }),
              }),
            }),
          } as unknown as ReturnType<typeof mockFrom>;
        }

        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: [mockContact], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          } as unknown as ReturnType<typeof mockFrom>;
        }

        if (table === 'mechanic_ledger_entries') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as unknown as ReturnType<typeof mockFrom>;
        }

        return {} as unknown as ReturnType<typeof mockFrom>;
      });

      const req = new Request('http://localhost:3000/api/payments/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_transaction_id: 'TXN-999',
          status: 'PAID',
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.link.status).toBe('PAID');
      expect(json.metrics.totalCollected).toBe(340);
      expect(json.metrics.pendingAmount).toBe(1500);
      expect(json.metrics.paidCount).toBe(1);
      expect(json.metrics.pendingCount).toBe(1);
      expect(json.metrics.totalCount).toBe(2);
    });
  });
});
