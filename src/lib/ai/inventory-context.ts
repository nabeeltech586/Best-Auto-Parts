import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage } from './types';
import type { PartCatalogItem, VehicleFitment } from '@/types/inventory';
import { formatVehicleFitment } from '@/lib/inventory/fitment';
import { formatCurrency } from '@/lib/inventory/parts';
import { cleanCustomerFacingPartName } from './stock-privacy';

export interface PartWithFitments extends PartCatalogItem {
  fitments?: VehicleFitment[];
}

export interface ExtractedInventoryQuery {
  raw: string;
  normalized: string;
  skuOrOemCandidates: string[];
  vehicleCandidates: string[];
  componentKeywords: string[];
  brandCandidates: string[];
  generalTokens: string[];
  modelYear?: number;
  isPriceInquiry: boolean;
  isStockInquiry: boolean;
  isFitmentInquiry: boolean;
  isAlternativeInquiry: boolean;
}

export interface InventoryContextResult {
  parts: PartWithFitments[];
  alternatives: PartWithFitments[];
  query: ExtractedInventoryQuery;
  currency: string;
  hasMatches: boolean;
}

// Known Indian & Global vehicle brands and popular models in auto parts catalogs
const KNOWN_VEHICLES: Array<{ make: string; models: string[]; aliases: string[] }> = [
  { make: 'Bajaj', models: ['Pulsar', 'Pulsar 150', 'Pulsar 180', 'Pulsar 220', 'Platina', 'Avenger', 'Discover', 'CT 100', 'Dominar', 'Chetak', 'Pulsr', 'Pulser', 'Plsr', 'Pulsur', 'Pulsr 150', 'Pulser 150', 'Platna'], aliases: ['बजाज', 'पल्सर', 'pulsr', 'pulser'] },
  { make: 'Hero', models: ['Splendor', 'Super Splendor', 'Splendor Plus', 'HF Deluxe', 'Glamour', 'Passion', 'Passion Pro', 'Xtreme', 'Xpulse', 'Pleasure', 'Maestro', 'Splendr', 'Slendor', 'Splender', 'Splendr Plus', 'Passn'], aliases: ['हीरो', 'स्प्लेंडर', 'ग्लैमर', 'splendr', 'slendor'] },
  { make: 'Honda', models: ['Activa', 'Activa 6G', 'Shine', 'CB Shine', 'Unicorn', 'Dio', 'Hornet', 'City', 'Civic', 'Amaze', 'Elevate', 'Actva', 'Aktiva', 'Acteva'], aliases: ['होंडा', 'एक्टिवा', 'actva', 'aktiva'] },
  { make: 'TVS', models: ['Apache', 'RTR 160', 'RTR 200', 'Jupiter', 'XL100', 'Raider', 'Ntorq', 'Sport', 'Star City'], aliases: ['टीवीएस', 'अपाचे', 'जुपिटर'] },
  { make: 'Royal Enfield', models: ['Bullet', 'Bullet 350', 'Classic 350', 'Meteor', 'Hunter', 'Himalayan', 'Continental GT'], aliases: ['रॉयल एनफील्ड', 'बुलेट', 'क्लासिक'] },
  { make: 'Yamaha', models: ['R15', 'MT 15', 'FZ', 'FZ-S', 'Fascino', 'RayZR', 'Aerox'], aliases: ['यामाहा'] },
  { make: 'Suzuki', models: ['Access', 'Access 125', 'Burgman', 'Gixxer', 'Hayate'], aliases: ['सुजुकी', 'एक्सेस'] },
  { make: 'KTM', models: ['Duke', 'Duke 200', 'Duke 250', 'Duke 390', 'RC 200', 'RC 390', 'Adventure'], aliases: ['ड्यूक'] },
  { make: 'Maruti Suzuki', models: ['Swift', 'Dzire', 'Baleno', 'Brezza', 'WagonR', 'Alto', 'Ertiga'], aliases: ['मारुति', 'स्विफ्ट'] },
  { make: 'Toyota', models: ['Innova', 'Innova Crysta', 'Fortuner', 'Corolla', 'Camry', 'Urban Cruiser', 'Glanza'], aliases: ['टोयोटा', 'इनोवा'] },
  { make: 'Hyundai', models: ['Creta', 'i20', 'i10', 'Venue', 'Verna', 'Tucson'], aliases: ['हुंडई', 'क्रेटा'] },
  { make: 'Tata', models: ['Nexon', 'Punch', 'Harrier', 'Safari', 'Tiago', 'Altroz'], aliases: ['टाटा', 'नेक्सॉन'] },
  { make: 'Mahindra', models: ['Scorpio', 'Scorpio-N', 'Thar', 'Bolero', 'XUV700', 'XUV300'], aliases: ['महिंद्रा', 'स्कॉर्पियो', 'थार'] },
];

