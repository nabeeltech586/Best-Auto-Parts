import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await context.params;
    const body = await request.json();

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.firm_name !== undefined) patch.firm_name = body.firm_name.trim();
    if (body.contact_person !== undefined) patch.contact_person = body.contact_person?.trim() || null;
    if (body.whatsapp_number !== undefined) {
      let phone = String(body.whatsapp_number).replace(/[^0-9+]/g, '');
      if (!phone.startsWith('+')) {
        if (phone.length === 10) phone = `+91${phone}`;
        else if (phone.startsWith('91') && phone.length === 12) phone = `+${phone}`;
      }
      patch.whatsapp_number = phone;
    }
    if (body.brand_specialty !== undefined && Array.isArray(body.brand_specialty)) {
      patch.brand_specialty = body.brand_specialty.map((s: string) => String(s).trim()).filter(Boolean);
    }
    if (body.address !== undefined) patch.address = body.address?.trim() || null;
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

    const { data: updated, error } = await supabase
      .from('suppliers')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      console.error('[inventory/suppliers/[id] PATCH] Update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ supplier: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await context.params;

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[inventory/suppliers/[id] DELETE] Delete failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
