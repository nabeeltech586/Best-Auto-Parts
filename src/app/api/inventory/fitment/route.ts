import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { validateFitmentYearRange } from '@/lib/inventory/fitment';

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const body = await request.json();

    const {
      part_id,
      vehicle_type,
      manufacturer,
      model,
      variant,
      year_from,
      year_to,
      engine,
      fuel_type,
      notes,
    } = body;

    if (!part_id) {
      return NextResponse.json({ error: 'Part ID is required' }, { status: 400 });
    }
    if (!manufacturer?.trim()) {
      return NextResponse.json({ error: 'Vehicle manufacturer is required' }, { status: 400 });
    }
    if (!model?.trim()) {
      return NextResponse.json({ error: 'Vehicle model is required' }, { status: 400 });
    }

    const yearFromNum = parseInt(year_from, 10);
    const yearToNum = year_to !== undefined && year_to !== null && year_to !== '' ? parseInt(year_to, 10) : null;

    const yearValidation = validateFitmentYearRange(yearFromNum, yearToNum);
    if (!yearValidation.valid) {
      return NextResponse.json({ error: yearValidation.error }, { status: 400 });
    }

    // Verify part belongs to caller's account
    const { data: part, error: partError } = await supabase
      .from('parts_catalog')
      .select('id')
      .eq('id', part_id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (partError || !part) {
      return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    }

    const { data: fitment, error: insertError } = await supabase
      .from('vehicle_fitment')
      .insert({
        account_id: accountId,
        part_id,
        vehicle_type: vehicle_type?.trim() || 'Passenger Car',
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        variant: variant?.trim() || null,
        year_from: yearFromNum,
        year_to: yearToNum,
        engine: engine?.trim() || null,
        fuel_type: fuel_type?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[inventory/fitment POST] Insert failed:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ fitment }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
