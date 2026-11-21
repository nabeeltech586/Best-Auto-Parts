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
  'quality_review_notes',
] as const;

/**
 * Clean a single CSV cell value, trimming whitespace and stripping surrounding quotes.
 */
function cleanCell(val: string): string {
  let s = val.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/""/g, '"').trim();
  }
  return s;
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
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cleanCell(current));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(cleanCell(current));
  return result;
}

/**
 * Parse a raw CSV string into an array of row objects.
 * Handles UTF-8 BOM, quoted fields with commas, line breaks, and escaped quotes.
 */
export function parseCsv(csvText: string): Array<Record<string, string>> {
  if (!csvText || typeof csvText !== 'string') return [];

  // Strip UTF-8 BOM if present
  const clean = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

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

  // Parse header row (strip BOM, trim, lowercase, replace spaces/dashes with underscores)
  const headers = splitCsvRow(lines[0]).map((h) =>
    h
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_'),
  );

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvRow(lines[i]);
    if (values.every((v) => !v.trim())) continue; // skip empty line

    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = (values[idx] ?? '').trim();
    });
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Clean numeric string by removing currency symbols ($, ₹, €, £), commas, and spaces.
 */
function cleanNumericString(val: unknown, defaultStr = '0'): string {
  if (val === null || val === undefined) return defaultStr;
  const s = String(val).trim();
  if (!s) return defaultStr;
  // Remove currency signs, commas, spaces, but keep digits, decimal point, minus
  const cleaned = s.replace(/[^0-9.-]+/g, '');
  return cleaned || defaultStr;
}

/**
 * Validate imported rows and detect internal duplicate SKUs.
 * Supports standard automotive field aliases, Hindi & UTF-8 Unicode,
 * optional quality review notes, and currency/numeric formats.
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

  // Normalize existing SKUs to uppercase for case-insensitive duplicate checking
  const normalizedExistingSkus = new Set<string>();
  existingSkus.forEach((sku) => {
    if (sku) normalizedExistingSkus.add(sku.trim().toUpperCase());
  });

  rows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1

    // Extract fields with flexible alias support
    const partName = (
      row.part_name ||
      row.partname ||
      row.name ||
      row.product_name ||
      row.item_name ||
      row.title ||
      ''
    ).trim();

    const rawSku = (
      row.sku ||
      row.part_number ||
      row.partnumber ||
      row.item_number ||
      row.code ||
      ''
    ).trim();
    const sku = rawSku.toUpperCase();

    const oemNumber = (
      row.oem_number ||
      row.oem ||
      row.oem_no ||
      row.oem_part_number ||
      row.oe_number ||
      ''
    ).trim();

    const alternateOems = (
      row.alternate_oem_numbers ||
      row.alternate_oem ||
      row.alt_oem ||
      row.alternate_oems ||
      row.superseded_oem ||
      ''
    ).trim();

    const brand = (
      row.brand ||
      row.manufacturer ||
      row.make ||
      ''
    ).trim();

    const category = (
      row.category ||
      row.system ||
      row.part_category ||
      ''
    ).trim();

    const subcategory = (
      row.subcategory ||
      row.sub_category ||
      ''
    ).trim();

    const rawCondition = (
      row.condition ||
      row.part_condition ||
      'OEM'
    ).trim();

    const sellingPriceStr = cleanNumericString(
      row.selling_price || row.price || row.sale_price || row.mrp,
      '0',
    );
    const costPriceStr = cleanNumericString(
      row.cost_price || row.cost || row.buy_price || row.purchase_price,
      '0',
    );
    const quantityStr = cleanNumericString(
      row.quantity_in_stock || row.stock || row.quantity || row.qty,
      '0',
    );
    const lowStockStr = cleanNumericString(
      row.low_stock_threshold || row.threshold || row.min_stock || row.low_stock,
      '5',
    );

    const location = (
      row.location ||
      row.bin ||
      row.shelf ||
      row.rack ||
      row.warehouse_location ||
      ''
    ).trim();

    const qualityNotes = (
      row.quality_review_notes ||
      row.quality_notes ||
      row.quality ||
      ''
    ).trim();

    const rawDesc = (
      row.description ||
      row.desc ||
      row.details ||
      ''
    ).trim();

    // Combine description and quality notes if both are present
    const descParts = [
      rawDesc,
      qualityNotes ? `Quality notes: ${qualityNotes}` : '',
    ].filter(Boolean);
    const description = descParts.join(' | ') || undefined;

    // 1. Part name required (supports Hindi, English, all UTF-8 scripts)
    if (!partName) {
      errors.push({
        row: rowNum,
        field: 'part_name',
        message: 'Product/Part name is required',
      });
      return;
    }

    // 2. SKU required & unique
    if (!sku) {
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

    if (normalizedExistingSkus.has(sku)) {
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
        message: 'Selling price must be a valid non-negative number',
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
      (c) => c.toLowerCase() === rawCondition.toLowerCase(),
    );
    if (matchedCondition) {
      condition = matchedCondition;
    } else if (rawCondition && rawCondition.toLowerCase() !== 'oem') {
      errors.push({
        row: rowNum,
        sku,
        field: 'condition',
        message: `Invalid condition "${rawCondition}". Expected one of: ${PART_CONDITIONS.join(', ')}`,
      });
      return;
    }

    validRows.push({
      part_name: partName,
      sku,
      oem_number: oemNumber || undefined,
      alternate_oem_numbers: alternateOems || undefined,
      brand: brand || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      condition,
      cost_price: costPrice,
      selling_price: sellingPrice,
      quantity_in_stock: quantity,
      low_stock_threshold: lowStock,
      location: location || undefined,
      description,
      quality_review_notes: qualityNotes || undefined,
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
    'part_name,sku,oem_number,alternate_oem_numbers,brand,category,subcategory,condition,cost_price,selling_price,quantity_in_stock,low_stock_threshold,location,description,quality_review_notes',
    '"Ceramic Front Brake Pads",BP-TY-001,04465-02220,"04465-02240; 04465-12610",Brembo,Braking System,Brake Pads,OEM,25.00,49.99,18,5,"Shelf A-12","High performance ceramic front brake pads for Toyota / Lexus models.","Factory certified QA pass"',
    '"Engine Oil Filter",OF-TOY-01,04152-YZZA6,"04152-37010",Denso,Filtration,Oil Filters,Genuine,4.50,12.00,45,10,"Bin B-04","Genuine factory oil filter with O-rings included.","Batch inspection complete"',
    '"Alternator 130A",ALT-HON-130,31100-R40-A01,,Bosch,Electrical & Lighting,Alternators,Aftermarket,110.00,195.00,3,2,"Rack C-01","130-Amp direct fit replacement alternator.","Bench tested 14.2V output"',
  ].join('\n');
}
