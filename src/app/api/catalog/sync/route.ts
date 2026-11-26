import { NextResponse } from 'next/server';
import { getCurrentAccount } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  pushBatchToMetaCatalog,
  resolveCatalogId,
  META_FEED_BASE_URL,
} from '@/lib/catalog/meta-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    let accountId: string | null = null;
    try {
      const ctx = await getCurrentAccount();
      accountId = ctx.accountId;
    } catch {
      // Allow unauthenticated status check
    }

    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = host ? `${proto}://${host}` : META_FEED_BASE_URL;
    const feedUrl = `${baseUrl}/api/catalog/feed.csv`;

    const db = supabaseAdmin();
    let q = db
      .from('parts_catalog')
      .select('id, quantity_in_stock')
      .eq('is_active', true);

    if (accountId) q = q.eq('account_id', accountId);
    const { data: parts } = await q;

    const totalProducts = parts?.length || 0;
    let inStockCount = 0;
    let outOfStockCount = 0;

    for (const p of parts || []) {
      if ((Number(p.quantity_in_stock) || 0) > 0) inStockCount++;
      else outOfStockCount++;
    }

    const catalogId = await resolveCatalogId(db, accountId);

    return NextResponse.json({
      success: true,
      feedUrl,
      catalogId,
      totalProducts,
      inStockCount,
      outOfStockCount,
      directSyncEnabled: Boolean(catalogId),
      store: 'Best Auto Parts',
      phone: '+91 96347 22174',
      location: 'Kailashpur, Saharanpur, UP 247001',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let accountId: string | null = null;
    try {
      const ctx = await getCurrentAccount();
      accountId = ctx.accountId;
    } catch {
      // Best-effort
    }

    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = host ? `${proto}://${host}` : META_FEED_BASE_URL;

    const body = await request.json().catch(() => ({}));
    const skus = Array.isArray(body?.skus) ? body.skus : undefined;

    const result = await pushBatchToMetaCatalog({
      accountId,
      skus,
      baseUrl,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[catalog/sync POST] Error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
