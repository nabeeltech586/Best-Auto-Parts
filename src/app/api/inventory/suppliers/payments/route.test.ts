/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

describe('Supplier Payments API (/api/inventory/suppliers/payments)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns list of supplier payments with supplier info', async () => {
      const { getCurrentAccount } = await import('@/lib/auth/account');

      const mockPayments = [
        {
          id: 'pay-1',
          supplier_id: 'sup-1',
          supplier_name: 'HAMDAAN SPARE PARTS',
          amount: 2500,
          payment_mode: 'Cash',
          paid_at: '2026-11-23T10:00:00Z',
          supplier: { firm_name: 'HAMDAAN SPARE PARTS', whatsapp_number: '+919634002453' },
        },
      ];

      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: mockPayments,
                error: null,
              }),
            })),
          })),
        })),
      };

      vi.mocked(getCurrentAccount).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers/payments');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.payments.length).toBe(1);
      expect(data.payments[0].amount).toBe(2500);
      expect(data.payments[0].supplier_name).toBe('HAMDAAN SPARE PARTS');
    });

    it('filters supplier payments by supplier_id and purchase_order_id', async () => {
      const { getCurrentAccount } = await import('@/lib/auth/account');

      const eqFilters: string[] = [];
      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn((col, val) => {
              eqFilters.push(`${col}=${val}`);
              return {
                order: vi.fn(() => ({
                  eq: vi.fn((col2, val2) => {
                    eqFilters.push(`${col2}=${val2}`);
                    return {
                      eq: vi.fn((col3, val3) => {
                        eqFilters.push(`${col3}=${val3}`);
                        return Promise.resolve({ data: [], error: null });
                      }),
                    };
                  }),
                })),
              };
            }),
          })),
        })),
      };

      vi.mocked(getCurrentAccount).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers/payments?supplier_id=sup-1&purchase_order_id=po-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.payments).toEqual([]);
    });
  });

  describe('POST', () => {
    it('rejects payment when amount is 0 or negative', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: {} as any,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 0,
          payment_mode: 'Cash',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('greater than 0');
    });

    it('records a supplier payment and updates purchase order status to PARTIAL', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPo = {
        id: 'po-1',
        supplier_id: 'sup-1',
        supplier_name: 'HAMDAAN SPARE PARTS',
        supplier_phone: '+919634002453',
        total_estimated_cost: 10000,
        amount_paid: 2000,
      };

      let insertedPayment: any = null;
      let updatedPoPayload: any = null;

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'purchase_orders') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingPo, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => {
                updatedPoPayload = patch;
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { ...existingPo, ...patch },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                };
              }),
            };
          }
          if (table === 'supplier_payments') {
            return {
              insert: vi.fn((row: any) => {
                insertedPayment = row;
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'pay-1', ...row },
                      error: null,
                    }),
                  })),
                };
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_order_id: 'po-1',
          amount: 3000,
          payment_mode: 'UPI (GooglePay / PhonePe / Paytm)',
          notes: 'Advance transfer',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(insertedPayment.amount).toBe(3000);
      expect(insertedPayment.payment_mode).toBe('UPI');
      expect(insertedPayment.supplier_id).toBe('sup-1');
      expect(insertedPayment.supplier_name).toBe('HAMDAAN SPARE PARTS');

      // PO amount_paid should be 2000 + 3000 = 5000 (PARTIAL)
      expect(updatedPoPayload.amount_paid).toBe(5000);
      expect(updatedPoPayload.payment_status).toBe('PARTIAL');
      expect(data.purchase_order.payment_status).toBe('PARTIAL');
    });

    it('records payment in full and updates purchase order status to PAID', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPo = {
        id: 'po-2',
        supplier_id: 'sup-1',
        supplier_name: 'HAMDAAN SPARE PARTS',
        supplier_phone: '+919634002453',
        total_estimated_cost: 8000,
        amount_paid: 5000,
      };

      let updatedPoPayload: any = null;

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'purchase_orders') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingPo, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => {
                updatedPoPayload = patch;
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { ...existingPo, ...patch },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                };
              }),
            };
          }
          if (table === 'supplier_payments') {
            return {
              insert: vi.fn((row: any) => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'pay-2', ...row },
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        }),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_order_id: 'po-2',
          amount: 3000,
          payment_mode: 'Bank Transfer (IMPS / NEFT)',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      // 5000 + 3000 = 8000 >= 8000 => PAID
      expect(updatedPoPayload.amount_paid).toBe(8000);
      expect(updatedPoPayload.payment_status).toBe('PAID');
    });

    it('falls back to supplier lookup by firm_name when supplier_id is missing', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      let insertedPayment: any = null;

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'suppliers') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  ilike: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'matched-sup-123' },
                      error: null,
                    }),
                  })),
                })),
              })),
            };
          }
          if (table === 'supplier_payments') {
            return {
              insert: vi.fn((row: any) => {
                insertedPayment = row;
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'pay-3', ...row },
                      error: null,
                    }),
                  })),
                };
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: 'HAMDAAN SPARE PARTS',
          amount: 1500,
          payment_mode: 'Cash in Hand',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(insertedPayment.supplier_id).toBe('matched-sup-123');
      expect(insertedPayment.supplier_name).toBe('HAMDAAN SPARE PARTS');
      expect(insertedPayment.payment_mode).toBe('Cash');
    });
  });
});
