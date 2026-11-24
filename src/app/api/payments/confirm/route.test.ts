import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockOr = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const mockFrom = vi.fn((_table: string) => {
  return {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    eq: mockEq,
    or: mockOr,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
  };
});

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock('@/lib/flows/meta-send', () => ({
  loadAccountMetaCredentials: vi.fn().mockResolvedValue({
    phoneNumberId: 'phone-id-123',
    accessToken: 'token-xyz',
  }),
}));

vi.mock('@/lib/whatsapp/meta-api', () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ messageId: 'wamid-123' }),
}));

describe('POST /api/payments/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when amount is missing or invalid', async () => {
    const req = new Request('http://localhost:3000/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'BAP-ORD-1',
        amount: 0,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Valid payment amount is required');
  });

  it('records payment as PAID, updates Partner Ledger, and returns success receipt', async () => {
    const mockContact = {
      id: 'contact-test-1',
      account_id: 'acc-1',
      name: 'Rashid Khan',
      phone: '+919634722174',
      pending_balance: 500,
      khata_stage: 'Running Monthly Khata',
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'payment_links') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'link-1',
                  order_id: 'BAP-ORD-101',
                  status: 'PAID',
                  amount: 340,
                },
                error: null,
              }),
            }),
          }),
        } as unknown as ReturnType<typeof mockFrom>;
      }

      if (table === 'orders') {
        return {
          update: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as unknown as ReturnType<typeof mockFrom>;
      }

      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: [mockContact], error: null }),
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

      if (table === 'whatsapp_config') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { account_id: 'acc-1' },
                error: null,
              }),
            }),
          }),
        } as unknown as ReturnType<typeof mockFrom>;
      }

      return {} as unknown as ReturnType<typeof mockFrom>;
    });

    const req = new Request('http://localhost:3000/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'BAP-ORD-101',
        amount: 340,
        customer_name: 'Rashid Khan',
        customer_phone: '+919634722174',
        item_description: 'Hero Splendor Brake Shoe Set',
        payment_mode: 'UPI / QR',
        utr: '432109876543',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe('Payment Recorded & Ledger Updated!');
    expect(json.order_id).toBe('BAP-ORD-101');
    expect(json.amount).toBe(340);
    expect(json.utr).toBe('432109876543');
    expect(json.payment_mode).toBe('UPI / QR');
  });
});
