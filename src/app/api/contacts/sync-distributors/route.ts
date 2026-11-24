import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { syncDistributorsAndWholesalers } from '@/lib/contacts/distributor-sync';

export async function POST() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const result = await syncDistributorsAndWholesalers(supabase, accountId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const result = await syncDistributorsAndWholesalers(supabase, accountId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
