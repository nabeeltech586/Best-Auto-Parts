import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { normalizeAlternateOemNumbers, validatePartPayload } from '@/lib/inventory/parts';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { id } = await context.params;

    const { data: part, error } = await supabase
      .from('parts_catalog')
      .select('*, fitments:vehicle_fitment(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      console.error('[inventory/parts/[id] GET] Query failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!part) {
      return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    }

    // Fetch recent stock movements for this part
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('part_id', id)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(20);

    const fitments = (part as { fitments?: unknown[] })?.fitments || [];

    return NextResponse.json({
      part,
      fitments,
      movements: movements || [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await context.params;
    const body = await request.json();

    // Verify part exists in this account
    const { data: existing, error: findError } = await supabase
      .from('parts_catalog')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (findError || !existing) {
      return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    }

    const validation = validatePartPayload({ ...existing, ...body });
    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const nextSku = (body.sku || existing.sku).trim().toUpperCase();

    // If SKU changed, check uniqueness
    if (nextSku !== existing.sku) {
      const { data: skuConflict } = await supabase
        .from('parts_catalog')
        .select('id')
        .eq('account_id', accountId)
        .eq('sku', nextSku)
        .neq('id', id)
        .maybeSingle();

      if (skuConflict) {
        return NextResponse.json(
          { error: `SKU "${nextSku}" is already in use by another product.` },
          { status: 409 },
        );
      }
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.part_name !== undefined) patch.part_name = body.part_name.trim();
    if (body.sku !== undefined) patch.sku = nextSku;
    if (body.oem_number !== undefined) patch.oem_number = body.oem_number?.trim() || null;
    if (body.alternate_oem_numbers !== undefined) {
      patch.alternate_oem_numbers = normalizeAlternateOemNumbers(body.alternate_oem_numbers);
    }
    if (body.brand !== undefined) patch.brand = body.brand?.trim() || null;
    if (body.category !== undefined) patch.category = body.category?.trim() || null;
    if (body.subcategory !== undefined) patch.subcategory = body.subcategory?.trim() || null;
    if (body.condition !== undefined) patch.condition = body.condition;
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.cost_price !== undefined) patch.cost_price = Math.max(0, parseFloat(body.cost_price) || 0);
    if (body.selling_price !== undefined) patch.selling_price = Math.max(0, parseFloat(body.selling_price) || 0);
    if (body.low_stock_threshold !== undefined) {
      patch.low_stock_threshold = Math.max(0, parseInt(body.low_stock_threshold, 10) || 5);
    }
    if (body.location !== undefined) patch.location = body.location?.trim() || null;
    if (body.image_urls !== undefined && Array.isArray(body.image_urls)) patch.image_urls = body.image_urls;
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

    const { data: updated, error: updateError } = await supabase
      .from('parts_catalog')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (updateError) {
      console.error('[inventory/parts/[id] PATCH] Update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ part: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { id } = await context.params;

    const { error } = await supabase
      .from('parts_catalog')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[inventory/parts/[id] DELETE] Delete failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
