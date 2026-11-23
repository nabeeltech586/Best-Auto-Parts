/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err: any) => new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500 })),
}));

vi.mock('@/lib/broadcast-audience', () => ({
  resolveAudienceContacts: vi.fn(),
}));

vi.mock('@/lib/whatsapp/broadcast-core', () => ({
  createBroadcast: vi.fn(),
  deliverBroadcast: vi.fn(),
  BroadcastError: class BroadcastError extends Error {
    constructor(public code: string, message: string, public status: number) {
      super(message);
    }
  },
}));

describe('Broadcasts API (/api/broadcasts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns broadcasts and computes delivery & read analytics', async () => {
      const { getCurrentAccount } = await import('@/lib/auth/account');

      const mockBroadcasts = [
        {
          id: 'b-1',
          name: 'Festival Promo',
          sent_count: 100,
          delivered_count: 90,
          read_count: 45,
          replied_count: 15,
          failed_count: 5,
        },
      ];

      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: mockBroadcasts, error: null }),
            })),
          })),
        })),
      };

      vi.mocked(getCurrentAccount).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
      } as any);

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.broadcasts.length).toBe(1);
      expect(data.analytics.total_sent).toBe(100);
      expect(data.analytics.total_delivered).toBe(90);
      expect(data.analytics.delivery_rate_percent).toBe(90);
      expect(data.analytics.read_rate_percent).toBe(50);
      expect(data.analytics.total_replied).toBe(15);
    });
  });

  describe('POST', () => {
    it('rejects request when template_name is missing', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: {} as any,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('template_name');
    });

    it('rejects selected_contacts when contact_ids is empty', async () => {
      const { requireRole } = await import('@/lib/auth/account');

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: {} as any,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: 'new_stock_update',
          audience_type: 'selected_contacts',
          contact_ids: [],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('contact ID must be selected');
    });

    it('creates broadcast strictly to selected contacts with auto-name and fallback', async () => {
      const { requireRole } = await import('@/lib/auth/account');
      const { resolveAudienceContacts } = await import('@/lib/broadcast-audience');
      const { createBroadcast } = await import('@/lib/whatsapp/broadcast-core');

      const mockContacts = [
        { id: 'c-1', name: 'Saud Bhai', phone: '+919634224004' },
        { id: 'c-2', name: '', phone: '+919761224004' }, // empty name -> fallback
      ];

      vi.mocked(resolveAudienceContacts).mockResolvedValueOnce(mockContacts as any);

      let createdParams: any = null;
      vi.mocked(createBroadcast).mockImplementationOnce(async (_db, _acc, _user, params: any) => {
        createdParams = params;
        return {
          broadcastId: 'b-new-1',
          planned: [{ contactId: 'c-1' }, { contactId: 'c-2' }],
          rejected: 0,
          duplicates: 0,
        } as any;
      });

      const mockSupabase: any = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      };

      vi.mocked(requireRole).mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: 'acc-1',
        userId: 'usr-1',
      } as any);

      const req = new Request('https://test.com/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Special Mechanic Restock',
          template_name: 'new_stock_update',
          audience_type: 'selected_contacts',
          contact_ids: ['c-1', 'c-2'],
          variables: {
            '1': { type: 'field', value: 'name', fallback: 'Valued Customer' },
          },
          dispatch: false,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(202);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.broadcast_id).toBe('b-new-1');
      expect(data.total_recipients).toBe(2);

      // Verify recipient params
      expect(createdParams.recipients).toEqual([
        { to: '+919634224004', params: ['Saud Bhai'] },
        { to: '+919761224004', params: ['Valued Customer'] },
      ]);
    });
  });
});