// Common automotive parts and spare components in English, Hindi, and Hinglish
const COMPONENT_PATTERNS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'clutch', patterns: [/\bclutch\b/i, /\bclutch\s*plate\b/i, /\bcluch\b/i, /\bcluch\s*plate\b/i, /\bclutchplate\b/i, /\bclach\b/i, /क्लच/i, /क्लच\s*प्लेट/i] },
  { key: 'brake', patterns: [/\bbrake\b/i, /\bbrake\s*pad\b/i, /\bbrake\s*shoe\b/i, /\bbreak\b/i, /\bbreak\s*pad\b/i, /\bbreak\s*shoe\b/i, /\bbrek\b/i, /\bdisc\b/i, /\bdiscpad\b/i, /\bdisc\s*pad\b/i, /\brotor\b/i, /ब्रेक/i, /ब्रेक\s*पैड/i, /ब्रेक\s*शू/i] },
  { key: 'oil filter', patterns: [/\boil\s*filter\b/i, /ऑयल\s*फिल्टर/i, /ऑइल\s*फिल्टर/i] },
  { key: 'air filter', patterns: [/\bair\s*filter\b/i, /एयर\s*फिल्टर/i, /हवा\s*फिल्टर/i] },
  { key: 'filter', patterns: [/\bfilter\b/i, /\bfiltor\b/i, /\bfliter\b/i, /फिल्टर/i] },
  { key: 'spark plug', patterns: [/\bspark\s*plug\b/i, /\bplug\b/i, /\bplag\b/i, /स्पार्क\s*प्लग/i, /प्लग/i] },
  { key: 'piston', patterns: [/\bpiston\b/i, /\bcylinder\b/i, /पिस्टन/i, /सिलेंडर/i] },
  { key: 'chain sprocket', patterns: [/\bchain\b/i, /\bsprocket\b/i, /\bchin\b/i, /\bsproket\b/i, /\bchane\b/i, /\bdrive\s*chain\b/i, /चेन/i, /स्प्रोकेट/i] },
  { key: 'battery', patterns: [/\bbattery\b/i, /बैटरी/i] },
  { key: 'horn', patterns: [/\bhorn\b/i, /हॉर्न/i] },
  { key: 'tyre', patterns: [/\btyre\b/i, /\btire\b/i, /टायर/i] },
  { key: 'fork', patterns: [/\bfork\b/i, /\binner\s*pipe\b/i, /फोर्क/i, /पाइप/i] },
  { key: 'seat cover', patterns: [/\bseat\s*cover\b/i, /सीट\s*कवर/i] },
  { key: 'carburetor', patterns: [/\bcarburetor\b/i, /\bcarb\b/i, /कार्बोरेटर/i] },
  { key: 'alternator', patterns: [/\balternator\b/i, /अल्टरनेटर/i] },
  { key: 'engine oil', patterns: [/\bengine\s*oil\b/i, /\b20w[- ]?50\b/i, /\b10w[- ]?40\b/i, /इंजन\s*ऑयल/i] },
];

// Common auto parts brands
const KNOWN_BRANDS = [
  'Bosch',
  'Brembo',
  'Denso',
  'Hero',
  'Bajaj',
  'Honda',
  'Endurance',
  'ASK Automotive',
  'Rolon',
  'Champion',
  'NGK',
  'Amaron',
  'Exide',
  'CEAT',
  'MRF',
  'Minda',
  'Suprajit',
  'SKF',
  'Bando',
  'Spaco',
];

