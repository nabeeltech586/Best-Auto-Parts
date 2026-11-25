import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { normalizeAlternateOemNumbers, validatePartPayload } from '@/lib/inventory/parts';
import { getMatchingPartImage } from '@/lib/partImages';
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

    // Vehicle Make & Bike Model filtering (Bajaj • Hero • Honda)
    if (vehicleManufacturer || vehicleModel) {
      // Check explicit vehicle_fitment entries if any
      let fitmentQuery = supabase
        .from('vehicle_fitment')
        .select('part_id')
        .eq('account_id', accountId);

      if (vehicleManufacturer) {
        fitmentQuery = fitmentQuery.ilike('manufacturer', `%${vehicleManufacturer}%`);
      }
      if (vehicleModel) {
        const modelWord = vehicleModel.split(/[\s/]+/)[0];
        fitmentQuery = fitmentQuery.ilike('model', `%${modelWord}%`);
      }

      const { data: matchedFitments } = await fitmentQuery;
      const matchedPartIds = (matchedFitments || []).map((f) => f.part_id);

      if (vehicleManufacturer) {
        const makeLower = vehicleManufacturer.toLowerCase();
        const makeOrFilters: string[] = [];

        if (makeLower.includes('baj')) {
          makeOrFilters.push(
            'sku.ilike.SKU-BAJ%',
            'sku.ilike.%BAJ%',
            'brand.ilike.%Bajaj%',
            'part_name.ilike.%Bajaj%',
            'part_name.ilike.%Pulsar%',
            'part_name.ilike.%Platina%',
            'part_name.ilike.%Discover%',
            'part_name.ilike.%Avenger%',
            'part_name.ilike.%CT 100%',
            'part_name.ilike.%Chetak%'
          );
        } else if (makeLower.includes('her')) {
          makeOrFilters.push(
            'sku.ilike.SKU-HER%',
            'sku.ilike.%HER%',
            'brand.ilike.%Hero%',
            'part_name.ilike.%Hero%',
            'part_name.ilike.%Splendor%',
            'part_name.ilike.%Deluxe%',
            'part_name.ilike.%Passion%',
            'part_name.ilike.%Glamour%',
            'part_name.ilike.%Xtreme%',
            'part_name.ilike.%Maestro%',
            'part_name.ilike.%Pleasure%'
          );
        } else if (makeLower.includes('hon')) {
          makeOrFilters.push(
            'sku.ilike.SKU-HON%',
            'sku.ilike.%HON%',
            'brand.ilike.%Honda%',
            'part_name.ilike.%Honda%',
            'part_name.ilike.%Activa%',
            'part_name.ilike.%Shine%',
            'part_name.ilike.%Unicorn%',
            'part_name.ilike.%Dio%',
            'part_name.ilike.%Hornet%',
            'part_name.ilike.%Dream%'
          );
        } else {
          makeOrFilters.push(
            `brand.ilike.%${vehicleManufacturer}%`,
            `part_name.ilike.%${vehicleManufacturer}%`,
            `sku.ilike.%${vehicleManufacturer}%`
          );
        }

        if (matchedPartIds.length > 0) {
          makeOrFilters.push(`id.in.(${matchedPartIds.join(',')})`);
        }

        query = query.or(makeOrFilters.join(','));
      } else if (matchedPartIds.length > 0) {
        query = query.in('id', matchedPartIds);
      }

      if (vehicleModel) {
        const cleanModel = vehicleModel.split(/[\s/]+/)[0];
        query = query.or(
          `part_name.ilike.%${cleanModel}%,description.ilike.%${cleanModel}%,sku.ilike.%${cleanModel}%`
        );
      }
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

    // Check pending purchase orders (SENT status) to flag ordered items awaiting delivery
    try {
      const { data: pendingOrders } = await supabase
        .from('purchase_orders')
        .select('po_number, sent_at, created_at, items')
        .eq('account_id', accountId)
        .eq('status', 'SENT');

      if (pendingOrders && pendingOrders.length > 0) {
        const pendingMap = new Map<string, { po_number: string; date: string }>();
        const pendingSkuMap = new Map<string, { po_number: string; date: string }>();
        const pendingNameMap = new Map<string, { po_number: string; date: string }>();

        for (const po of pendingOrders) {
          const poDate = po.sent_at || po.created_at;
          const poItems = Array.isArray(po.items) ? po.items : [];
          for (const it of poItems) {
            const info = { po_number: po.po_number, date: poDate };
            if (it?.part_id && !pendingMap.has(it.part_id)) {
              pendingMap.set(it.part_id, info);
            }
            if (it?.sku && !pendingSkuMap.has(it.sku.toLowerCase().trim())) {
              pendingSkuMap.set(it.sku.toLowerCase().trim(), info);
            }
            if (it?.part_name && !pendingNameMap.has(it.part_name.toLowerCase().trim())) {
              pendingNameMap.set(it.part_name.toLowerCase().trim(), info);
            }
          }
        }

        items = items.map((part) => {
          const pending =
            pendingMap.get(part.id) ||
            (part.sku ? pendingSkuMap.get(part.sku.toLowerCase().trim()) : null) ||
            (part.part_name ? pendingNameMap.get(part.part_name.toLowerCase().trim()) : null);
          return pending ? { ...part, pending_po: pending } : part;
        });
      }

      // Single source of truth: Cross-reference RECEIVED Purchase Orders to ensure exact last_restocked details
      const { data: receivedOrders } = await supabase
        .from('purchase_orders')
        .select('po_number, received_at, confirmed_at, created_at, items')
        .eq('account_id', accountId)
        .eq('status', 'RECEIVED')
        .order('received_at', { ascending: false });

      if (receivedOrders && receivedOrders.length > 0) {
        const restockMap = new Map<string, { po_number: string; date: string; quantity: number }>();
        const restockSkuMap = new Map<string, { po_number: string; date: string; quantity: number }>();
        const restockNameMap = new Map<string, { po_number: string; date: string; quantity: number }>();

        for (const po of receivedOrders) {
          const poDate = po.received_at || po.confirmed_at || po.created_at;
          const poItems = Array.isArray(po.items) ? po.items : [];
          for (const it of poItems) {
            const qty = Number(it?.quantity_added || it?.quantity || 0);
            const info = { po_number: po.po_number, date: poDate, quantity: qty };
            if (it?.part_id && !restockMap.has(it.part_id)) {
              restockMap.set(it.part_id, info);
            }
            if (it?.sku && !restockSkuMap.has(it.sku.toLowerCase().trim())) {
              restockSkuMap.set(it.sku.toLowerCase().trim(), info);
            }
            if (it?.part_name && !restockNameMap.has(it.part_name.toLowerCase().trim())) {
              restockNameMap.set(it.part_name.toLowerCase().trim(), info);
            }
          }
        }

        items = items.map((part) => {
          const restock =
            restockMap.get(part.id) ||
            (part.sku ? restockSkuMap.get(part.sku.toLowerCase().trim()) : null) ||
            (part.part_name ? restockNameMap.get(part.part_name.toLowerCase().trim()) : null);

          if (restock) {
            return {
              ...part,
              last_restocked_at: part.last_restocked_at || restock.date,
              last_po_number: part.last_po_number || restock.po_number,
              last_restocked_quantity:
                part.last_restocked_quantity && Number(part.last_restocked_quantity) > 0
                  ? Number(part.last_restocked_quantity)
                  : restock.quantity > 0
                  ? restock.quantity
                  : null,
            };
          }
          return part;
        });
      }
    } catch {
      // Non-fatal if purchase_orders is unavailable
    }

    // Ensure every part has a crisp, matching product thumbnail populated
    items = items.map((part) => {
      const resolvedImg = getMatchingPartImage(part);
      const existingUrl = part.image_url || (Array.isArray(part.image_urls) && part.image_urls[0]) || null;
      return {
        ...part,
        image_url: existingUrl || resolvedImg,
        image_urls: existingUrl ? (part.image_urls || [existingUrl]) : [resolvedImg],
      };
    });

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

    const initialImg =
      (body.image_url && typeof body.image_url === 'string' && body.image_url.trim()) ||
      (Array.isArray(body.image_urls) && body.image_urls[0]?.trim()) ||
      getMatchingPartImage({
        part_name: body.part_name,
        sku,
        category: body.category,
        subcategory: body.subcategory,
      });

    const row: Record<string, unknown> = {
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
      image_url: initialImg,
      image_urls: body.image_urls && body.image_urls.length > 0 ? body.image_urls : [initialImg],
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let { data: inserted, error: insertError } = await supabase
      .from('parts_catalog')
      .insert(row)
      .select()
      .single();

    if (insertError) {
      // Retry without image_url if column not yet migrated in Supabase
      const fallbackRow = { ...row };
      delete fallbackRow.image_url;
      const retry = await supabase
        .from('parts_catalog')
        .insert(fallbackRow)
        .select()
        .single();
      inserted = retry.data;
      insertError = retry.error;
    }

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
