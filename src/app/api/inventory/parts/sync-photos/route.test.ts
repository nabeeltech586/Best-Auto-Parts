/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

describe('Sync Part Photos API (/api/inventory/parts/sync-photos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates parts with matched /parts/... photos', async () => {
    const { requireRole } = await import('@/lib/auth/account');

    const mockParts = [
      {
        id: 'p1',
        part_name: 'Brake Pad / ब्रेक पैड',
        sku: 'BP-001',
        category: 'Braking System',
        image_url: null,
        image_urls: [],
      },
      {
        id: 'p2',
        part_name: 'Exide 12V 4Ah Sealed Battery',
        sku: 'SKU-HER-019',
        category: 'Electrical',
        image_url: null,
        image_urls: [],
      },
    ];

    const updatePayloads: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'parts_catalog') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: mockParts, error: null }),
            })),
            update: vi.fn((payload: any) => {
              updatePayloads.push(payload);
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({ error: null }),
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
    } as any);

    const req = new Request('https://test.com/api/inventory/parts/sync-photos', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.updated_count).toBe(2);
    expect(updatePayloads[0].image_url).toBe('/parts/brake-pad.svg');
    expect(updatePayloads[1].image_url).toBe('/parts/battery.svg');
  });

  it('GET delegates to POST', async () => {
    const { requireRole } = await import('@/lib/auth/account');

    const mockSupabase: any = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };

    vi.mocked(requireRole).mockResolvedValueOnce({
      supabase: mockSupabase,
      accountId: 'acc-1',
    } as any);

    const req = new Request('https://test.com/api/inventory/parts/sync-photos');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
