import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockFrom = vi.fn();

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
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
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
        };
      }

      if (table === 'orders') {
        return {
          update: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }

      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: [mockContact], error: null }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }

      if (table === 'mechanic_ledger_entries') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
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
        };
      }

      return {};
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

  it('returns idempotent alreadyPaid: true if the record is already status PAID', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'payment_links') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'link-101',
                      order_id: 'BAP-ORD-101',
                      amount: 750,
                      paid_amount: 750,
                      remaining_amount: 0,
                      status: 'PAID',
                      payment_mode: 'UPI / QR',
                      phonepe_transaction_id: 'ALREADY_PAID_UTR',
                      paid_at: '2026-11-25T08:00:00.000Z',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'BAP-ORD-101',
        amount: 750,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alreadyPaid).toBe(true);
    expect(json.status).toBe('PAID');
    expect(json.remaining_amount).toBe(0);
  });

  it('records partial payment and calculates remaining balance', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'payment_links') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'link-102',
                      order_id: 'BAP-ORD-102',
                      merchant_transaction_id: 'BAP_ORD_102',
                      customer_name: 'Rahul Sharma',
                      customer_phone: '919876543211',
                      amount: 1200,
                      paid_amount: 0,
                      remaining_amount: 1200,
                      status: 'PENDING',
                    },
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'link-102',
                    status: 'PARTIAL',
                    paid_amount: 500,
                    remaining_amount: 700,
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'contact-1',
                  account_id: 'acc-1',
                  name: 'Rahul Sharma',
                  pending_balance: 1200,
                },
              ],
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'mechanic_ledger_entries') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
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
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'BAP-ORD-102',
        amount: 500,
        customer_name: 'Rahul Sharma',
        customer_phone: '919876543211',
        payment_mode: 'UPI / QR',
        utr: 'UTR500PARTIAL',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('PARTIAL');
    expect(json.amount).toBe(500);
    expect(json.total_amount).toBe(1200);
    expect(json.paid_amount).toBe(500);
    expect(json.remaining_amount).toBe(700);
  });

  it('resiliently falls back to structured metadata when DB lacks dedicated columns', async () => {
    let updateCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'payment_links') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'link-fallback-1',
                      order_id: 'ORD-7615',
                      merchant_transaction_id: 'BAP-ORD-7615-1234',
                      customer_name: 'NABEEL PATHAN',
                      customer_phone: '+919634722174',
                      part_details: 'Bajaj Pulsar 150 Clutch Plate Set',
                      amount: 2550,
                      status: 'PENDING',
                    },
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload) => {
            updateCallCount++;
            if (payload.paid_amount !== undefined) {
              // Simulate missing column or check constraint error on Attempt 1
              return {
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: 'column "paid_amount" of relation "payment_links" does not exist' },
                    }),
                  }),
                }),
              };
            }
            // Attempt 2 (fallback) succeeds
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'link-fallback-1',
                      order_id: 'ORD-7615',
                      merchant_transaction_id: 'BAP-ORD-7615-1234',
                      customer_name: 'NABEEL PATHAN',
                      customer_phone: '+919634722174',
                      part_details: payload.part_details,
                      phonepe_transaction_id: payload.phonepe_transaction_id,
                      amount: 2550,
                      status: 'PENDING',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }
      return {};
    });

    const req = new Request('http://localhost:3000/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'ORD-7615',
        amount: 1500,
        customer_name: 'NABEEL PATHAN',
        customer_phone: '+919634722174',
        payment_mode: 'UPI / QR',
        utr: 'UPI Ref 4123891024',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('PARTIAL');
    expect(json.amount).toBe(1500);
    expect(json.total_amount).toBe(2550);
    expect(json.paid_amount).toBe(1500);
    expect(json.remaining_amount).toBe(1050);
    expect(updateCallCount).toBe(2);
  });
});
