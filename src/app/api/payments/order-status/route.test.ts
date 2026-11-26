import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockDb = {
  from: vi.fn(),
};

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => mockDb,
}));

describe('GET /api/payments/order-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns PAID status when record status is PAID', async () => {
    mockDb.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  order_id: 'BAP-ORD-101',
                  merchant_transaction_id: 'BAP_ORD_101',
                  customer_name: 'Mohd Ali',
                  customer_phone: '919876543210',
                  part_details: 'Clutch Plate Pulsar 150',
                  amount: 750,
                  paid_amount: 750,
                  remaining_amount: 0,
                  status: 'PAID',
                  payment_mode: 'UPI / QR',
                  razorpay_payment_id: 'UTR123456789012',
                  phonepe_transaction_id: 'UTR123456789012',
                  paid_at: '2026-11-25T08:00:00.000Z',
                  created_at: '2026-11-25T07:30:00.000Z',
                },
              }),
            }),
          }),
        }),
      }),
    });

    const req = new Request('http://localhost:3000/api/payments/order-status?order=BAP-ORD-101&amount=750');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('PAID');
    expect(json.totalAmount).toBe(750);
    expect(json.paidAmount).toBe(750);
    expect(json.remainingAmount).toBe(0);
    expect(json.customerName).toBe('Mohd Ali');
    expect(json.referenceId).toBe('UTR123456789012');
  });

  it('returns PARTIAL status when record status is PARTIAL and balance > 0', async () => {
    mockDb.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  order_id: 'BAP-ORD-102',
                  merchant_transaction_id: 'BAP_ORD_102',
                  customer_name: 'Rahul Sharma',
                  customer_phone: '919876543211',
                  part_details: 'Front Brake Disc & Pads',
                  amount: 1200,
                  paid_amount: 500,
                  remaining_amount: 700,
                  status: 'PARTIAL',
                  payment_mode: 'UPI / QR',
                  razorpay_payment_id: 'UTR500PARTIAL',
                  phonepe_transaction_id: 'UTR500PARTIAL',
                  paid_at: '2026-11-25T08:00:00.000Z',
                  created_at: '2026-11-25T07:30:00.000Z',
                },
              }),
            }),
          }),
        }),
      }),
    });

    const req = new Request('http://localhost:3000/api/payments/order-status?order=BAP-ORD-102&amount=1200');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('PARTIAL');
    expect(json.totalAmount).toBe(1200);
    expect(json.paidAmount).toBe(500);
    expect(json.remainingAmount).toBe(700);
    expect(json.customerName).toBe('Rahul Sharma');
  });

  it('returns PENDING status for unpaid orders', async () => {
    mockDb.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  order_id: 'BAP-ORD-103',
                  merchant_transaction_id: 'BAP_ORD_103',
                  customer_name: 'Imran Khan',
                  customer_phone: '919876543212',
                  part_details: 'Chain Sprocket Kit',
                  amount: 950,
                  paid_amount: 0,
                  remaining_amount: 950,
                  status: 'PENDING',
                  payment_mode: 'UPI / QR',
                  phonepe_transaction_id: null,
                  paid_at: null,
                  created_at: '2026-11-25T07:30:00.000Z',
                },
              }),
            }),
          }),
        }),
      }),
    });

    const req = new Request('http://localhost:3000/api/payments/order-status?order=BAP-ORD-103&amount=950');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('PENDING');
    expect(json.totalAmount).toBe(950);
    expect(json.paidAmount).toBe(0);
    expect(json.remainingAmount).toBe(950);
  });
});
