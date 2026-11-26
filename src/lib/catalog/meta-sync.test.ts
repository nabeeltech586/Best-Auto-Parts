import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeCsvField,
  resolvePartBrand,
  resolvePartAvailability,
  resolvePartPrice,
  resolvePartLink,
  resolvePartImage,
  resolvePartDescription,
  buildMetaCatalogCsv,
  resolveCatalogId,
} from './meta-sync';

describe('meta-sync catalog engine', () => {
  describe('escapeCsvField', () => {
    it('escapes fields containing commas, quotes, and newlines', () => {
      expect(escapeCsvField('Hero Splendor, 100cc')).toBe('"Hero Splendor, 100cc"');
      expect(escapeCsvField('Pulsar "150" Brake')).toBe('"Pulsar ""150"" Brake"');
      expect(escapeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(escapeCsvField('NormalPart')).toBe('NormalPart');
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });
  });

  describe('resolvePartBrand', () => {
    it('identifies Bajaj parts from brand, SKU, or part name', () => {
      expect(resolvePartBrand({ brand: 'Bajaj Genuine' })).toBe('Bajaj');
      expect(resolvePartBrand({ sku: 'SKU-BAJ-008' })).toBe('Bajaj');
      expect(resolvePartBrand({ part_name: 'Pulsar 150 Clutch Plate' })).toBe('Bajaj');
      expect(resolvePartBrand({ part_name: 'Platina Front Fork Oil Seal' })).toBe('Bajaj');
    });

    it('identifies Hero parts from brand, SKU, or part name', () => {
      expect(resolvePartBrand({ brand: 'Hero MotoCorp' })).toBe('Hero');
      expect(resolvePartBrand({ sku: 'SKU-HER-BRK-001' })).toBe('Hero');
      expect(resolvePartBrand({ part_name: 'Splendor Plus Brake Shoe' })).toBe('Hero');
      expect(resolvePartBrand({ part_name: 'Deluxe Chain Sprocket' })).toBe('Hero');
    });

    it('identifies Honda parts from brand, SKU, or part name', () => {
      expect(resolvePartBrand({ brand: 'Honda' })).toBe('Honda');
      expect(resolvePartBrand({ sku: 'SKU-HON-ACT-005' })).toBe('Honda');
      expect(resolvePartBrand({ part_name: 'Activa 6G Air Filter' })).toBe('Honda');
      expect(resolvePartBrand({ part_name: 'Shine 125 Carburetor Flange' })).toBe('Honda');
    });

    it('falls back to custom brand or Best Auto Parts', () => {
      expect(resolvePartBrand({ brand: 'Bosch' })).toBe('Bosch');
      expect(resolvePartBrand({})).toBe('Best Auto Parts');
    });
  });

  describe('resolvePartAvailability', () => {
    it('returns "in stock" when stock > 0 and "out of stock" when stock <= 0', () => {
      expect(resolvePartAvailability({ quantity_in_stock: 12 })).toBe('in stock');
      expect(resolvePartAvailability({ quantity_in_stock: 1 })).toBe('in stock');
      expect(resolvePartAvailability({ quantity_in_stock: 0 })).toBe('out of stock');
      expect(resolvePartAvailability({ quantity_in_stock: -2 })).toBe('out of stock');
      expect(resolvePartAvailability({})).toBe('out of stock');
    });
  });

  describe('resolvePartPrice', () => {
    it('formats prices as standard Meta "<amount> INR"', () => {
      expect(resolvePartPrice({ selling_price: 85 })).toBe('85.00 INR');
      expect(resolvePartPrice({ selling_price: 1250.5 })).toBe('1250.50 INR');
      expect(resolvePartPrice({})).toBe('0.00 INR');
    });
  });

  describe('resolvePartDescription', () => {
    it('includes Kailashpur, Saharanpur store location and care contact', () => {
      const desc = resolvePartDescription({
        part_name: 'Hero Splendor Brake Shoe',
        brand: 'Hero',
        sku: 'SKU-HER-001',
      });
      expect(desc).toContain('Best Auto Parts');
      expect(desc).toContain('Kailashpur, Saharanpur, UP 247001');
      expect(desc).toContain('+91 96347 22174');
    });
  });

  describe('buildMetaCatalogCsv', () => {
    it('generates valid Meta CSV feed with standard headers and uncorrupted SKUs as id', () => {
      const mockParts = [
        {
          id: 'p1',
          sku: 'SKU-BAJ-008',
          part_name: 'Bajaj Pulsar 150 Clutch Plate',
          brand: 'Bajaj',
          quantity_in_stock: 15,
          selling_price: 350,
          image_url: 'https://best-auto-parts-one.vercel.app/parts/clutch.jpg',
        },
        {
          id: 'p2',
          sku: 'SKU-HER-002',
          part_name: 'Hero Splendor Brake Shoe',
          brand: 'Hero',
          quantity_in_stock: 0,
          selling_price: 85,
          image_url: null,
        },
      ];

      const csv = buildMetaCatalogCsv(mockParts, 'https://best-auto-parts-one.vercel.app');
      const lines = csv.split('\r\n');

      expect(lines[0]).toBe('id,title,description,availability,condition,price,link,image_link,brand');
      expect(lines.length).toBe(3);

      // Line 1: In-stock part
      expect(lines[1]).toContain('SKU-BAJ-008');
      expect(lines[1]).toContain('Bajaj Pulsar 150 Clutch Plate');
      expect(lines[1]).toContain('in stock');
      expect(lines[1]).toContain('350.00 INR');
      expect(lines[1]).toContain('Bajaj');

      // Line 2: Out-of-stock part
      expect(lines[2]).toContain('SKU-HER-002');
      expect(lines[2]).toContain('Hero Splendor Brake Shoe');
      expect(lines[2]).toContain('out of stock');
      expect(lines[2]).toContain('85.00 INR');
      expect(lines[2]).toContain('Hero');
    });
  });

  describe('resolveCatalogId', () => {
    const originalEnv = process.env.META_CATALOG_ID;

    beforeEach(() => {
      delete process.env.META_CATALOG_ID;
      delete process.env.WHATSAPP_CATALOG_ID;
    });

    afterEach(() => {
      if (originalEnv) process.env.META_CATALOG_ID = originalEnv;
    });

    it('resolves catalog ID from environment variable if set', async () => {
      process.env.META_CATALOG_ID = '987654321012345';
      const catId = await resolveCatalogId({} as any);
      expect(catId).toBe('987654321012345');
    });

    it('queries database whatsapp_config when env is not set', async () => {
      const mockDb: any = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { catalog_id: 'db_catalog_7788' },
                error: null,
              }),
            }),
          }),
        }),
      };

      const catId = await resolveCatalogId(mockDb);
      expect(catId).toBe('db_catalog_7788');
    });
  });
});
