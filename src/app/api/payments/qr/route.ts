import { NextRequest, NextResponse } from 'next/server';
import { generateQrPng } from '@/lib/payments/qr-generator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text =
      searchParams.get('text') ||
      'upi://pay?pa=9761224004-2@ybl&pn=Best%20Auto%20Parts&cu=INR';

    const png = generateQrPng(text, 6, 2);

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'QR Generation Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
