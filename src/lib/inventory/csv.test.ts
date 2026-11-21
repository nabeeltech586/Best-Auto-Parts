import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  validateCsvRows,
  generatePartsCsv,
  generateSampleCsv,
} from './csv';
import type { PartCatalogItem } from '@/types/inventory';

describe('parseCsv', () => {
  it('parses standard unquoted CSV text', () => {
    const csv = `part_name,sku,selling_price,quantity_in_stock
Oil Filter,OF-01,12.50,20
Air Filter,AF-02,15.00,10`;

    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      part_name: 'Oil Filter',
      sku: 'OF-01',
      selling_price: '12.50',
      quantity_in_stock: '20',
    });
    expect(parsed[1].sku).toBe('AF-02');
  });

  it('handles quoted fields containing commas, line breaks, and escaped quotes', () => {
    const csv = `part_name,sku,description,selling_price
"Heavy Duty Brake Pads, Semi-Metallic",BP-99,"Special ""Pro"" edition with hardware, clips, and grease.",55.00`;

    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].part_name).toBe('Heavy Duty Brake Pads, Semi-Metallic');
    expect(parsed[0].description).toBe(
      'Special "Pro" edition with hardware, clips, and grease.',
    );
    expect(parsed[0].selling_price).toBe('55.00');
  });

  it('returns empty array when text has less than 2 rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('part_name,sku')).toEqual([]);
  });
});

describe('validateCsvRows', () => {
  it('validates correct rows and normalizes SKUs to uppercase', () => {
    const rows = [
      {
        part_name: 'Spark Plug Iridium',
        sku: 'sp-ir-01',
        selling_price: '8.50',
        cost_price: '4.00',
        quantity_in_stock: '50',
        condition: 'OEM',
      },
    ];

    const result = validateCsvRows(rows);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].sku).toBe('SP-IR-01');
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate SKUs within the same CSV file', () => {
    const rows = [
      { part_name: 'Part A', sku: 'SKU-100', selling_price: '10' },
      { part_name: 'Part B', sku: 'sku-100', selling_price: '12' }, // duplicate case-insensitive
    ];

    const result = validateCsvRows(rows);
    expect(result.validRows).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.errors.some((e) => e.field === 'sku' && e.message.includes('Duplicate SKU'))).toBe(true);
  });

  it('detects duplicate SKUs that already exist in database set', () => {
    const existing = new Set(['EXISTING-SKU-1']);
    const rows = [
      { part_name: 'Part Existing', sku: 'existing-sku-1', selling_price: '10' },
    ];

    const result = validateCsvRows(rows, existing);
    expect(result.validRows).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
    expect(result.errors.some((e) => e.message.includes('already exists in your inventory'))).toBe(true);
  });

  it('flags rows with missing part_name or invalid prices', () => {
    const rows = [
      { part_name: '', sku: 'SKU-VALID', selling_price: '10' },
      { part_name: 'Valid Name', sku: 'SKU-BAD-PRICE', selling_price: '-5' },
    ];

    const result = validateCsvRows(rows);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].field).toBe('part_name');
    expect(result.errors[1].field).toBe('selling_price');
  });
});

describe('generatePartsCsv & generateSampleCsv', () => {
  it('generates downloadable sample CSV containing expected columns and examples', () => {
    const sample = generateSampleCsv();
    expect(sample).toContain('part_name,sku,oem_number');
    expect(sample).toContain('Ceramic Front Brake Pads');
  });

  it('generates valid export CSV from parts array with proper quotation', () => {
    const parts: PartCatalogItem[] = [
      {
        id: '1',
        account_id: 'acc1',
        part_name: 'Front Rotor, Vented',
        sku: 'RT-01',
        oem_number: '43512-02250',
        alternate_oem_numbers: ['43512-12550'],
        brand: 'Brembo',
        category: 'Braking System',
        subcategory: 'Rotors',
        condition: 'OEM',
        description: 'Vented 296mm rotor',
        cost_price: 30,
        selling_price: 65,
        quantity_in_stock: 8,
        low_stock_threshold: 4,
        location: 'A-01',
        image_urls: [],
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const csv = generatePartsCsv(parts);
    expect(csv).toContain('Part Name,SKU,OEM Number');
    expect(csv).toContain('"Front Rotor, Vented"');
    expect(csv).toContain('RT-01');
    expect(csv).toContain('43512-02250');
  });
});
