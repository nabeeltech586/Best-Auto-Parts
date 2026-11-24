import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim();
    const category = url.searchParams.get('category');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== 'All') {
      if (category === 'Customer') {
        query = query.or('category.eq.Customer,category.is.null');
      } else {
        query = query.eq('category', category);
      }
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%,unique_code.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query;
    if (error) {
      // Graceful fallback if any specific column issue arises
      const fallbackQuery = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      const fallbackContacts = (fallbackQuery.data || []).map((c) => ({
        ...c,
        pending_balance: Number(c.pending_balance ?? 0),
        unique_code: c.unique_code ?? null,
      }));

      return NextResponse.json({
        contacts: fallbackContacts,
        total: fallbackContacts.length,
      });
    }

    const contacts = (data || []).map((c) => ({
      ...c,
      pending_balance: Number(c.pending_balance ?? 0),
      unique_code: c.unique_code ?? null,
    }));

    return NextResponse.json({
      contacts,
      total: count ?? contacts.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
