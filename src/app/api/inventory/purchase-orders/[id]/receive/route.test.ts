/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

describe('Purchase Order Receive API (/api/inventory/purchase-orders/[id]/receive)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches by part_id, increments stock 4 -> 14, logs stock movement, and updates PO to RECEIVED', async () => {
    const { requireRole } = await import('@/lib/auth/account');

    const mockPo = {
      id: 'po-1',
      account_id: 'acc-1',
      po_number: 'PO-2026-001',
      supplier_name: 'HAMDAAN SPARE PARTS',
      supplier_phone: '+919634002453',
      total_units: 10,
      status: 'SENT',
      items: [
        {
          part_id: 'part-uuid-1',
          part_name: 'Hero Splendor Brake Shoe',
          sku: 'BAP-HERO-001',
          quantity: 10,
          cost_price: 180,
        },
      ],
    };

    const mockPart = {
      id: 'part-uuid-1',
      part_name: 'Hero Splendor Brake Shoe',
      sku: 'BAP-HERO-001',
      quantity_in_stock: 4,
    };

    let updatedCatalogPayload: any = null;
    let insertedMovement: any = null;
    let updatedPoPayload: any = null;

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'purchase_orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: mockPo, error: null }),
                })),
              })),
            })),
            update: vi.fn((payload: any) => {
              updatedPoPayload = payload;
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({
                        data: { ...mockPo, ...payload },
                        error: null,
                      }),
                    })),
                  })),
                })),
              };
            }),
          };
        }

        if (table === 'parts_catalog') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockPart, error: null }),
                })),
                // For metrics query
                is_active: vi.fn().mockResolvedValue({
                  data: [{ quantity_in_stock: 14, cost_price: 180, selling_price: 250, low_stock_threshold: 5 }],
                  error: null,
                }),
              })),
              ilike: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockPart, error: null }),
                })),
              })),
            })),
            update: vi.fn((payload: any) => {
              updatedCatalogPayload = payload;
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
            insert: vi.fn((payload: any) => {
              insertedMovement = payload;
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: payload, error: null }),
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
      userId: 'user-1',
    } as any);

    const req = new Request('https://test.com/api/inventory/purchase-orders/po-1/receive', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'po-1' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.total_stock_added).toBe(10);
    expect(data.updated_parts_count).toBe(1);

    // Verify stock incremented 4 -> 14
    expect(updatedCatalogPayload.quantity_in_stock).toBe(14);
    expect(updatedCatalogPayload.last_po_number).toBe('PO-2026-001');

    // Verify stock movement
    expect(insertedMovement.quantity_delta).toBe(10);
    expect(insertedMovement.quantity_before).toBe(4);
    expect(insertedMovement.quantity_after).toBe(14);
    expect(insertedMovement.reason).toContain('PO Received: #PO-2026-001 (HAMDAAN SPARE PARTS)');

    // Verify PO status updated
    expect(updatedPoPayload.status).toBe('RECEIVED');
    expect(updatedPoPayload.items[0].prev_stock).toBe(4);
    expect(updatedPoPayload.items[0].new_stock).toBe(14);
  });

  it('reliably falls back to matching by SKU when part_id is not set', async () => {
    const { requireRole } = await import('@/lib/auth/account');

    const mockPo = {
      id: 'po-2',
      account_id: 'acc-1',
      po_number: 'PO-2026-002',
      supplier_name: 'NEW DISTRIBUTOR',
      total_units: 5,
      status: 'SENT',
      items: [
        {
          part_id: '', // Empty part_id
          part_name: 'Bajaj Pulsar Clutch Plate',
          sku: 'BAP-BAJAJ-002',
          quantity: 5,
          cost_price: 320,
        },
      ],
    };

    const mockPart = {
      id: 'part-uuid-2',
      part_name: 'Bajaj Pulsar Clutch Plate',
      sku: 'BAP-BAJAJ-002',
      quantity_in_stock: 2,
    };

    let updatedCatalogPayload: any = null;

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'purchase_orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: mockPo, error: null }),
                })),
              })),
            })),
            update: vi.fn((payload: any) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: { ...mockPo, ...payload },
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
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  data: [{ quantity_in_stock: 7, cost_price: 320, selling_price: 450, low_stock_threshold: 5 }],
                })),
              })),
              ilike: vi.fn((col: string, val: string) => {
                if (col === 'sku' && val === 'BAP-BAJAJ-002') {
                  return {
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: mockPart, error: null }),
                    })),
                  };
                }
                return {
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                };
              }),
            })),
            update: vi.fn((payload: any) => {
              updatedCatalogPayload = payload;
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
              maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
            })),
          };
        }

        return {};
      }),
    };

    vi.mocked(requireRole).mockResolvedValueOnce({
      supabase: mockSupabase,
      accountId: 'acc-1',
      userId: 'user-1',
    } as any);

    const req = new Request('https://test.com/api/inventory/purchase-orders/po-2/receive', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'po-2' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(updatedCatalogPayload.quantity_in_stock).toBe(7); // 2 + 5 = 7
  });

  it('rejects receiving if PO is already marked as RECEIVED', async () => {
    const { requireRole } = await import('@/lib/auth/account');

    const mockPo = {
      id: 'po-3',
      account_id: 'acc-1',
      po_number: 'PO-2026-003',
      status: 'RECEIVED',
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

    vi.mocked(requireRole).mockResolvedValueOnce({
      supabase: mockSupabase,
      accountId: 'acc-1',
      userId: 'user-1',
    } as any);

    const req = new Request('https://test.com/api/inventory/purchase-orders/po-3/receive', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'po-3' }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('already been marked as received');
  });
});
