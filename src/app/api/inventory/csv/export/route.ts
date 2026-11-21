import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { generatePartsCsv } from '@/lib/inventory/csv';
import type { PartCatalogItem } from '@/types/inventory';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data: parts, error } = await supabase
      .from('parts_catalog')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('part_name', { ascending: true });

    if (error) {
      console.error('[inventory/csv/export] Query failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const csvContent = generatePartsCsv((parts || []) as PartCatalogItem[]);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `autoparts_inventory_${dateStr}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