/**
 * Extract automotive search tokens, intents, SKUs, and vehicle keywords
 * from customer text across English, Hindi, and Hinglish.
 */
export function extractInventoryKeywords(
  customerText: string,
  history: ChatMessage[] = [],
): ExtractedInventoryQuery {
  const normalizedDashes = (customerText || '').replace(/[\u2010-\u2015\u2212]/g, ' - ');
  const raw = normalizedDashes.trim();
  const normalized = raw.toLowerCase();

  // Combine latest user text with previous user messages if short
  const contextLines = [customerText];
  if (customerText.split(/\s+/).length <= 4 && history.length > 0) {
    const prevUser = history
      .filter((m) => m.role === 'user')
      .slice(-2)
      .map((m) => m.content);
    contextLines.unshift(...prevUser);
  }
  const combinedText = contextLines.join(' ');
  const combinedNorm = combinedText.toLowerCase();

  // 1. Detect SKU or OEM candidate patterns (e.g. SKU-BAJ-014, BP-TY-001, 04465-02220)
  const skuOrOemCandidates: string[] = [];
  const skuRegex = /\b[A-Za-z]{2,5}-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g;
  let match: RegExpExecArray | null;
  while ((match = skuRegex.exec(raw)) !== null) {
    skuOrOemCandidates.push(match[0].toUpperCase());
  }
  const oemRegex = /\b\d{5}[-\s]?[A-Za-z0-9]{4,6}\b/g;
  while ((match = oemRegex.exec(raw)) !== null) {
    skuOrOemCandidates.push(match[0].toUpperCase().replace(/\s+/g, '-'));
  }

  // 2. Detect Vehicle Manufacturer & Model
  const vehicleCandidates: string[] = [];
  for (const v of KNOWN_VEHICLES) {
    if (combinedNorm.includes(v.make.toLowerCase())) {
      vehicleCandidates.push(v.make);
    }
    for (const model of v.models) {
      if (combinedNorm.includes(model.toLowerCase())) {
        vehicleCandidates.push(model);
      }
    }
    for (const alias of v.aliases) {
      if (combinedText.includes(alias)) {
        vehicleCandidates.push(alias);
      }
    }
  }

  // 3. Detect Component Keywords
  const componentKeywords: string[] = [];
  for (const comp of COMPONENT_PATTERNS) {
    if (comp.patterns.some((p) => p.test(combinedText))) {
      componentKeywords.push(comp.key);
    }
  }

  // 4. Detect Brands
  const brandCandidates: string[] = [];
  for (const brand of KNOWN_BRANDS) {
    if (combinedNorm.includes(brand.toLowerCase())) {
      brandCandidates.push(brand);
    }
  }

  // 5. Detect Model Year (e.g., 2018, 2015, 2022)
  let modelYear: number | undefined;
  const yearMatch = combinedText.match(/\b(19\d\d|20[0-2]\d)\b/);
  if (yearMatch) {
    modelYear = parseInt(yearMatch[1], 10);
  }

  // 6. Detect Intent Flags
  const isPriceInquiry =
    /\b(price|cost|rate|kitna|kitne|kitne ka|mrp|rupee|rs|₹)\b/i.test(combinedText) ||
    /कीमत|दाम|भाव|कितने का/i.test(combinedText);

  const isStockInquiry =
    /\b(stock|available|availability|pieces|piece|pcs|units|in stock|milega|hai kya|bacha hai)\b/i.test(
      combinedText,
    ) || /स्टॉक|मिलेगा|उपलब्ध|है क्या|कितना बचा/i.test(combinedText);

  const isFitmentInquiry =
    /\b(fit|fits|compatible|compatibility|lagega|lag jayega|chalega|suit|model)\b/i.test(
      combinedText,
    ) || /फिट|लगेगा|चलेगा|मैच|सपोर्ट/i.test(combinedText);

  const isAlternativeInquiry =
    /\b(alternative|substitute|similar|dusra|dusri|aur option|koi aur|another)\b/i.test(
      combinedText,
    ) || /दूसरा|कोई और|विकल्प/i.test(combinedText);

  // 7. General search tokens (strip stop words)
  const stopWords = new Set([
    'do', 'you', 'have', 'what', 'is', 'the', 'price', 'of', 'for', 'my', 'can',
    'please', 'tell', 'me', 'how', 'much', 'many', 'in', 'and', 'with', 'a', 'an',
    'hai', 'kya', 'bhai', 'batao', 'chahiye', 'ka', 'ki', 'ke', 'mein', 'me',
    'ye', 'yeh', 'ko', 'se', 'ho', 'hoga', 'gaye', 'kuch', 'bhi',
  ]);

  const generalTokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s-]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !stopWords.has(tok));

  return {
    raw,
    normalized,
    skuOrOemCandidates: Array.from(new Set(skuOrOemCandidates)),
    vehicleCandidates: Array.from(new Set(vehicleCandidates)),
    componentKeywords: Array.from(new Set(componentKeywords)),
    brandCandidates: Array.from(new Set(brandCandidates)),
    generalTokens: Array.from(new Set(generalTokens)),
    modelYear,
    isPriceInquiry,
    isStockInquiry,
    isFitmentInquiry,
    isAlternativeInquiry,
  };
}

