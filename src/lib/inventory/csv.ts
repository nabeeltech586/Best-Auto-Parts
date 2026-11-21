import type {
  CsvImportRow,
  CsvImportSummary,
  CsvValidationError,
  PartCatalogItem,
  PartCondition,
} from '@/types/inventory';
import { PART_CONDITIONS } from '@/types/inventory';

/**
 * Standard CSV Header fields recognized by the Auto Parts importer.
 */
export const CSV_EXPECTED_HEADERS = [
  'part_name',
  'sku',
  'oem_number',
  'alternate_oem_numbers',
  'brand',
  'category',
  'subcategory',
  'condition',
  'cost_price',
  'selling_price',
  'quantity_in_stock',
  'low_stock_threshold',
  'location',
  'description',
] as const;

/**
 * Parse a raw CSV string into an array of objects.
 * Handles quoted fields containing commas, line breaks, and escaped quotes.
 */
export function parseCsv(csvText: string): Array<Record<string, string>> {
  const clean = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines: string[] = [];
  let currentLine = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentLine += '""';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
        currentLine += '"';
      }
    } else if (char === '\n' && !insideQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) lines.push(currentLine);

  if (lines.length < 2) return [];

  // Parse header
  const headers = splitCsvRow(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
  );

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvRow(lines[i]);
    if (values.every((v) => !v.trim())) continue; // skip blank line

    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = (values[idx] ?? '').trim();
    });
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Split a single CSV row into individual cell values, respecting quotes.
 */
function splitCsvRow(rowText: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowText.length; i++) {
    const char = rowText[i];
    const nextChar = rowText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Validate imported rows and detect internal duplicate SKUs.
 */
export function validateCsvRows(
  rows: Array<Record<string, string>>,
  existingSkus: Set<string> = new Set(),
): {
  validRows: CsvImportRow[];
  errors: CsvValidationError[];
  duplicateCount: number;
} {
  const validRows: CsvImportRow[] = [];
  const errors: CsvValidationError[] = [];
  const seenSkusInFile = new Set<string>();
  let duplicateCount = 0;

  rows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const partName = row.part_name || row.name || '';
    const sku = (row.sku || row.part_number || '').toUpperCase();
    const sellingPriceStr = row.selling_price || row.price || '0';
    const costPriceStr = row.cost_price || '0';
    const quantityStr = row.quantity_in_stock || row.stock || row.quantity || '0';
    const lowStockStr = row.low_stock_threshold || row.threshold || '5';
    const rawCondition = row.condition || 'OEM';

    // 1. Part name required
    if (!partName.trim()) {
      errors.push({
        row: rowNum,
        field: 'part_name',
        message: 'Product/Part name is required',
      });
      return;
    }

    // 2. SKU required & unique
    if (!sku.trim()) {
      errors.push({
        row: rowNum,
        field: 'sku',
        message: 'SKU is required',
      });
      return;
    }

    if (seenSkusInFile.has(sku)) {
      duplicateCount++;
      errors.push({
        row: rowNum,
        sku,
        field: 'sku',
        message: `Duplicate SKU "${sku}" found within the CSV file`,
      });
      return;
    }

    if (existingSkus.has(sku)) {
      duplicateCount++;
      errors.push({
        row: rowNum,
        sku,
        field: 'sku',
        message: `SKU "${sku}" already exists in your inventory`,
      });
      return;
    }

    seenSkusInFile.add(sku);

    // 3. Selling price validation
    const sellingPrice = parseFloat(sellingPriceStr);
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      errors.push({
        row: rowNum,
        sku,
        field: 'selling_price',
        message: 'Selling price must be a valid positive number',
      });
      return;
    }

    // 4. Cost price validation
    const costPrice = parseFloat(costPriceStr);
    if (isNaN(costPrice) || costPrice < 0) {
      errors.push({
        row: rowNum,
        sku,
        field: 'cost_price',
        message: 'Cost price must be a valid non-negative number',
      });
      return;
    }

    // 5. Quantity validation
    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity < 0) {
      errors.push({
        row: rowNum,
        sku,
        field: 'quantity_in_stock',
        message: 'Quantity in stock must be a non-negative integer',
      });
      return;
    }

    // 6. Threshold validation
    const lowStock = parseInt(lowStockStr, 10);
    if (isNaN(lowStock) || lowStock < 0) {
      errors.push({
        row: rowNum,
        sku,
        field: 'low_stock_threshold',
        message: 'Low stock threshold must be a non-negative integer',
      });
      return;
    }

    // 7. Condition validation
    let condition: PartCondition = 'OEM';
    const matchedCondition = PART_CONDITIONS.find(
      (c) => c.toLowerCase() === rawCondition.trim().toLowerCase(),
    );
    if (matchedCondition) {
      condition = matchedCondition;
    } else if (rawCondition.trim()) {
      errors.push({
        row: rowNum,
        sku,
        field: 'condition',
        message: `Invalid condition "${rawCondition}". Expected one of: ${PART_CONDITIONS.join(', ')}`,
      });
      return;
    }

    validRows.push({
      part_name: partName.trim(),
      sku: sku.trim(),
      oem_number: row.oem_number?.trim() || undefined,
      alternate_oem_numbers: row.alternate_oem_numbers?.trim() || undefined,
      brand: row.brand?.trim() || undefined,
      category: row.category?.trim() || undefined,
      subcategory: row.subcategory?.trim() || undefined,
      condition,
      cost_price: costPrice,
      selling_price: sellingPrice,
      quantity_in_stock: quantity,
      low_stock_threshold: lowStock,
      location: row.location?.trim() || undefined,
      description: row.description?.trim() || undefined,
    });
  });

  return { validRows, errors, duplicateCount };
}

