import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data: suppliers, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('firm_name', { ascending: true });

    if (error) {
      console.error('[inventory/suppliers GET] Query failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ suppliers: suppliers || [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const body = await request.json();

    const firmName = body.firm_name?.trim();
    const contactPerson = body.contact_person?.trim() || null;
    let phone = body.whatsapp_number?.trim() || '';
    const brandSpecialty = Array.isArray(body.brand_specialty)
      ? body.brand_specialty.map((s: string) => String(s).trim()).filter(Boolean)
      : [];
    const address = body.address?.trim() || null;
    const notes = body.notes?.trim() || null;

    if (!firmName) {
      return NextResponse.json({ error: 'Firm name is required' }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: 'WhatsApp phone number is required' }, { status: 400 });
    }

    // Normalize phone number (ensure country code e.g. +91)
    phone = phone.replace(/[^0-9+]/g, '');
    if (!phone.startsWith('+')) {
      if (phone.length === 10) {
        phone = `+91${phone}`;
      } else if (phone.startsWith('91') && phone.length === 12) {
        phone = `+${phone}`;
      }
    }

    const { data: supplier, error } = await supabase
      .from('suppliers')
      .insert({
        account_id: accountId,
        firm_name: firmName,
        contact_person: contactPerson,
        whatsapp_number: phone,
        brand_specialty: brandSpecialty,
        address,
        notes,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('[inventory/suppliers POST] Insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
