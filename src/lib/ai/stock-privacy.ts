import type { PartCatalogItem, CustomerFacingPart } from '@/types/inventory';

/**
 * Regex patterns to detect and scrub any exact stock quantities or unit counts
 * from customer-facing text, preventing internal inventory numbers from leaking.
 */
const STOCK_PRIVACY_REPLACEMENTS = [
  // 1. "aur 15 units stock mein available hain" / "aur **15 units** stock mein available hain"
  {
    regex: /\baur\s+(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|items?|nag)(?:\*{1,2}|_{1,2})?\s+(?:stock\s+mein\s+)?available\s+hain(?:\.)?/gi,
    replacement: 'aur ye available hai.',
  },
  // 2. "15 units stock mein available hain" / "**15 units** stock mein available hain"
  {
    regex: /\b(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|items?|nag)(?:\*{1,2}|_{1,2})?\s+stock\s+mein\s+available\s+hain(?:\.)?/gi,
    replacement: 'stock mein available hai.',
  },
  // 3. "Stock mein 15 units/pieces hain"
  {
    regex: /\bstock\s+mein\s+(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|items?|nag)(?:\*{1,2}|_{1,2})?\s*(?:available|hain|bache\s*hain)?(?:\.)?/gi,
    replacement: 'stock mein available hai.',
  },
  // 4. "Hamare paas 15 units hain"
  {
    regex: /\bhamare\s+paas\s+(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|items?|nag)(?:\*{1,2}|_{1,2})?\s*(?:available|hain)?(?:\.)?/gi,
    replacement: 'hamare paas ye available hai.',
  },
  // 5. "Stock: 15 units" / "Units available: 15" / "Remaining stock: 15" / "Stock count: 15"
  {
    regex: /\b(?:remaining\s+stock|stock(?:\s*level|\s*count|\s*quantity)?|units?\s*available|quantity(?:\s*in\s*stock)?)\s*:\s*(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|items?)?(?:\*{1,2}|_{1,2})?/gi,
    replacement: 'Status: Available',
  },
  // 6. "We have 15 units in stock" / "There are 15 units available"
  {
    regex: /\b(?:we\s+have|there\s+are)\s+(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|items?)(?:\*{1,2}|_{1,2})?\s*(?:currently\s+)?(?:in\s*stock|available)?\b/gi,
    replacement: 'it is available',
  },
  // 7. "15 units available" / "15 units in stock" / "15 pieces available"
  {
    regex: /\b(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|nag)(?:\*{1,2}|_{1,2})?\s+(?:are\s+)?(?:currently\s+)?(?:available|in\s*stock)\b/gi,
    replacement: 'available',
  },
  // 8. "only 5 pieces left" / "5 units remaining" / "5 units bache hain"
  {
    regex: /\b(?:only\s+)?(?:\*{1,2}|_{1,2})?\d+\s*(?:units?|pieces?|pcs|nag)(?:\*{1,2}|_{1,2})?\s*(?:left|remaining|bache\s*hain)\b/gi,
    replacement: 'available',
  },
  // 9. Standalone "**15 units**" or "15 units"
  {
    regex: /\b(?:\*{1,2}|_{1,2})?\d+\s*units(?:\*{1,2}|_{1,2})?\b/gi,
    replacement: 'available',
  },
];

/**
 * Normalizes Markdown bold to WhatsApp bold:
 * Replaces **text** with *text* to prevent broken double-asterisk markdown in WhatsApp chats.
 */
export function normalizeWhatsAppMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/\*\*(.*?)\*\*/g, '*$1*');
}

/**
 * Programmatic sanitization of customer-facing AI responses to enforce
 * strict stock privacy and clean WhatsApp formatting.
 * Strips exact counts while preserving smooth grammar and single-asterisk bold.
 */
export function sanitizeCustomerStockPrivacy(text: string): string {
  if (!text) return text;
  let result = text;
  for (const { regex, replacement } of STOCK_PRIVACY_REPLACEMENTS) {
    result = result.replace(regex, replacement);
  }
  // Strip packaging quantity suffixes like (5 pcs) or (5 Pcs) from customer text
  result = result.replace(/\s*\(\s*\d+\s*(?:pcs|pieces?|units?|nag|सेट|पीस|set)\s*\)/gi, '');
  // Normalize double-asterisk markdown to single-asterisk WhatsApp bold
  result = normalizeWhatsAppMarkdown(result);
  // Clean up horizontal whitespace and repeated periods without modifying newlines
  result = result
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .replace(/[^\S\r\n]+\./g, '.')
    .replace(/\.{2,}/g, '.');
  return result;
}

/**
 * Returns true if the string appears to disclose numeric stock counts or quantities.
 */
export function containsStockQuantityLeak(text: string): boolean {
  if (!text) return false;
  const clean = text.replace(/[*_]/g, '');
  const leakDetector =
    /\b\d+\s*(?:units?|pieces?|pcs|items?|nag)\s*(?:stock\s*mein|available|in\s*stock|left|remaining|bache\s*hain|hain)\b|\b(?:remaining\s*stock|stock|quantity|units\s*available)\s*:\s*\d+/i;
  return leakDetector.test(clean);
}

/**
 * Clean customer-facing product name by removing internal packaging quantity
 * suffixes (e.g. '(5 pcs)', '(5 Pcs)', '(10 nag)') and bilingual slashes,
 * while strictly preserving genuine vehicle fitment models like '(Pulsar / Platina)'.
 */
export function cleanCustomerFacingPartName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    // Remove packaging quantity suffixes like (5 pcs), (5 Pcs), (10 nag), (5 units), (4 set)
    .replace(/\s*\(\s*\d+\s*(?:pcs|pieces?|units?|nag|सेट|पीस|set)\s*\)/gi, '')
    // Remove bilingual Hindi slash suffix (e.g. ' / पल्सर 150 क्लच प्लेट सेट')
    .replace(/\s*\/\s*[\u0900-\u097F].*$/g, '')
    // Clean multiple spaces and trim
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Convert an internal PartCatalogItem into a privacy-safe CustomerFacingPart.
 * Completely excludes internal stock quantities, cost prices, thresholds, and bin locations.
 */
export function toCustomerSafePart(part: PartCatalogItem): CustomerFacingPart {
  return {
    id: part.id,
    part_name: cleanCustomerFacingPartName(part.part_name),
    sku: part.sku,
    oem_number: part.oem_number,
    alternate_oem_numbers: part.alternate_oem_numbers || [],
    brand: part.brand,
    category: part.category,
    subcategory: part.subcategory,
    condition: part.condition,
    description: part.description,
    selling_price: part.selling_price,
    image_urls: part.image_urls || [],
    is_available: typeof part.quantity_in_stock === 'number' ? part.quantity_in_stock > 0 : true,
    fitments: part.fitments,
  };
}
