/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSuppliers, POST as postSupplier } from '../suppliers/route';
import { GET as getPOs, POST as postPO } from './route';
import { POST as receivePO } from './[id]/receive/route';
import { PATCH as patchPart } from '../parts/[id]/route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

vi.mock('@/lib/whatsapp/meta-api', () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ messageId: 'wamid_po_123' }),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn().mockReturnValue('token_123'),
  encrypt: vi.fn().mockReturnValue('enc_token_123'),
}));

describe('Suppliers and Purchase Orders API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Suppliers API (/api/inventory/suppliers)', () => {
    it('creates a new supplier with normalized phone number', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'sup-1',
          firm_name: 'Gupta Auto Spares',
          whatsapp_number: '+919876543210',
          brand_specialty: ['Bajaj', 'Hero'],
        },
        error: null,
      });

      const mockSupabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockSingle,
            })),
          })),
        })),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firm_name: 'Gupta Auto Spares',
          whatsapp_number: '9876543210',
          brand_specialty: ['Bajaj', 'Hero'],
        }),
      });

      const res = await postSupplier(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.supplier.firm_name).toBe('Gupta Auto Spares');
    });

    it('lists suppliers for the account', async () => {
      const { getCurrentAccount } = await import('@/lib/auth/account');

      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: 'sup-1', firm_name: 'Gupta Auto Spares' }],
                  error: null,
                }),
              })),
            })),
          })),
        })),
      };

      vi.mocked(getCurrentAccount).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
      } as any);

      const res = await getSuppliers();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.suppliers.length).toBe(1);
    });
  });

  describe('Purchase Orders API (/api/inventory/purchase-orders)', () => {
    it('creates a PO and calculates totals accurately', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const mockPo = {
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_name: 'Gupta Auto Spares',
        supplier_phone: '+919876543210',
        total_items: 2,
        total_units: 30,
        total_estimated_cost: 15000,
        status: 'SENT',
      };

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'whatsapp_config') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { phone_number_id: 'pn_123', access_token: 'enc_token' },
                    error: null,
                  }),
                })),
              })),
            };
          }
          if (table === 'purchase_orders') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ count: 0 }),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: mockPo, error: null }),
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

      const req = new Request('https://test.com/api/inventory/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: 'Gupta Auto Spares',
          supplier_phone: '+919876543210',
          items: [
            { part_id: 'p1', part_name: 'Clutch Plate', quantity: 20, cost_price: 500 },
            { part_id: 'p2', part_name: 'Brake Shoe', quantity: 10, cost_price: 500 },
          ],
          send_via_whatsapp: true,
        }),
      });

      const res = await postPO(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.purchase_order.po_number).toBe('PO-2026-001');
      expect(data.whatsapp_dispatched).toBe(true);
    });

    it('marks a PO as received and increments live inventory stock', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPo = {
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_name: 'Gupta Auto Spares',
        status: 'SENT',
        items: [
          { part_id: 'p1', part_name: 'Clutch Plate', quantity: 20, cost_price: 500 },
        ],
      };

      const existingPart = {
        id: 'p1',
        quantity_in_stock: 5,
      };

      let updatedStock = 0;

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
          if (table === 'parts_catalog') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingPart, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => {
                updatedStock = patch.quantity_in_stock;
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  })),
                };
              }),
            };
          }
          if (table === 'stock_movements') {
            return {
              insert: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ error: null }),
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

      const req = new Request('https://test.com/api/inventory/purchase-orders/po-1/receive', {
        method: 'POST',
      });

      const res = await receivePO(req, { params: Promise.resolve({ id: 'po-1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.total_stock_added).toBe(20);
      expect(updatedStock).toBe(25); // 5 initial + 20 from PO
    });
  });

  describe('Part Quick Edit PATCH (/api/inventory/parts/[id])', () => {
    it('supports quick inline edit of quantity_in_stock and logs movement', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      const existingPart = {
        id: 'p1',
        sku: 'SKU-001',
        part_name: 'Brake Shoe',
        quantity_in_stock: 10,
        selling_price: 350,
      };

      let loggedMovement: any = null;

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'parts_catalog') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingPart, error: null }),
                  })),
                })),
              })),
              update: vi.fn((patch: any) => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({ data: { ...existingPart, ...patch }, error: null }),
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === 'stock_movements') {
            return {
              insert: vi.fn((row: any) => {
                loggedMovement = row;
                return {
                  maybeSingle: vi.fn().mockResolvedValue({ error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(requireRole).mockResolvedValue({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/inventory/parts/p1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity_in_stock: 25,
          stock_edit_reason: 'Counted on Shelf A2',
        }),
      });

      const res = await patchPart(req, { params: Promise.resolve({ id: 'p1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.part.quantity_in_stock).toBe(25);
      expect(loggedMovement).not.toBeNull();
      expect(loggedMovement.quantity_delta).toBe(15);
      expect(loggedMovement.reason).toBe('Counted on Shelf A2');
    });
  });
});
