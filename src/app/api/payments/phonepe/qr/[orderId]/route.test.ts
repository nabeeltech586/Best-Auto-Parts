import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('PhonePe QR Image Route (/api/payments/phonepe/qr/[orderId])', () => {
  it('returns a valid PNG image for a test order reference', async () => {
    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/qr/BAP_TXN_TEST123', {
      method: 'GET',
    });

    const res = await GET(req, {
      params: Promise.resolve({ orderId: 'BAP_TXN_TEST123' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    // Check PNG signature
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  it('returns 400 Bad Request when orderId is empty', async () => {
    const req = new NextRequest('https://best-auto-parts-one.vercel.app/api/payments/phonepe/qr/', {
      method: 'GET',
    });

    const res = await GET(req, {
      params: Promise.resolve({ orderId: '' }),
    });

    expect(res.status).toBe(400);
  });
});
