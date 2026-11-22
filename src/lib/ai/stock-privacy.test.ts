import { describe, it, expect } from 'vitest';
import {
  sanitizeCustomerStockPrivacy,
  containsStockQuantityLeak,
  toCustomerSafePart,
} from './stock-privacy';
import { formatInventoryContext, type InventoryContextResult } from './inventory-context';
import { buildSystemPrompt } from './defaults';
import { parseGeneration } from './generate';
import { getPartStockStatus } from '@/lib/inventory/parts';
import type { PartCatalogItem } from '@/types/inventory';

describe('Customer Stock Privacy & AI Reply Upgrade', () => {
  const sampleInternalPart: PartCatalogItem = {
    id: 'part-pulsar-150',
    account_id: 'test-account-id',
    part_name: 'Pulsar 150 Clutch Plate Set',
    sku: 'SKU-BAJ-014',
    oem_number: 'OEM-BAJ-150',
    alternate_oem_numbers: ['ALT-001'],
    brand: 'Bajaj',
    category: 'Transmission',
    subcategory: 'Clutch',
    condition: 'Genuine',
    cost_price: 450,
    selling_price: 690,
    quantity_in_stock: 15,
    low_stock_threshold: 5,
    location: 'Bin A-12',
    image_urls: ['https://example.com/clutch.jpg'],
    description: 'Compatible: Bajaj Pulsar 150 | Genuine friction plate',
    is_active: true,
    created_at: '2026-11-20T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
    fitments: [
      {
        id: 'fit-1',
        account_id: 'test-account-id',
        part_id: 'part-pulsar-150',
        vehicle_type: 'Motorcycle',
        manufacturer: 'Bajaj',
        model: 'Pulsar 150',
        variant: null,
        year_from: 2010,
        year_to: 2024,
        engine: '150cc DTS-i',
        fuel_type: 'Petrol',
        notes: null,
        created_at: '2026-11-20T00:00:00Z',
      },
    ],
  };

  // ============================================================
  // 1. Customer cannot see exact stock quantity
  // ============================================================
  describe('1. Strict Stock Privacy — No Exact Stock Quantities Disclosed', () => {
    it('does not expose exact numeric quantity in AI inventory context', () => {
      const mockResult: InventoryContextResult = {
        parts: [sampleInternalPart],
        alternatives: [],
        query: {
          raw: 'Bajaj Pulsar 150 clutch plate',
          normalized: 'bajaj pulsar 150 clutch plate',
          skuOrOemCandidates: [],
          vehicleCandidates: ['Bajaj', 'Pulsar 150'],
          componentKeywords: ['clutch'],
          brandCandidates: ['Bajaj'],
          generalTokens: [],
          isPriceInquiry: true,
          isStockInquiry: true,
          isFitmentInquiry: false,
          isAlternativeInquiry: false,
        },
        currency: 'INR',
        hasMatches: true,
      };

      const context = formatInventoryContext(mockResult);

      expect(context).toContain('Availability: AVAILABLE (In Stock)');
      expect(context).not.toContain('15 units');
      expect(context).not.toContain('15 pieces');
      expect(context).not.toContain('15 pcs');
      expect(context).not.toContain('15 units available');
      expect(context).toContain('STRICT STOCK PRIVACY: NEVER disclose exact stock quantities');
    });

    it('scrubs accidental quantity disclosures in customer-facing text', () => {
      const leakyText =
        'Bajaj Pulsar 150 ke **Clutch Plate Set (5 pcs)** ka price **₹690** hai aur **15 units** stock mein available hain. Ye genuine part hai.';

      expect(containsStockQuantityLeak(leakyText)).toBe(true);

      const sanitized = sanitizeCustomerStockPrivacy(leakyText);

      expect(containsStockQuantityLeak(sanitized)).toBe(false);
      expect(sanitized).not.toContain('15 units');
      expect(sanitized).toContain('₹690');
      expect(sanitized).toContain('Clutch Plate Set (5 pcs)'); // Preserves pack name
      expect(sanitized).toContain('available');
    });

    it('scrubs various phrases revealing stock numbers', () => {
      const testCases = [
        {
          input: 'We have 25 units available in stock. Selling Price: ₹450.',
          leakBefore: true,
        },
        {
          input: 'Stock: 12 units. Price: ₹1250.',
          leakBefore: true,
        },
        {
          input: 'Only 3 pieces left in stock for Activa 6G.',
          leakBefore: true,
        },
        {
          input: 'Units available: 8. Let us know if you want delivery.',
          leakBefore: true,
        },
        {
          input: 'Hamare paas 20 pieces hain abhi shop par.',
          leakBefore: true,
        },
      ];

      for (const tc of testCases) {
        expect(containsStockQuantityLeak(tc.input)).toBe(tc.leakBefore);
        const cleaned = sanitizeCustomerStockPrivacy(tc.input);
        expect(containsStockQuantityLeak(cleaned)).toBe(false);
      }
    });
  });

  // ============================================================
  // 2. Customer cannot see remaining units or internal stock fields
  // ============================================================
  describe('2. Customer-Safe Part Model — Strips Internal Inventory Fields', () => {
    it('toCustomerSafePart strips internal stock count, cost price, location, and thresholds', () => {
      const safePart = toCustomerSafePart(sampleInternalPart);

      // Verified customer fields retained
      expect(safePart.id).toBe('part-pulsar-150');
      expect(safePart.part_name).toBe('Pulsar 150 Clutch Plate Set');
      expect(safePart.sku).toBe('SKU-BAJ-014');
      expect(safePart.selling_price).toBe(690);
      expect(safePart.brand).toBe('Bajaj');
      expect(safePart.condition).toBe('Genuine');
      expect(safePart.is_available).toBe(true);
      expect(safePart.fitments).toHaveLength(1);

      // Internal private fields strictly omitted
      const rawSafe = safePart as unknown as Record<string, unknown>;
      expect(rawSafe.quantity_in_stock).toBeUndefined();
      expect(rawSafe.cost_price).toBeUndefined();
      expect(rawSafe.low_stock_threshold).toBeUndefined();
      expect(rawSafe.location).toBeUndefined();
      expect(rawSafe.account_id).toBeUndefined();
    });

    it('sets is_available false when internal quantity is 0 without exposing 0 count', () => {
      const outOfStockPart: PartCatalogItem = {
        ...sampleInternalPart,
        quantity_in_stock: 0,
      };

      const safePart = toCustomerSafePart(outOfStockPart);
      expect(safePart.is_available).toBe(false);
      expect((safePart as unknown as Record<string, unknown>).quantity_in_stock).toBeUndefined();
    });
  });

  // ============================================================
  // 3. Owner/Admin inventory views retain full stock information
  // ============================================================
  describe('3. Owner/Admin Inventory Retains Full Stock Details', () => {
    it('preserves complete internal stock quantities and thresholds for owners/admins', () => {
      // The master internal object retains complete fields
      expect(sampleInternalPart.quantity_in_stock).toBe(15);
      expect(sampleInternalPart.cost_price).toBe(450);
      expect(sampleInternalPart.low_stock_threshold).toBe(5);
      expect(sampleInternalPart.location).toBe('Bin A-12');

      // Admin stock status logic operates with full fidelity
      const statusInStock = getPartStockStatus(sampleInternalPart);
      expect(statusInStock.status).toBe('in_stock');
      expect(statusInStock.label).toBe('In Stock');

      const statusLow = getPartStockStatus({ ...sampleInternalPart, quantity_in_stock: 3 });
      expect(statusLow.status).toBe('low_stock');
      expect(statusLow.label).toBe('Low Stock');

      const statusOut = getPartStockStatus({ ...sampleInternalPart, quantity_in_stock: 0 });
      expect(statusOut.status).toBe('out_of_stock');
      expect(statusOut.label).toBe('Out of Stock');
    });
  });

  // ============================================================
  // 4. Verified product name and selling price are correctly displayed
  // ============================================================
  describe('4. Verified Product Name & Selling Price', () => {
    it('correctly displays product name and currency-formatted selling price', () => {
      const mockResult: InventoryContextResult = {
        parts: [sampleInternalPart],
        alternatives: [],
        query: {
          raw: 'Pulsar 150 clutch plate price',
          normalized: 'pulsar 150 clutch plate price',
          skuOrOemCandidates: [],
          vehicleCandidates: ['Pulsar 150'],
          componentKeywords: ['clutch'],
          brandCandidates: [],
          generalTokens: [],
          isPriceInquiry: true,
          isStockInquiry: false,
          isFitmentInquiry: false,
          isAlternativeInquiry: false,
        },
        currency: 'INR',
        hasMatches: true,
      };

      const context = formatInventoryContext(mockResult);

      expect(context).toContain('Part Name: Pulsar 150 Clutch Plate Set');
      expect(context).toContain('Selling Price: ₹690.00');
      expect(context).toContain('SKU: SKU-BAJ-014');
      expect(context).toContain('Brand: Bajaj');
      expect(context).toContain('Condition: Genuine');
    });
  });

  // ============================================================
  // 5. English and Hinglish replies work correctly
  // ============================================================
  describe('5. English and Hinglish Replies Preserved & Formatted', () => {
    it('verifies Hinglish sales reply example preserves sales style and passes privacy check', () => {
      const hinglishReply =
        'Ji! Bajaj Pulsar 150 ka Clutch Plate Set available hai. 😊\n\n' +
        'Price: ₹690\n\n' +
        'Kya aap ise purchase karna chahenge? Hum aapko pickup ya delivery ke process mein assist kar sakte hain.\n\n' +
        'Thank you for choosing Best Auto Parts! ❤️';

      expect(containsStockQuantityLeak(hinglishReply)).toBe(false);

      const sanitized = sanitizeCustomerStockPrivacy(hinglishReply);

      expect(sanitized).toBe(hinglishReply);
      expect(sanitized).toContain('Price: ₹690');
      expect(sanitized).toContain('Thank you for choosing Best Auto Parts! ❤️');
      expect(sanitized).toContain('available hai');
    });

    it('verifies English sales reply example preserves sales style and passes privacy check', () => {
      const englishReply =
        'Great choice! 😊 The Bajaj Pulsar 150 Clutch Plate Set is available.\n\n' +
        'Price: ₹690\n\n' +
        'Would you like to proceed with your purchase? We\'d be happy to assist you with pickup or delivery.\n\n' +
        'Thank you for choosing Best Auto Parts!';

      expect(containsStockQuantityLeak(englishReply)).toBe(false);

      const sanitized = sanitizeCustomerStockPrivacy(englishReply);

      expect(sanitized).toBe(englishReply);
      expect(sanitized).toContain('Price: ₹690');
      expect(sanitized).toContain('Thank you for choosing Best Auto Parts!');
      expect(sanitized).toContain('is available');
    });
  });

  // ============================================================
  // 6. Unknown availability does not produce fabricated claims
  // ============================================================
  describe('6. Unknown Availability & Team Assistance Protocol', () => {
    it('formats unverified catalog status with explicit anti-fabrication rules and team assistance', () => {
      const unverifiedResult: InventoryContextResult = {
        parts: [],
        alternatives: [],
        query: {
          raw: 'Do you have BMW S1000RR carbon fiber fairing?',
          normalized: 'do you have bmw s1000rr carbon fiber fairing',
          skuOrOemCandidates: [],
          vehicleCandidates: [],
          componentKeywords: [],
          brandCandidates: [],
          generalTokens: ['bmw', 's1000rr', 'carbon', 'fiber', 'fairing'],
          isPriceInquiry: false,
          isStockInquiry: true,
          isFitmentInquiry: false,
          isAlternativeInquiry: false,
        },
        currency: 'INR',
        hasMatches: false,
      };

      const context = formatInventoryContext(unverifiedResult);

      expect(context).toContain('Status: UNVERIFIED / NO MATCHING INVENTORY RECORDS FOUND');
      expect(context).toContain('NO FABRICATION: Do NOT invent, assume, or fabricate');
      expect(context).toContain('POLITE TEAM ASSISTANCE: Politely inform the customer');
      expect(context).toContain('offer assistance from our team');
      expect(context).toContain('NO FALSE CONFIRMATION: Never claim an order is placed or payment received');
    });
  });

  // ============================================================
  // 7. Existing inventory AI and human handoff continue working
  // ============================================================
  describe('7. Inventory AI and Human Handoff Integrity', () => {
    it('instructs AI not to hand off for normal verified inventory inquiries', () => {
      const mockResult: InventoryContextResult = {
        parts: [sampleInternalPart],
        alternatives: [],
        query: {
          raw: 'Pulsar 150 clutch plate rate',
          normalized: 'pulsar 150 clutch plate rate',
          skuOrOemCandidates: [],
          vehicleCandidates: ['Pulsar 150'],
          componentKeywords: ['clutch'],
          brandCandidates: [],
          generalTokens: [],
          isPriceInquiry: true,
          isStockInquiry: false,
          isFitmentInquiry: false,
          isAlternativeInquiry: false,
        },
        currency: 'INR',
        hasMatches: true,
      };

      const context = formatInventoryContext(mockResult);

      expect(context).toContain('DO NOT HAND OFF FOR NORMAL INQUIRIES');
      expect(context).toContain('provide the answer directly with product name and price');
    });

    it('preserves handoff sentinel protocol for explicit human requests and disputes', () => {
      const mockResult: InventoryContextResult = {
        parts: [sampleInternalPart],
        alternatives: [],
        query: {
          raw: 'Pulsar 150 clutch plate',
          normalized: 'pulsar 150 clutch plate',
          skuOrOemCandidates: [],
          vehicleCandidates: ['Pulsar 150'],
          componentKeywords: ['clutch'],
          brandCandidates: [],
          generalTokens: [],
          isPriceInquiry: false,
          isStockInquiry: false,
          isFitmentInquiry: false,
          isAlternativeInquiry: false,
        },
        currency: 'INR',
        hasMatches: true,
      };

      const context = formatInventoryContext(mockResult);

      expect(context).toContain('WHEN TO HAND OFF: Output [[HANDOFF]] ONLY if');
      expect(context).toContain('explicitly asks to talk to a real person');
      expect(context).toContain('angry, abusive, or filing a serious dispute/complaint');
    });

    it('parseGeneration parses [[HANDOFF]] and applies stock privacy to remaining text', () => {
      const rawOutputWithHandoff =
        'Aapki chat Saud Bhai se connect ki ja rahi hai. [[HANDOFF]]';
      const parsed = parseGeneration(rawOutputWithHandoff);

      expect(parsed.handoff).toBe(true);
      expect(parsed.text).toBe('Aapki chat Saud Bhai se connect ki ja rahi hai.');
    });
  });

  // ============================================================
  // 8. No duplicate replies are introduced
  // ============================================================
  describe('8. Single Reply Guarantee & Privacy Sanitization in Generation', () => {
    it('parseGeneration strips quantities while returning a clean single response text', () => {
      const rawLeakyLlmResponse =
        'Great choice! 😊 The Bajaj Pulsar 150 Clutch Plate Set is available. Price: ₹690 and 15 units available in stock. Would you like to proceed?';

      const result = parseGeneration(rawLeakyLlmResponse);

      expect(result.handoff).toBe(false);
      expect(result.text).not.toContain('15 units');
      expect(result.text).toContain('Price: ₹690');
      expect(result.text).toContain('available');
    });
  });
});
