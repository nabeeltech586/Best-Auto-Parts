import { describe, expect, it } from 'vitest';
import {
  validatePartPayload,
  normalizeAlternateOemNumbers,
  getStockStatus,
  formatCurrency,
} from './parts';

describe('validatePartPayload', () => {
  it('passes on valid complete part payload', () => {
    const result = validatePartPayload({
      part_name: 'Ceramic Front Brake Pads',
      sku: 'BP-TY-001',
      selling_price: 49.99,
      cost_price: 25.0,
      quantity_in_stock: 10,
      low_stock_threshold: 5,
      condition: 'OEM',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('fails if part_name is missing or whitespace', () => {
    const result = validatePartPayload({
      part_name: '   ',
      sku: 'BP-001',
      selling_price: 20,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.part_name).toBeDefined();
  });

  it('fails if sku is missing or has invalid characters', () => {
    const missingSku = validatePartPayload({
      part_name: 'Brake Pads',
      selling_price: 20,
    });
    expect(missingSku.valid).toBe(false);
    expect(missingSku.errors.sku).toBeDefined();

    const invalidCharsSku = validatePartPayload({
      part_name: 'Brake Pads',
      sku: 'SKU WITH SPACES!',
      selling_price: 20,
    });
    expect(invalidCharsSku.valid).toBe(false);
    expect(invalidCharsSku.errors.sku).toContain('alphanumeric');
  });

  it('validates prices and quantities must be non-negative', () => {
    const result = validatePartPayload({
      part_name: 'Brake Pads',
      sku: 'BP-01',
      selling_price: -10,
      cost_price: -5,
      quantity_in_stock: -1,
      low_stock_threshold: -2,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.selling_price).toBeDefined();
    expect(result.errors.cost_price).toBeDefined();
    expect(result.errors.quantity_in_stock).toBeDefined();
    expect(result.errors.low_stock_threshold).toBeDefined();
  });

  it('rejects invalid part condition', () => {
    const result = validatePartPayload({
      part_name: 'Brake Pads',
      sku: 'BP-01',
      selling_price: 10,
      // @ts-expect-error testing invalid enum
      condition: 'Refurbished',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.condition).toContain('Genuine, OEM, Aftermarket, Used');
  });
});

describe('normalizeAlternateOemNumbers', () => {
  it('handles comma and semicolon separated strings', () => {
    const input = '04465-02220, 04465-02240; 04465-12610 \n 04465-02220';
    const result = normalizeAlternateOemNumbers(input);
    expect(result).toEqual(['04465-02220', '04465-02240', '04465-12610']);
  });

  it('handles arrays and removes duplicates and empty strings', () => {
    const input = [' OEM-1 ', '', 'OEM-2', 'OEM-1'];
    const result = normalizeAlternateOemNumbers(input);
    expect(result).toEqual(['OEM-1', 'OEM-2']);
  });

  it('returns empty array on undefined or null', () => {
    expect(normalizeAlternateOemNumbers(undefined)).toEqual([]);
    expect(normalizeAlternateOemNumbers(null)).toEqual([]);
  });
});

describe('getStockStatus', () => {
  it('returns out_of_stock when quantity is 0', () => {
    const status = getStockStatus({ quantity_in_stock: 0, low_stock_threshold: 5 });
    expect(status.status).toBe('out_of_stock');
    expect(status.label).toBe('Out of Stock');
  });

  it('returns low_stock when quantity is at or below threshold', () => {
    const status = getStockStatus({ quantity_in_stock: 4, low_stock_threshold: 5 });
    expect(status.status).toBe('low_stock');
    expect(status.label).toBe('Low Stock');

    const exactThreshold = getStockStatus({ quantity_in_stock: 5, low_stock_threshold: 5 });
    expect(exactThreshold.status).toBe('low_stock');
  });

  it('returns in_stock when quantity exceeds threshold', () => {
    const status = getStockStatus({ quantity_in_stock: 12, low_stock_threshold: 5 });
    expect(status.status).toBe('in_stock');
    expect(status.label).toBe('In Stock');
  });
});

describe('formatCurrency', () => {
  it('formats standard currency values', () => {
    const formatted = formatCurrency(49.99);
    expect(formatted).toBe('$49.99');
  });
});
