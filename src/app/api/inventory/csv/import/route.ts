import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { parseCsv, validateCsvRows } from '@/lib/inventory/csv';
import { normalizeAlternateOemNumbers } from '@/lib/inventory/parts';
import { triggerCatalogSync } from '@/lib/catalog/meta-sync';
import type { CsvImportSummary } from '@/types/inventory';

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');

    const body = await request.json().catch(() => ({}));

    // Accept either raw CSV text (body.csv) OR pre-parsed row objects (body.rows or body.products)
    let parsedRows: Array<Record<string, string>> = [];

    if (typeof body.csv === 'string' && body.csv.trim()) {
      parsedRows = parseCsv(body.csv);
    } else if (Array.isArray(body.rows) && body.rows.length > 0) {
      // Normalize array of row objects into Record<string, string> for unified validation
      parsedRows = body.rows.map((r: Record<string, unknown>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          out[k] = v === null || v === undefined ? '' : String(v);
        }
        return out;
      });
    } else if (Array.isArray(body.products) && body.products.length > 0) {
      parsedRows = body.products.map((r: Record<string, unknown>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          out[k] = v === null || v === undefined ? '' : String(v);
        }
        return out;
      });
    } else {
      return NextResponse.json(
        { error: 'CSV file content or parsed product records are required' },
        { status: 400 },
      );
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty or does not contain data rows' },
        { status: 400 },
      );
    }

    // Load existing SKUs in account to catch collisions
    const { data: existingRecords } = await supabase
      .from('parts_catalog')
      .select('sku')
      .eq('account_id', accountId);

    const existingSkus = new Set<string>(
      (existingRecords || []).map((r) => r.sku.toUpperCase()),
    );

    // Validate rows with duplicate SKU detection
    const { validRows, errors, duplicateCount } = validateCsvRows(
      parsedRows,
      existingSkus,
    );

    // If there are zero valid rows and validation errors, return early with summary
    if (validRows.length === 0 && errors.length > 0) {
      const summary: CsvImportSummary = {
        totalRows: parsedRows.length,
        validRows: 0,
        imported: 0,
        skippedDuplicates: duplicateCount,
        errors,
      };
      return NextResponse.json(
        {
          error: 'No valid rows found to import. Please review validation errors.',
          summary,
        },
        { status: 400 },
      );
    }

    // Transform valid rows into database rows
    const dbRows = validRows.map((r) => ({
      account_id: accountId,
      part_name: r.part_name,
      sku: r.sku,
      oem_number: r.oem_number || null,
      alternate_oem_numbers: normalizeAlternateOemNumbers(r.alternate_oem_numbers),
      brand: r.brand || null,
      category: r.category || null,
      subcategory: r.subcategory || null,
      condition: r.condition || 'OEM',
      cost_price: Number(r.cost_price || 0),
      selling_price: Number(r.selling_price || 0),
      quantity_in_stock: Number(r.quantity_in_stock || 0),
      low_stock_threshold: Number(r.low_stock_threshold || 5),
      location: r.location || null,
      description: r.description || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    // Insert in batches of 50 to avoid request size limits
    const BATCH_SIZE = 50;
    let importedCount = 0;
    const insertedIds: Array<{ id: string; quantity: number }> = [];

    for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
      const batch = dbRows.slice(i, i + BATCH_SIZE);
      const { data: inserted, error: insertError } = await supabase
        .from('parts_catalog')
        .insert(batch)
        .select('id, quantity_in_stock');

      if (insertError) {
        console.error('[inventory/csv/import] Batch insert failed:', insertError);
        return NextResponse.json(
          { error: `Database error during import: ${insertError.message}` },
          { status: 500 },
        );
      }

      if (inserted) {
        importedCount += inserted.length;
        inserted.forEach((item) => {
          if (item.quantity_in_stock > 0) {
            insertedIds.push({ id: item.id, quantity: item.quantity_in_stock });
          }
        });
      }
    }

    // Log initial stock movements for imported items with starting stock
    if (insertedIds.length > 0) {
      const movementRows = insertedIds.map((item) => ({
        account_id: accountId,
        part_id: item.id,
        user_id: userId,
        movement_type: 'increase',
        quantity_delta: item.quantity,
        quantity_before: 0,
        quantity_after: item.quantity,
        reason: 'Bulk CSV Import',
      }));

      try {
        await supabase.from('stock_movements').insert(movementRows);
      } catch {
        // best effort stock movement logging
      }
    }

    const summary: CsvImportSummary = {
      totalRows: parsedRows.length,
      validRows: validRows.length,
      imported: importedCount,
      skippedDuplicates: duplicateCount,
      errors,
    };

    if (importedCount > 0) {
      const importedSkus = dbRows.map((r) => r.sku).filter(Boolean);
      void triggerCatalogSync({
        accountId,
        skus: importedSkus,
        reason: `Bulk CSV Import (${importedCount} products)`,
      });
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
