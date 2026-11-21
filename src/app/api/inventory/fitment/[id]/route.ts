import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await context.params;

    const { error } = await supabase
      .from('vehicle_fitment')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[inventory/fitment/[id] DELETE] Failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