/**
 * Detect whether a customer message has automotive inventory intent
 * (inquiring about parts, vehicles, brands, SKUs/OEMs, price, or stock).
 */
export function hasInventoryIntent(textOrQuery: string | ExtractedInventoryQuery): boolean {
  const query = typeof textOrQuery === 'string' ? extractInventoryKeywords(textOrQuery) : textOrQuery;
  return Boolean(
    query.skuOrOemCandidates.length > 0 ||
      query.componentKeywords.length > 0 ||
      query.vehicleCandidates.length > 0 ||
      query.brandCandidates.length > 0 ||
      query.isPriceInquiry ||
      query.isStockInquiry ||
      query.isFitmentInquiry,
  );
}

/**
 * Perform a tenant-isolated database lookup in parts_catalog and vehicle_fitment.
 */
export async function searchInventoryForAi(
  db: SupabaseClient,
  accountId: string,
  query: ExtractedInventoryQuery,
  limit = 6,
): Promise<InventoryContextResult> {
  // 1. Fetch account default currency
  let currency = 'USD';
  try {
    const { data: acct } = await db
      .from('accounts')
      .select('default_currency')
      .eq('id', accountId)
      .maybeSingle();
    if (acct?.default_currency) currency = acct.default_currency;
  } catch {
    // fallback USD
  }

  const matchedPartMap = new Map<string, PartWithFitments>();

  // Strategy A: Direct SKU or OEM match
  for (const candidate of query.skuOrOemCandidates) {
    const { data: skuMatches } = await db
      .from('parts_catalog')
      .select('*, fitments:vehicle_fitment(*)')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .or(`sku.ilike.%${candidate}%,oem_number.ilike.%${candidate}%`)
      .limit(limit);

    (skuMatches || []).forEach((p) => matchedPartMap.set(p.id, p as PartWithFitments));
  }

  // Strategy B1: Compound Vehicle + Component search (High Priority)
  // Finds exact vehicle-specific parts (e.g. Pulsar 150 + Clutch Plate)
  if (query.vehicleCandidates.length > 0 && query.componentKeywords.length > 0) {
    for (const veh of query.vehicleCandidates) {
      for (const comp of query.componentKeywords) {
        const { data: compoundMatches } = await db
          .from('parts_catalog')
          .select('*, fitments:vehicle_fitment(*)')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .or(`part_name.ilike.%${veh}%,description.ilike.%${veh}%`)
          .or(`part_name.ilike.%${comp}%,description.ilike.%${comp}%,category.ilike.%${comp}%`)
          .limit(limit);

        (compoundMatches || []).forEach((p) => matchedPartMap.set(p.id, p as PartWithFitments));
      }
    }
  }

  // Strategy B2: Vehicle Fitment query
  // If vehicle make or model was mentioned, query vehicle_fitment table
  if (query.vehicleCandidates.length > 0) {
    for (const veh of query.vehicleCandidates) {
      const { data: fitmentRows } = await db
        .from('vehicle_fitment')
        .select('part_id')
        .eq('account_id', accountId)
        .or(`manufacturer.ilike.%${veh}%,model.ilike.%${veh}%`)
        .limit(10);

      const partIds = (fitmentRows || []).map((f) => f.part_id).filter(Boolean);
      if (partIds.length > 0) {
        const { data: partsForVehicle } = await db
          .from('parts_catalog')
          .select('*, fitments:vehicle_fitment(*)')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .in('id', partIds)
          .limit(limit);

        (partsForVehicle || []).forEach((p) => matchedPartMap.set(p.id, p as PartWithFitments));
      }
    }
  }

  // Strategy C: Part Name & Keyword Search
  const searchTerms = [
    ...query.componentKeywords,
    ...query.vehicleCandidates,
    ...query.brandCandidates,
    ...query.generalTokens,
  ];

  for (const term of searchTerms) {
    if (term.length < 2) continue;

    const { data: textMatches } = await db
      .from('parts_catalog')
      .select('*, fitments:vehicle_fitment(*)')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .or(`part_name.ilike.%${term}%,description.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%`)
      .limit(limit);

    (textMatches || []).forEach((p) => matchedPartMap.set(p.id, p as PartWithFitments));
  }

  // Score and rank matched parts by relevance
  function scorePart(p: PartWithFitments): number {
    let score = 0;
    const nameLower = (p.part_name || '').toLowerCase();
    const descLower = (p.description || '').toLowerCase();
    const brandLower = (p.brand || '').toLowerCase();
    const catLower = (p.category || '').toLowerCase();

    // Matching vehicle model/make
    for (const v of query.vehicleCandidates) {
      const vl = v.toLowerCase();
      if (nameLower.includes(vl)) score += 30;
      else if (descLower.includes(vl)) score += 25;
    }

    // Matching component
    for (const c of query.componentKeywords) {
      const cl = c.toLowerCase();
      if (nameLower.includes(cl)) score += 20;
      else if (catLower.includes(cl) || descLower.includes(cl)) score += 15;
    }

    // Matching brand
    for (const b of query.brandCandidates) {
      const bl = b.toLowerCase();
      if (brandLower.includes(bl) || nameLower.includes(bl)) score += 10;
    }

    // Positive stock bonus
    if (p.quantity_in_stock > 0) score += 5;

    return score;
  }

  const parts = Array.from(matchedPartMap.values())
    .sort((a, b) => scorePart(b) - scorePart(a))
    .slice(0, limit);

  // Strategy D: In-stock alternatives if part is out-of-stock or alternative requested
  const alternatives: PartWithFitments[] = [];
  const needsAlternatives =
    query.isAlternativeInquiry ||
    (parts.length > 0 && parts.some((p) => p.quantity_in_stock <= 0));

  if (needsAlternatives && parts.length > 0) {
    const categories = Array.from(new Set(parts.map((p) => p.category).filter(Boolean)));
    const existingIds = new Set(parts.map((p) => p.id));

    for (const cat of categories) {
      const { data: altParts } = await db
        .from('parts_catalog')
        .select('*, fitments:vehicle_fitment(*)')
        .eq('account_id', accountId)
        .eq('category', cat)
        .eq('is_active', true)
        .gt('quantity_in_stock', 0)
        .limit(3);

      (altParts || []).forEach((p) => {
        if (!existingIds.has(p.id)) {
          alternatives.push(p as PartWithFitments);
          existingIds.add(p.id);
        }
      });
    }
  }

  return {
    parts,
    alternatives,
    query,
    currency,
    hasMatches: parts.length > 0,
  };
}

