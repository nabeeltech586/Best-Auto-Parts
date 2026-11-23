/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

describe('Purchase Order [id] API (/api/inventory/purchase-orders/[id])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns purchase order when found', async () => {
      const { getCurrentAccount } = await import('@/lib/auth/account');

      const mockPo = {
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_name: 'HAMDAAN SPARE PARTS',
        total_estimated_cost: 12000,
        amount_paid: 5000,
        payment_status: 'PARTIAL',
      };

      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockPo, error: null }),
              })),
            })),
          })),
        })),
      };

      vi.mocked(getCurrentAccount).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-1');
      const res = await GET(req, { params: Promise.resolve({ id: 'po-1' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.purchase_order.id).toBe('po-1');
      expect(data.purchase_order.po_number).toBe('PO-2026-001');
    });

    it('returns 404 when purchase order is not found', async () => {
      const { getCurrentAccount } = await import('@/lib/auth/account');

      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
              })),
            })),
          })),
        })),
      };

      vi.mocked(getCurrentAccount).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-missing');
      const res = await GET(req, { params: Promise.resolve({ id: 'po-missing' }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Purchase order not found');
    });
  });

  describe('PATCH', () => {
    it('marks PO as PAID, creates settlement supplier payment for remaining balance, and sets amount_paid', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPo = {
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_id: 'sup-1',
        supplier_name: 'HAMDAAN SPARE PARTS',
        total_estimated_cost: 10000,
        amount_paid: 4000,
        payment_status: 'PARTIAL',
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
                    single: vi.fn().mockResolvedValue({ data: existingPo, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => {
                updatedPoPayload = patch;
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({
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
                return Promise.resolve({ error: null });
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

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'PAID',
          payment_mode: 'Cash / Quick Settle',
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'po-1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.purchase_order.payment_status).toBe('PAID');
      expect(data.purchase_order.amount_paid).toBe(10000);

      // Verify settlement payment was logged for remaining delta (10000 - 4000 = 6000)
      expect(insertedPayment).not.toBeNull();
      expect(insertedPayment.amount).toBe(6000);
      expect(insertedPayment.supplier_name).toBe('HAMDAAN SPARE PARTS');
      expect(insertedPayment.payment_mode).toBe('Cash / Quick Settle');
      expect(updatedPoPayload.amount_paid).toBe(10000);
      expect(updatedPoPayload.payment_status).toBe('PAID');
    });

    it('resets PO payment_status to UNPAID and amount_paid to 0', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPo = {
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_id: 'sup-1',
        supplier_name: 'HAMDAAN SPARE PARTS',
        total_estimated_cost: 10000,
        amount_paid: 10000,
        payment_status: 'PAID',
      };

      let updatedPoPayload: any = null;

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'purchase_orders') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: existingPo, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => {
                updatedPoPayload = patch;
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({
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
          return {};
        }),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'UNPAID',
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'po-1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.purchase_order.payment_status).toBe('UNPAID');
      expect(data.purchase_order.amount_paid).toBe(0);
      expect(updatedPoPayload.amount_paid).toBe(0);
      expect(updatedPoPayload.payment_status).toBe('UNPAID');
    });

    it('updates PO with PARTIAL payment status and amount', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPo = {
        id: 'po-2',
        po_number: 'PO-2026-002',
        supplier_id: 'sup-2',
        supplier_name: 'Gupta Auto Spares',
        total_estimated_cost: 15000,
        amount_paid: 0,
        payment_status: 'UNPAID',
      };

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'purchase_orders') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: existingPo, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({
                        data: { ...existingPo, ...patch },
                        error: null,
                      }),
                    })),
                  })),
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

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'PARTIAL',
          amount_paid: 4500,
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'po-2' }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.purchase_order.payment_status).toBe('PARTIAL');
      expect(data.purchase_order.amount_paid).toBe(4500);
    });
  });

  describe('DELETE', () => {
    it('deletes purchase order successfully', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const mockSupabase: any = {
        from: vi.fn(() => ({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
        })),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-1', {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'po-1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
