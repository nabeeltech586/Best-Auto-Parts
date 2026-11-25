import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockInsert = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockOr = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      eq: mockEq,
      or: mockOr,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    }),
  }),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (tok: string) => `decrypted_${tok}`,
}));

describe('POST /api/whatsapp/send-quote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('validates customerPhone and partDetails', async () => {
    const res = await POST(
      new Request('http://localhost/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/phone number is required/i);
  });

  it('validates 10-digit phone number', async () => {
    const res = await POST(
      new Request('http://localhost/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: '123',
          partDetails: 'Brake Shoe',
        }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/10-digit mobile number/i);
  });

  it('successfully creates quote-only message payload', async () => {
    const res = await POST(
      new Request('http://localhost/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Mohd Ali',
          customerPhone: '+91 96347 22174',
          partDetails: 'Hero Splendor Brake Shoe',
          amount: 280,
          isQuoteOnly: true,
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.recipientPhone).toBe('919634722174');
    expect(json.formattedMessage).toContain('Spare Part Quote — Best Auto Parts');
    expect(json.formattedMessage).toContain('Hero Splendor Brake Shoe');
    expect(json.formattedMessage).toContain('₹280.00');
  });

  it('successfully creates quote with BestPay link', async () => {
    const res = await POST(
      new Request('http://localhost/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Ramesh',
          customerPhone: '9876543210',
          partDetails: 'Bajaj Pulsar 150 Clutch Plate',
          amount: 650,
          orderId: 'ORD-TEST1',
          paymentLink: 'https://best-auto-parts-one.vercel.app/pay/ORD-TEST1',
          isQuoteOnly: false,
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.recipientPhone).toBe('919876543210');
    expect(json.formattedMessage).toContain('Payment Request & Part Quote');
    expect(json.formattedMessage).toContain('https://best-auto-parts-one.vercel.app/pay/ORD-TEST1');
    expect(json.formattedMessage).toContain('#ORD-TEST1');
  });

  it('formats multi-item cart breakdown cleanly in WhatsApp quote', async () => {
    const res = await POST(
      new Request('http://localhost/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Saud Bhai Customer',
          customerPhone: '9634722174',
          partDetails: '3 items',
          items: [
            { name: 'Clutch Cable', bikeModel: 'Pulsar 150', quantity: 2, unitPrice: 140 },
            { name: 'Ignition Switch Key Set', bikeModel: 'Splendor', quantity: 1, unitPrice: 380 },
          ],
          amount: 660,
          orderId: 'ORD-MULTI-1',
          paymentLink: 'https://best-auto-parts-one.vercel.app/pay/ORD-MULTI-1',
          isQuoteOnly: false,
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.formattedMessage).toContain('1. *Clutch Cable* (Pulsar 150) (x2) — ₹280.00');
    expect(json.formattedMessage).toContain('2. *Ignition Switch Key Set* (Splendor) (x1) — ₹380.00');
    expect(json.formattedMessage).toContain('Grand Total Due: ₹660.00');
    expect(json.formattedMessage).toContain('https://best-auto-parts-one.vercel.app/pay/ORD-MULTI-1');
  });
});
