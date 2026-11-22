import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { normalizeAlternateOemNumbers, validatePartPayload } from '@/lib/inventory/parts';
import type { PartCatalogItem } from '@/types/inventory';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const brand = searchParams.get('brand')?.trim() || '';
    const condition = searchParams.get('condition')?.trim() || 'all';
    const stockStatus = searchParams.get('stockStatus')?.trim() || 'all';
    const vehicleManufacturer = searchParams.get('vehicleManufacturer')?.trim() || '';
    const vehicleModel = searchParams.get('vehicleModel')?.trim() || '';
    const sortBy = searchParams.get('sortBy') || 'updated_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const offset = (page - 1) * pageSize;

    // Base query
    let query = supabase
      .from('parts_catalog')
      .select('*, fitments:vehicle_fitment(*)', { count: 'exact' })
      .eq('account_id', accountId)
      .eq('is_active', true);

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (brand && brand !== 'all') {
      query = query.eq('brand', brand);
    }
    if (condition && condition !== 'all') {
      query = query.eq('condition', condition);
    }

    if (stockStatus === 'out_of_stock') {
      query = query.eq('quantity_in_stock', 0);
    } else if (stockStatus === 'in_stock') {
      query = query.gt('quantity_in_stock', 0);
    }

    // Vehicle Fitment subquery filtering
    if (vehicleManufacturer || vehicleModel) {
      let fitmentQuery = supabase
        .from('vehicle_fitment')
        .select('part_id')
        .eq('account_id', accountId);

      if (vehicleManufacturer) {
        fitmentQuery = fitmentQuery.ilike('manufacturer', `%${vehicleManufacturer}%`);
      }
      if (vehicleModel) {
        fitmentQuery = fitmentQuery.ilike('model', `%${vehicleModel}%`);
      }

      const { data: matchedFitments } = await fitmentQuery;
      const matchedPartIds = (matchedFitments || []).map((f) => f.part_id);
      if (matchedPartIds.length === 0) {
        return NextResponse.json({
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        });
      }
      query = query.in('id', matchedPartIds);
    }

    // Keyword Search
    if (search) {
      // Normalize Unicode dashes: en-dash \u2013, em-dash \u2014, minus \u2212, hyphen-like \u2010-\u2015
      const normalizedSearch = search.replace(/[\u2010-\u2015\u2212]/g, ' ').trim();
      const sanitized = normalizedSearch.replace(/[-–—/\\,]/g, ' ').trim();
      const words = sanitized.split(/\s+/).filter((w) => w.length > 0);

      if (words.length <= 1) {
        query = query.or(
          `part_name.ilike.%${normalizedSearch}%,sku.ilike.%${normalizedSearch}%,oem_number.ilike.%${normalizedSearch}%,brand.ilike.%${normalizedSearch}%,category.ilike.%${normalizedSearch}%`,
        );
      } else {
        // Multi-token search: all tokens match across brand, part_name, category, sku, oem_number
        for (const word of words) {
          query = query.or(
            `part_name.ilike.%${word}%,sku.ilike.%${word}%,oem_number.ilike.%${word}%,brand.ilike.%${word}%,category.ilike.%${word}%`,
          );
        }
      }
    }

    // Sorting
    const sortColumn =
      sortBy === 'name'
        ? 'part_name'
        : sortBy === 'sku'
          ? 'sku'
          : sortBy === 'price'
            ? 'selling_price'
            : sortBy === 'stock'
              ? 'quantity_in_stock'
              : 'updated_at';

    query = query
      .order(sortColumn, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('[inventory/parts GET] Query failed:', error);
      // Fallback if table doesn't exist yet in DB
      return NextResponse.json({
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        error: error.message,
      });
    }

    let items = (data || []) as PartCatalogItem[];

    // Client-side low stock filter since threshold is a column
    if (stockStatus === 'low_stock') {
      items = items.filter(
        (p) => p.quantity_in_stock > 0 && p.quantity_in_stock <= p.low_stock_threshold,
      );
    }

    const total = count ?? items.length;
    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      items,
      parts: items,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json();

    const validation = validatePartPayload(body);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const sku = body.sku.trim().toUpperCase();

    // Check for duplicate SKU in this account
    const { data: existingSku } = await supabase
      .from('parts_catalog')
      .select('id')
      .eq('account_id', accountId)
      .eq('sku', sku)
      .maybeSingle();

    if (existingSku) {
      return NextResponse.json(
        { error: `A part with SKU "${sku}" already exists in your inventory.` },
        { status: 409 },
      );
    }

    const alternateOems = normalizeAlternateOemNumbers(body.alternate_oem_numbers);
    const costPrice = parseFloat(body.cost_price || '0');
    const sellingPrice = parseFloat(body.selling_price || '0');
    const quantity = parseInt(body.quantity_in_stock || '0', 10);
    const threshold = parseInt(body.low_stock_threshold || '5', 10);

    const row = {
      account_id: accountId,
      part_name: body.part_name.trim(),
      sku,
      oem_number: body.oem_number?.trim() || null,
      alternate_oem_numbers: alternateOems,
      brand: body.brand?.trim() || null,
      category: body.category?.trim() || null,
      subcategory: body.subcategory?.trim() || null,
      condition: body.condition || 'OEM',
      description: body.description?.trim() || null,
      cost_price: isNaN(costPrice) ? 0 : costPrice,
      selling_price: isNaN(sellingPrice) ? 0 : sellingPrice,
      quantity_in_stock: isNaN(quantity) ? 0 : Math.max(0, quantity),
      low_stock_threshold: isNaN(threshold) ? 5 : Math.max(0, threshold),
      location: body.location?.trim() || null,
      image_urls: Array.isArray(body.image_urls) ? body.image_urls : [],
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabase
      .from('parts_catalog')
      .insert(row)
      .select()
      .single();

    if (insertError) {
      console.error('[inventory/parts POST] Insert failed:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Log initial stock movement if starting quantity > 0
    if (quantity > 0 && inserted?.id) {
      await supabase.from('stock_movements').insert({
        account_id: accountId,
        part_id: inserted.id,
        user_id: userId,
        movement_type: 'increase',
        quantity_delta: quantity,
        quantity_before: 0,
        quantity_after: quantity,
        reason: 'Initial inventory creation',
      });
    }

    return NextResponse.json({ item: inserted }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