/**
 * Generate a CSV download string from an array of parts.
 */
export function generatePartsCsv(parts: PartCatalogItem[]): string {
  const headers = [
    'Part Name',
    'SKU',
    'OEM Number',
    'Alternate OEMs',
    'Brand',
    'Category',
    'Subcategory',
    'Condition',
    'Cost Price',
    'Selling Price',
    'Quantity In Stock',
    'Low Stock Threshold',
    'Location',
    'Description',
  ];

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = parts.map((p) => [
    escapeCell(p.part_name),
    escapeCell(p.sku),
    escapeCell(p.oem_number ?? ''),
    escapeCell((p.alternate_oem_numbers ?? []).join('; ')),
    escapeCell(p.brand ?? ''),
    escapeCell(p.category ?? ''),
    escapeCell(p.subcategory ?? ''),
    escapeCell(p.condition),
    escapeCell(p.cost_price.toFixed(2)),
    escapeCell(p.selling_price.toFixed(2)),
    escapeCell(p.quantity_in_stock),
    escapeCell(p.low_stock_threshold),
    escapeCell(p.location ?? ''),
    escapeCell(p.description ?? ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Generate a sample CSV template for users to download and fill out.
 */
export function generateSampleCsv(): string {
  return [
    'part_name,sku,oem_number,alternate_oem_numbers,brand,category,subcategory,condition,cost_price,selling_price,quantity_in_stock,low_stock_threshold,location,description',
    '"Ceramic Front Brake Pads",BP-TY-001,04465-02220,"04465-02240; 04465-12610",Brembo,Braking,Brake Pads,OEM,25.00,49.99,18,5,"Shelf A-12","High performance ceramic front brake pads for Toyota / Lexus models."',
    '"Engine Oil Filter",OF-TOY-01,04152-YZZA6,"04152-37010",Denso,Filtration,Oil Filters,Genuine,4.50,12.00,45,10,"Bin B-04","Genuine factory oil filter with O-rings included."',
    '"Alternator 130A",ALT-HON-130,31100-R40-A01,,Bosch,Electrical,Alternators,Aftermarket,110.00,195.00,3,2,"Rack C-01","130-Amp direct fit replacement alternator."',
  ].join('\n');
}
