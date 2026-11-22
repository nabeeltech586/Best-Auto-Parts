import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractInventoryKeywords,
  searchInventoryForAi,
  formatInventoryContext,
  getSmartProductClarification,
  type InventoryContextResult,
} from './inventory-context';
import { buildSystemPrompt } from './defaults';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('extractInventoryKeywords', () => {
  it('extracts product name and vehicle model from English question', () => {
    const text = 'Do you have Pulsar 150 clutch plates in stock?';
    const result = extractInventoryKeywords(text);

    expect(result.componentKeywords).toContain('clutch');
    expect(result.vehicleCandidates).toContain('Pulsar 150');
    expect(result.vehicleCandidates).toContain('Pulsar');
    expect(result.isStockInquiry).toBe(true);
  });

  it('extracts intent and tokens from Hindi query', () => {
    const text = 'पल्सर 150 का क्लच प्लेट मिलेगा क्या और कीमत क्या है?';
    const result = extractInventoryKeywords(text);

    expect(result.componentKeywords).toContain('clutch');
    expect(result.vehicleCandidates).toContain('पल्सर');
    expect(result.isPriceInquiry).toBe(true);
    expect(result.isStockInquiry).toBe(true);
  });

  it('extracts intent and tokens from Hinglish query', () => {
    const text = 'Bhai Splendor ka air filter kitne ka hai?';
    const result = extractInventoryKeywords(text);

    expect(result.componentKeywords).toContain('air filter');
    expect(result.vehicleCandidates).toContain('Splendor');
    expect(result.isPriceInquiry).toBe(true);
  });

  it('extracts SKU patterns accurately', () => {
    const text = 'Check price and stock for SKU-BAJ-014 and BP-TY-001';
    const result = extractInventoryKeywords(text);

    expect(result.skuOrOemCandidates).toContain('SKU-BAJ-014');
    expect(result.skuOrOemCandidates).toContain('BP-TY-001');
    expect(result.isPriceInquiry).toBe(true);
    expect(result.isStockInquiry).toBe(true);
  });

  it('extracts OEM number patterns and model year', () => {
    const text = 'Is OEM 04465-02220 compatible with Honda City 2018?';
    const result = extractInventoryKeywords(text);

    expect(result.skuOrOemCandidates).toContain('04465-02220');
    expect(result.vehicleCandidates).toContain('City');
    expect(result.modelYear).toBe(2018);
    expect(result.isFitmentInquiry).toBe(true);
  });

  it('detects alternative parts inquiry', () => {
    const text = 'Any other alternative or option for this brake pad?';
    const result = extractInventoryKeywords(text);

    expect(result.isAlternativeInquiry).toBe(true);
    expect(result.componentKeywords).toContain('brake');
  });
});

