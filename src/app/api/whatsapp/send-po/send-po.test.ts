import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as sendPoHandler } from './route';
import { POST as sendVipGreetingHandler } from '../send-vip-greeting/route';
import { POST as sendStockReceivedHandler } from '../send-stock-received/route';

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'whatsapp_config') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'cfg-1',
              account_id: 'acc-1',
              phone_number_id: 'phone-id-1',
              access_token: 'enc-token',
            },
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'contact-1',
                name: 'NABEEL PATHAN',
                company: 'NABEEL PATHAN',
                category: 'Wholesaler',
                phone: '+919761224004',
                phone_normalized: '919761224004',
              },
            ],
          }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'conversations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'conv-1' }],
          }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'messages') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'msg-1' } }),
        };
      }
      if (table === 'purchase_orders') {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    }),
  })),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn(() => 'decrypted-token'),
}));

describe('POST /api/whatsapp/send-po', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ id: 'wamid.HBgMOTE5NzYxMjI0MDA0' }],
        }),
      })
    );
  });

  it('rejects missing required fields with 400', async () => {
    const req = new Request('http://localhost/api/whatsapp/send-po', {
      method: 'POST',
      body: JSON.stringify({ poNumber: '' }),
    });
    const res = await sendPoHandler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('required');
  });

  it('successfully dispatches PO and logs to CRM Inbox', async () => {
    const req = new Request('http://localhost/api/whatsapp/send-po', {
      method: 'POST',
      body: JSON.stringify({
        poNumber: 'PO-2026-006',
        supplierName: 'NABEEL PATHAN',
        supplierPhone: '+91 97612 24004',
        items: [
          { part_name: 'Pulsar Clutch Plate Set', quantity: 10, total_cost: 4500 },
          { part_name: 'Splendor Brake Shoe', quantity: 20, total_cost: 3000 },
        ],
        totalItems: 2,
        totalUnits: 30,
        totalEstimatedCost: 7500,
      }),
    });

    const res = await sendPoHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.recipientPhone).toBe('919761224004');
    expect(body.conversationId).toBe('conv-1');
    expect(body.messageId).toBe('wamid.HBgMOTE5NzYxMjI0MDA0');
  });
});

describe('POST /api/whatsapp/send-vip-greeting', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ id: 'wamid.HBgMVIPGREETING001' }],
        }),
      })
    );
  });

  it('dispatches vip_greeting_message template to recipient', async () => {
    const req = new Request('http://localhost/api/whatsapp/send-vip-greeting', {
      method: 'POST',
      body: JSON.stringify({
        recipientPhone: '+919761224004',
        recipientName: 'Nabeel Bhai',
        salutation: 'Assalamu Alaikum',
        category: 'Wholesaler',
      }),
    });

    const res = await sendVipGreetingHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.recipientPhone).toBe('919761224004');
    expect(body.messageId).toBe('wamid.HBgMVIPGREETING001');
  });
});

describe('POST /api/whatsapp/send-stock-received', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ id: 'wamid.HBgMSTOCKRECV001' }],
        }),
      })
    );
  });

  it('dispatches distributor_stock_received template to wholesaler', async () => {
    const req = new Request('http://localhost/api/whatsapp/send-stock-received', {
      method: 'POST',
      body: JSON.stringify({
        poNumber: 'PO-2026-006',
        supplierName: 'NABEEL PATHAN',
        supplierPhone: '9761224004',
        salutation: 'Sir Ji',
        totalUnits: 30,
      }),
    });

    const res = await sendStockReceivedHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.recipientPhone).toBe('919761224004');
    expect(body.messageId).toBe('wamid.HBgMSTOCKRECV001');
  });
});
