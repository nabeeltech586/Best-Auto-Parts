import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { buildMetaCatalogCsv, META_FEED_BASE_URL } from '@/lib/catalog/meta-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Cache for 60 seconds at edge

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId') || null;

    const db = supabaseAdmin();
    let query = db
      .from('parts_catalog')
      .select('*')
      .eq('is_active', true)
      .order('sku', { ascending: true });

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: parts, error } = await query;

    if (error) {
      console.error('[catalog/feed.csv] Failed to load parts:', error);
      return new NextResponse(`Error loading catalog feed: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Determine current request origin for base URL
    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const origin = host ? `${proto}://${host}` : META_FEED_BASE_URL;

    const csvContent = buildMetaCatalogCsv(parts || [], origin);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'inline; filename="meta-catalog-feed.csv"',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err: any) {
    console.error('[catalog/feed.csv] Unexpected error:', err);
    return new NextResponse(`Internal error: ${err.message || String(err)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