describe('searchInventoryForAi — Tenant Isolation & Lookups', () => {
  let mockSupabase: SupabaseClient;
  const queriedTables: string[] = [];
  const appliedFilters: Record<string, unknown> = {};

  beforeEach(() => {
    queriedTables.length = 0;
    Object.keys(appliedFilters).forEach((k) => delete appliedFilters[k]);

    // Mock Supabase with tenant scoping
    mockSupabase = {
      from: vi.fn((table: string) => {
        queriedTables.push(table);
        const chain: Record<string, unknown> = {
          select: vi.fn(() => chain),
          eq: vi.fn((col: string, val: unknown) => {
            appliedFilters[`${table}.${col}`] = val;
            return chain;
          }),
          gt: vi.fn(() => chain),
          or: vi.fn(() => chain),
          in: vi.fn(() => chain),
          limit: vi.fn(() => {
            if (table === 'accounts') {
              return Promise.resolve({ data: { default_currency: 'INR' }, error: null });
            }
            if (table === 'parts_catalog') {
              return Promise.resolve({
                data: [
                  {
                    id: 'part-1',
                    account_id: 'tenant-123',
                    part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
                    sku: 'SKU-BAJ-014',
                    oem_number: 'OEM-BAJ-150',
                    alternate_oem_numbers: ['ALT-001'],
                    brand: 'Bajaj',
                    category: 'Transmission',
                    condition: 'OEM',
                    selling_price: 690,
                    quantity_in_stock: 15,
                    low_stock_threshold: 5,
                    description: 'Genuine Bajaj clutch plate set',
                    fitments: [
                      {
                        id: 'fit-1',
                        manufacturer: 'Bajaj',
                        model: 'Pulsar 150',
                        year_from: 2010,
                        year_to: 2023,
                        engine: '150cc DTS-i',
                        fuel_type: 'Petrol',
                      },
                    ],
                  },
                ],
                error: null,
              });
            }
            if (table === 'vehicle_fitment') {
              return Promise.resolve({
                data: [{ part_id: 'part-1' }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          }),
          maybeSingle: vi.fn(() => {
            if (table === 'accounts') {
              return Promise.resolve({ data: { default_currency: 'INR' }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        };
        return chain;
      }),
    } as unknown as SupabaseClient;
  });

  it('enforces account_id scoping on all inventory queries (tenant isolation)', async () => {
    const query = extractInventoryKeywords('Pulsar 150 clutch plate');
    const result = await searchInventoryForAi(mockSupabase, 'tenant-123', query);

    expect(appliedFilters['parts_catalog.account_id']).toBe('tenant-123');
    expect(appliedFilters['parts_catalog.is_active']).toBe(true);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].sku).toBe('SKU-BAJ-014');
    expect(result.currency).toBe('INR');
  });

  it('finds parts by SKU directly with verified fitments', async () => {
    const query = extractInventoryKeywords('Do you have SKU-BAJ-014?');
    const result = await searchInventoryForAi(mockSupabase, 'tenant-123', query);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].selling_price).toBe(690);
    expect(result.parts[0].quantity_in_stock).toBe(15);
    expect(result.parts[0].fitments).toHaveLength(1);
    expect(result.parts[0].fitments![0].model).toBe('Pulsar 150');
  });
});

describe('formatInventoryContext & Strict Accuracy Grounding', () => {
  it('formats verified in-stock part with currency, OEM, and vehicle compatibility', () => {
    const mockResult: InventoryContextResult = {
      parts: [
        {
          id: '1',
          account_id: 'acc-1',
          part_name: 'Pulsar 150 Clutch Plate Set',
          sku: 'SKU-BAJ-014',
          oem_number: 'OEM-BAJ-150',
          alternate_oem_numbers: ['ALT-001', 'ALT-002'],
          brand: 'Bajaj',
          category: 'Transmission',
          subcategory: 'Clutch',
          condition: 'OEM',
          description: 'High friction clutch plate set',
          cost_price: 450,
          selling_price: 690,
          quantity_in_stock: 15,
          low_stock_threshold: 5,
          location: 'Bin A-10',
          image_urls: [],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          fitments: [
            {
              id: 'f-1',
              account_id: 'acc-1',
              part_id: '1',
              vehicle_type: 'Motorcycle',
              manufacturer: 'Bajaj',
              model: 'Pulsar 150',
              variant: null,
              year_from: 2010,
              year_to: 2023,
              engine: '150cc',
              fuel_type: 'Petrol',
              notes: null,
              created_at: new Date().toISOString(),
            },
          ],
        },
      ],
      alternatives: [],
      query: extractInventoryKeywords('Pulsar 150 clutch plate price'),
      currency: 'INR',
      hasMatches: true,
    };

    const text = formatInventoryContext(mockResult);

    expect(text).toContain('Pulsar 150 Clutch Plate Set');
    expect(text).toContain('SKU: SKU-BAJ-014');
    expect(text).toContain('OEM Number: OEM-BAJ-150');
    expect(text).toContain('Alternate OEMs: ALT-001, ALT-002');
    expect(text).toContain('Selling Price: ₹690.00');
    expect(text).toContain('Availability: AVAILABLE (In Stock)');
    expect(text).not.toContain('15 units available');
    expect(text).toContain('STRICT STOCK PRIVACY: NEVER disclose exact stock quantities');
    expect(text).toContain('Bajaj Pulsar 150 (2010 - 2023)');
  });

  it('formats OUT OF STOCK accurately and offers in-stock alternatives without leaking unit counts', () => {
    const mockResult: InventoryContextResult = {
      parts: [
        {
          id: '2',
          account_id: 'acc-1',
          part_name: 'Front Fork Inner Pipe Assembly',
          sku: 'SKU-HER-007',
          oem_number: '51410-KCC-900',
          alternate_oem_numbers: [],
          brand: 'Hero',
          category: 'Suspension',
          subcategory: 'Front Fork',
          condition: 'OEM',
          description: 'Chrome plated fork pipe',
          cost_price: 800,
          selling_price: 1250,
          quantity_in_stock: 0, // OUT OF STOCK
          low_stock_threshold: 3,
          location: null,
          image_urls: [],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          fitments: [],
        },
      ],
      alternatives: [
        {
          id: 'alt-1',
          account_id: 'acc-1',
          part_name: 'Endurance Front Fork Assembly',
          sku: 'SKU-END-008',
          oem_number: null,
          alternate_oem_numbers: [],
          brand: 'Endurance',
          category: 'Suspension',
          subcategory: 'Front Fork',
          condition: 'Aftermarket',
          description: 'Direct replacement',
          cost_price: 700,
          selling_price: 1100,
          quantity_in_stock: 6,
          low_stock_threshold: 2,
          location: null,
          image_urls: [],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      query: extractInventoryKeywords('Hero front fork pipe'),
      currency: 'INR',
      hasMatches: true,
    };

    const text = formatInventoryContext(mockResult);

    expect(text).toContain('Availability: OUT OF STOCK');
    expect(text).not.toContain('0 units available');
    expect(text).toContain('=== AVAILABLE IN-STOCK ALTERNATIVES IN SAME CATEGORY ===');
    expect(text).toContain('Endurance Front Fork Assembly');
    expect(text).toContain('Availability: AVAILABLE (In Stock)');
    expect(text).not.toContain('Stock: 6 units');
  });

  it('formats explicit UNVERIFIED / NO MATCHING INVENTORY message when zero parts match', () => {
    const mockResult: InventoryContextResult = {
      parts: [],
      alternatives: [],
      query: extractInventoryKeywords('Ferrari Turbocharger 2026'),
      currency: 'INR',
      hasMatches: false,
    };

    const text = formatInventoryContext(mockResult);

    expect(text).toContain('UNVERIFIED / NO MATCHING INVENTORY RECORDS FOUND');
    expect(text).toContain('MANDATORY ASSISTANT INSTRUCTIONS');
    expect(text).toContain('Politely inform the customer that availability for this part cannot be verified');
    expect(text).toContain('offer assistance from our team');
  });

  it('embeds inventory context properly into buildSystemPrompt', () => {
    const inventoryContext = 'VERIFIED PART: Brake Pads ₹450 (Availability: AVAILABLE)';
    const prompt = buildSystemPrompt({
      userPrompt: 'You are Best Auto Spare Parts assistant.',
      mode: 'auto_reply',
      knowledge: ['Store is open 9am to 8pm'],
      inventoryContext,
    });

    expect(prompt).toContain('VERIFIED PART: Brake Pads ₹450 (Availability: AVAILABLE)');
    expect(prompt).toContain('Store is open 9am to 8pm');
    expect(prompt).toContain('Best Auto Spare Parts assistant');
    expect(prompt).toContain('[[HANDOFF]]');
    expect(prompt).toContain('=== REAL-TIME INVENTORY GROUNDING & AUTHORIZATION ===');
    expect(prompt).toContain('STRICT STOCK PRIVACY: Under NO circumstances disclose numeric stock quantities');
  });

  it('correctly extracts tokens for Bajaj Pulsar 150 clutch plate inquiry', () => {
    const text = 'Bhaiya Bajaj Pulsar 150 ka clutch plate kitne ka hai aur stock mein kitne hain?';
    const query = extractInventoryKeywords(text);

    expect(query.vehicleCandidates).toContain('Pulsar 150');
    expect(query.vehicleCandidates).toContain('Pulsar');
    expect(query.vehicleCandidates).toContain('Bajaj');
    expect(query.componentKeywords).toContain('clutch');
    expect(query.isPriceInquiry).toBe(true);
    expect(query.isStockInquiry).toBe(true);
  });

  it('extracts compatibility from description when fitments array is empty', () => {
    const mockResult: InventoryContextResult = {
      parts: [
        {
          id: 'part-pulsar-150',
          account_id: 'test-account',
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          sku: 'SKU-BAJ-014',
          oem_number: '36-DK-CLT-KIT',
          alternate_oem_numbers: [],
          brand: 'Bajaj',
          category: 'Transmission',
          subcategory: 'Clutch',
          condition: 'Genuine',
          cost_price: 450,
          selling_price: 690,
          quantity_in_stock: 15,
          low_stock_threshold: 3,
          location: 'Rack C-1',
          description: 'Compatible: Bajaj Pulsar 150 | UOM: Set | Quality: Genuine',
          image_urls: [],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          fitments: [],
        },
      ],
      alternatives: [],
      query: extractInventoryKeywords('Bhaiya Bajaj Pulsar 150 ka clutch plate kitne ka hai'),
      currency: 'INR',
      hasMatches: true,
    };

    const text = formatInventoryContext(mockResult);

    expect(text).toContain('Verified Compatible Vehicles: Bajaj Pulsar 150 (from catalog specifications)');
    expect(text).toContain('Selling Price: ₹690.00');
    expect(text).toContain('Availability: AVAILABLE (In Stock)');
    expect(text).not.toContain('15 units available');
    expect(text).toContain('DO NOT HAND OFF FOR NORMAL INQUIRIES');
    expect(text).toContain('WHEN TO HAND OFF: Output [[HANDOFF]] ONLY if');
  });

  describe('Spelling Mistakes & Incomplete Queries (Section 6)', () => {
    it('handles common bike and component typos in extractInventoryKeywords', () => {
      const resPulsr = extractInventoryKeywords('Pulsr 150 cluch plate');
      expect(resPulsr.vehicleCandidates).toContain('Pulsr 150');
      expect(resPulsr.componentKeywords).toContain('clutch');

      const resPulser = extractInventoryKeywords('Pulser 150 break pad');
      expect(resPulser.vehicleCandidates).toContain('Pulser 150');
      expect(resPulser.componentKeywords).toContain('brake');

      const resSplendr = extractInventoryKeywords('Splendr sproket');
      expect(resSplendr.vehicleCandidates).toContain('Splendr');
      expect(resSplendr.componentKeywords).toContain('chain sprocket');
    });

    it('returns exact Section 6 clarifications for incomplete or single-character messages', () => {
      // Pu
      expect(getSmartProductClarification('Pu', 'hinglish')).toBe(
        'Ji, kya aap Bajaj Pulsar ke spare parts dhoondh rahe hain? Kripya apni bike ka poora model aur required part ka naam batayein.'
      );
      expect(getSmartProductClarification('Pu', 'en')).toBe(
        'Are you looking for Bajaj Pulsar spare parts? Please share your complete bike model and the part you need.'
      );

      // Single char G
      expect(getSmartProductClarification('G', 'hinglish')).toBe(
        'Ji, aap kaunsa spare part dhoondh rahe hain? Product ka naam ya bike ka model likh dijiye.'
      );
      expect(getSmartProductClarification('G', 'en')).toBe(
        'Which spare part are you looking for? Please share the product name or your bike model.'
      );

      // Component without bike model
      expect(getSmartProductClarification('Cluch plate', 'hinglish')).toBe(
        'Ji, kya aap Clutch Plate ki baat kar rahe hain? Apni bike ka model bhi bata dijiye, taaki main sahi product check kar sakun.'
      );
      expect(getSmartProductClarification('Cluch plate', 'en')).toBe(
        'Are you looking for a clutch plate? Please share your bike model so I can check the correct product.'
      );

      expect(getSmartProductClarification('Break pad', 'hinglish')).toBe(
        'Ji, kya aap Brake Pad ki baat kar rahe hain? Apni bike ka model bata dijiye, taaki sahi part check kar sakun.'
      );

      expect(getSmartProductClarification('Price?', 'hinglish')).toBe(
        'Ji, aapko kis bike ke kaunse spare part ka price ya availability check karni hai? Product aur bike model bata dijiye.'
      );

      // Complete queries should return null (pass to search)
      expect(getSmartProductClarification('Pulsar 150 clutch plate', 'hinglish')).toBeNull();
      expect(getSmartProductClarification('Splendor brake shoe', 'en')).toBeNull();
    });
  });
});
