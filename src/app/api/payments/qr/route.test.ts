import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('GET /api/payments/qr', () => {
  it('generates a valid PNG QR code image buffer with correct content-type header', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/payments/qr?text=upi%3A%2F%2Fpay%3Fpa%3D9761224004-2%40ybl%26pn%3DBest%2520Auto%2520Parts%26am%3D340%26cu%3DINR'
    );

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // 'P'
    expect(buffer[2]).toBe(0x4e); // 'N'
    expect(buffer[3]).toBe(0x47); // 'G'
  });

  it('uses default UPI URI if text param is omitted', async () => {
    const req = new NextRequest('http://localhost:3000/api/payments/qr');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});
