import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

const mockFrom = vi.fn();

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn().mockRejectedValue(new Error('No auth cookie')),
}));

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('/api/inventory/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns status and summary of pending items', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'po-1', po_number: 'PO-2026-001', status: 'RECEIVED' }],
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'payment_links') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'pl-1',
                    order_id: 'ORD-1',
                    merchant_transaction_id: 'TXN-1',
                    part_details: 'Brake Shoe (x1)',
                    amount: 250,
                    status: 'PAID',
                  },
                ],
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'stock_movements') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ready');
    expect(json.totalReceivedPOs).toBe(1);
    expect(json.totalPaidSales).toBe(1);
    expect(json.pendingSalesToDeduct).toBe(1);
  });

  it('POST reconciles PO items and deduces stock for confirmed sales', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'po-1',
                    po_number: 'PO-2026-001',
                    status: 'RECEIVED',
                    items: [
                      {
                        sku: 'SKU-HON-005',
                        part_name: 'Activa Key Switch',
                        quantity: 6,
                      },
                    ],
                    received_at: '2026-11-23T01:17:45.000Z',
                  },
                ],
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'parts_catalog') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'part-1',
                sku: 'SKU-HON-005',
                part_name: 'Activa Key Switch',
                quantity_in_stock: 10,
              },
            ],
            error: null,
          }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'payment_links') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'pl-1',
                    order_id: 'ORD-1',
                    merchant_transaction_id: 'TXN-1',
                    part_details: 'Activa Key Switch',
                    amount: 480,
                    status: 'PAID',
                  },
                ],
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            or: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'stock_movements') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [] }),
              })),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const req = new Request('http://localhost:3000/api/inventory/reconcile', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.reconciliationSummary.totalReceivedPOs).toBe(1);
    expect(json.reconciliationSummary.partsRestockedCount).toBe(1);
  });
});
