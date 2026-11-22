/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

describe('Parts Catalog API (/api/inventory/parts)', () => {
  const orCalls: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    orCalls.length = 0;
  });

  it('normalizes Unicode dashes and tokenizes multi-word search query "Bajaj Pulsar 150 – Clutch Plate"', async () => {
    const { getCurrentAccount } = await import('@/lib/auth/account');

    const mockQueryBuilder: any = {
      select: vi.fn(() => mockQueryBuilder),
      eq: vi.fn(() => mockQueryBuilder),
      gt: vi.fn(() => mockQueryBuilder),
      in: vi.fn(() => mockQueryBuilder),
      or: vi.fn((clause: string) => {
        orCalls.push(clause);
        return mockQueryBuilder;
      }),
      order: vi.fn(() => mockQueryBuilder),
      range: vi.fn(() => Promise.resolve({
        data: [
          {
            id: 'part-1',
            part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
            brand: 'Bajaj',
            selling_price: 690,
          },
        ],
        count: 1,
        error: null,
      })),
    };

    const mockSupabase = {
      from: vi.fn(() => mockQueryBuilder),
    };

    vi.mocked(getCurrentAccount).mockResolvedValueOnce({
      supabase: mockSupabase as any,
      accountId: 'acc-123',
    } as any);

    const req = new NextRequest(
      'https://best-auto-parts-one.vercel.app/api/inventory/parts?search=Bajaj+Pulsar+150+%E2%80%93+Clutch+Plate',
      { method: 'GET' },
    );

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].part_name).toContain('Pulsar 150 Clutch Plate Set');

    // Verify that multi-token or clauses were attached, not a single unmatchable raw phrase
    expect(orCalls.length).toBeGreaterThan(1);
    expect(orCalls.some((c) => c.includes('Bajaj'))).toBe(true);
    expect(orCalls.some((c) => c.includes('Pulsar'))).toBe(true);
    expect(orCalls.some((c) => c.includes('150'))).toBe(true);
    expect(orCalls.some((c) => c.includes('Clutch'))).toBe(true);
    expect(orCalls.some((c) => c.includes('Plate'))).toBe(true);
  });
});