/**
 * Format retrieved database inventory into a structured, tamper-proof ground truth
 * block for the LLM system prompt.
 */
export function formatInventoryContext(res: InventoryContextResult): string {
  const { parts, alternatives, query, currency } = res;

  if (parts.length === 0) {
    const searchedTokens = [
      ...query.skuOrOemCandidates,
      ...query.vehicleCandidates,
      ...query.componentKeywords,
      ...query.generalTokens,
    ].filter(Boolean);

    return [
      '=== REAL-TIME INVENTORY DATABASE (TENANT VERIFIED) ===',
      `Searched Query: "${query.raw}"`,
      searchedTokens.length > 0 ? `Searched Items: ${searchedTokens.join(', ')}` : '',
      'Status: UNVERIFIED / NO MATCHING INVENTORY RECORDS FOUND.',
      '',
      'MANDATORY ASSISTANT INSTRUCTIONS:',
      '1. UNVERIFIED AVAILABILITY: The requested part/product is currently not verified in our catalog.',
      '2. NO FABRICATION: Do NOT invent, assume, or fabricate product availability, prices, discounts, or delivery promises.',
      '3. POLITE TEAM ASSISTANCE: Politely inform the customer that availability for this part cannot be verified right now, and offer assistance from our team/parts specialist to check or procure it.',
      '4. NO FALSE CONFIRMATION: Never claim an order is placed or payment received without actual confirmation.',
      '5. SUPPORTED LANGUAGES: Use ONLY English or natural Hinglish matching the customer\'s language.',
      '   - Hinglish Example: "Ji, is part ki availability abhi verify nahi ho pa rahi hai. Humari team se Saud Bhai aapki gaadi ke model ke hisaab se check karke jald hi assist karenge.\\n\\nThank you for choosing Best Auto Parts! ❤️"',
      '   - English Example: "We\'re currently unable to confirm availability for this specific part. Our team will be happy to assist you and check with our suppliers shortly.\\n\\nThank you for choosing Best Auto Parts!"',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const sections: string[] = [
    '=== REAL-TIME INVENTORY DATABASE (TENANT VERIFIED) ===',
    `Account Default Currency: ${currency}`,
    `Total Verified Matches: ${parts.length}`,
    '',
  ];

  parts.forEach((part, index) => {
    const isAvailable = part.quantity_in_stock > 0;
    const formattedPrice = formatCurrency(part.selling_price, currency);

    const fitmentList = (part.fitments || []).map((f) => formatVehicleFitment(f));

    sections.push(`[VERIFIED PART #${index + 1}]`);
    sections.push(`- Part Name: ${cleanCustomerFacingPartName(part.part_name)}`);
    sections.push(`- SKU: ${part.sku}`);
    if (part.oem_number) sections.push(`- OEM Number: ${part.oem_number}`);
    if (part.alternate_oem_numbers && part.alternate_oem_numbers.length > 0) {
      sections.push(`- Alternate OEMs: ${part.alternate_oem_numbers.join(', ')}`);
    }
    if (part.brand) sections.push(`- Brand: ${part.brand}`);
    if (part.category) sections.push(`- Category: ${part.category}`);
    sections.push(`- Condition: ${part.condition}`);
    sections.push(`- Selling Price: ${formattedPrice}`);
    sections.push(`- Availability: ${isAvailable ? 'AVAILABLE (In Stock)' : 'OUT OF STOCK'}`);

    const descFitment = part.description?.match(/Compatible:\s*([^|;\n]+)/i)?.[1]?.trim();

    if (fitmentList.length > 0) {
      sections.push('- Verified Compatible Vehicles:');
      fitmentList.forEach((fit) => sections.push(`  * ${fit}`));
    } else if (descFitment) {
      sections.push(`- Verified Compatible Vehicles: ${descFitment} (from catalog specifications)`);
    } else {
      sections.push(
        '- Verified Compatible Vehicles: No specific fitment records on file. (If customer asks, politely ask for their vehicle model & year to verify compatibility).',
      );
    }

    if (part.description) {
      sections.push(`- Product Details / Notes: ${part.description}`);
    }
    sections.push('');
  });

  if (alternatives.length > 0) {
    sections.push('=== AVAILABLE IN-STOCK ALTERNATIVES IN SAME CATEGORY ===');
    alternatives.forEach((alt, idx) => {
      const altPrice = formatCurrency(alt.selling_price, currency);
      sections.push(
        `[Alternative #${idx + 1}] ${cleanCustomerFacingPartName(alt.part_name)} (${alt.brand || 'OEM'}) | SKU: ${alt.sku} | Price: ${altPrice} | Availability: AVAILABLE (In Stock)`,
      );
    });
    sections.push('');
  }

  sections.push('=== MANDATORY RULES FOR AUTO PARTS SALES ASSISTANT ===');
  sections.push(
    '1. STRICT STOCK PRIVACY: NEVER disclose exact stock quantities, number of units, pieces remaining, or internal inventory counts to the customer under any circumstances. Never state how many units are in stock. State ONLY whether the item is available or out of stock. Never offer or show a stock-checking option.',
  );
  sections.push(
    '2. DATA ACCURACY: Quote verified product name and selling price ONLY from the verified records above. Never invent product availability, prices, discounts, or delivery promises.',
  );
  sections.push(
    '3. OUT OF STOCK / UNVERIFIED: If a part is OUT OF STOCK or availability cannot be verified, politely inform the customer and offer assistance from our team. If a verified alternative is listed above, offer it.',
  );
  sections.push(
    '4. SUPPORTED LANGUAGES: Support ONLY English and Hinglish (Hindi + English mix). Use the customer\'s language naturally. Do not use complex Hindi or pure Devanagari script unless requested; prefer natural Romanized Hinglish or English.',
  );
  sections.push(
    '5. SALES-ORIENTED STYLE & EXAMPLES:\n' +
    '   Keep responses concise, natural, helpful, and professional sales-oriented. Structure the message clearly:\n' +
    '   - Acknowledge the part warmly and state that it is available (without disclosing quantities).\n' +
    '   - Show verified price clearly on its own line: "Price: ₹690"\n' +
    '   - Politely ask if they would like to proceed with purchase and offer pickup or delivery assistance.\n' +
    '   - Conclude with: "Thank you for choosing Best Auto Parts!"\n\n' +
    '   Example Hinglish:\n' +
    '   "Ji! Bajaj Pulsar 150 ka Clutch Plate Set available hai. 😊\\n\\nPrice: ₹690\\n\\nKya aap ise purchase karna chahenge? Hum aapko pickup ya delivery ke process mein assist kar sakte hain.\\n\\nThank you for choosing Best Auto Parts! ❤️"\n\n' +
    '   Example English:\n' +
    '   "Great choice! 😊 The Bajaj Pulsar 150 Clutch Plate Set is available.\\n\\nPrice: ₹690\\n\\nWould you like to proceed with your purchase? We\'d be happy to assist you with pickup or delivery.\\n\\nThank you for choosing Best Auto Parts!"',
  );
  sections.push(
    '6. ORDER & PAYMENT INTEGRITY: Never claim an order is placed or payment received without actual confirmation.',
  );
  sections.push(
    '7. DO NOT HAND OFF FOR NORMAL INQUIRIES: When the customer asks for price, availability, or part details and matching items exist in the verified records above, provide the answer directly with product name and price. Do NOT output [[HANDOFF]].',
  );
  sections.push(
    '8. WHEN TO HAND OFF: Output [[HANDOFF]] ONLY if: (a) the customer explicitly asks to talk to a real person / human agent / manager / owner, (b) the customer is angry, abusive, or filing a serious dispute/complaint, or (c) the customer is negotiating bulk discounts or wholesale credit that cannot be answered from the catalog.',
  );
  sections.push(
    '9. STORE HOURS & OFF-HOURS: Store business hours are Monday–Sunday 9:00 AM – 8:00 PM IST (Friday Juma break: 12:30 PM – 2:30 PM). If responding outside business hours, quote verified product name and price, confirm availability without disclosing quantity, and state that parts are available for in-store pickup when the shop opens at 9:00 AM. If handing off outside business hours, assure the customer that Saud Bhai will follow up once the store opens at 9:00 AM.',
  );

  return sections.join('\n');
}

/**
 * Top-level inventory retrieval orchestrator for AI generation.
 * Never throws: falls back safely so AI generation never crashes.
 */
export async function retrieveInventoryContext(
  db: SupabaseClient,
  accountId: string,
  latestCustomerText: string,
  history: ChatMessage[] = [],
): Promise<string> {
  if (!latestCustomerText || !latestCustomerText.trim()) {
    return '';
  }

  try {
    const query = extractInventoryKeywords(latestCustomerText, history);
    const result = await searchInventoryForAi(db, accountId, query);
    return formatInventoryContext(result);
  } catch (err) {
    console.warn('[inventory-context] Inventory lookup failed (continuing without inventory):', err);
    return '';
  }
}

/**
 * Detect incomplete, mistyped, misspelled or unclear customer messages and return
 * the exact localized clarification message per Section 6.
 * Returns null if the message is a complete or standard product query.
 */
export function getSmartProductClarification(
  customerText: string,
  lang: 'en' | 'hinglish',
): string | null {
  const raw = customerText.trim();
  const lower = raw.toLowerCase();
  const isHinglish = lang === 'hinglish';

  // 1. Single character or random 1-2 char typing
  if (raw.length <= 2 && !/^(hi|ok|no|ha|ji)$/i.test(raw)) {
    if (/^pu$/i.test(raw)) {
      return isHinglish
        ? 'Ji, kya aap Bajaj Pulsar ke spare parts dhoondh rahe hain? Kripya apni bike ka poora model aur required part ka naam batayein.'
        : 'Are you looking for Bajaj Pulsar spare parts? Please share your complete bike model and the part you need.';
    }
    // Random single character like "G" or "x"
    return isHinglish
      ? 'Ji, aap kaunsa spare part dhoondh rahe hain? Product ka naam ya bike ka model likh dijiye.'
      : 'Which spare part are you looking for? Please share the product name or your bike model.';
  }

  // 2. Component without vehicle model:
  // e.g. "cluch plate", "clutch", "break pad", "brake pad"
  const hasVehicle = KNOWN_VEHICLES.some(
    (v) =>
      lower.includes(v.make.toLowerCase()) ||
      v.models.some((m) => lower.includes(m.toLowerCase())),
  );

  if (!hasVehicle) {
    if (/^(cluch\s*plate|clutch\s*plate|cluch|clutch)$/i.test(lower)) {
      return isHinglish
        ? 'Ji, kya aap Clutch Plate ki baat kar rahe hain? Apni bike ka model bhi bata dijiye, taaki main sahi product check kar sakun.'
        : 'Are you looking for a clutch plate? Please share your bike model so I can check the correct product.';
    }
    if (/^(break\s*pad|brake\s*pad|break|brake|disc\s*pad)$/i.test(lower)) {
      return isHinglish
        ? 'Ji, kya aap Brake Pad ki baat kar rahe hain? Apni bike ka model bata dijiye, taaki sahi part check kar sakun.'
        : 'Are you looking for brake pads? Please share your bike model so I can check the correct product.';
    }
    if (/^(chain\s*sprocket|chain\s*set|drive\s*chain)$/i.test(lower)) {
      return isHinglish
        ? 'Ji, kya aap Chain Sprocket Kit ki baat kar rahe hain? Apni bike ka model bata dijiye, taaki sahi part check kar sakun.'
        : 'Are you looking for a chain sprocket kit? Please share your bike model so I can check the correct product.';
    }
    if (/^(price\??|rate\??|available\??|kitna\s*hai\??|stock\??)$/i.test(lower)) {
      return isHinglish
        ? 'Ji, aapko kis bike ke kaunse spare part ka price ya availability check karni hai? Product aur bike model bata dijiye.'
        : 'Which spare part and bike model would you like to check the price or availability for? Please share the details.';
    }
  }

  return null;
}
