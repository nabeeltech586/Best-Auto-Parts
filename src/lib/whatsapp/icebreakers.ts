import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText, engineSendInteractiveButtons } from '@/lib/flows/meta-send';
import { addContactTagIfAbsent } from '@/lib/contacts/tag-write';
import { autoCreateServiceCaseFromWhatsApp } from '@/lib/services/service-cases';

export interface IcebreakerDef {
  id: string;
  name: string;
  buttonTitle: string;
  keywords: string[];
  responseTemplate: string;
  isSubMenu?: boolean;
}

/**
 * Top-level Ice Breakers and Slash Commands.
 * Triggers 1, 2, 3, 4 dispatch interactive button sub-menus.
 */
export const META_ICEBREAKERS: Record<string, IcebreakerDef> = {
  rate_check: {
    id: 'icebreaker_1_rate_check',
    name: '🏍️ Spare Parts Rate & Stock Check (Bajaj, Hero, Honda)',
    buttonTitle: '🏍️ Auto Spare Parts',
    keywords: [
      '🏍️ spare parts rate & stock check (bajaj, hero, honda)',
      '🏍️ auto spare parts',
      'btn_spare_parts',
      '/parts',
      'parts',
      'spare parts',
      'spare parts rate',
      'rate check',
      'price check',
      'rate',
      'parts check',
      'bhav check',
      'rate list',
      'genuine & local parts',
    ],
    responseTemplate:
      'Welcome to *Best Auto Parts* (Kailashpur, Saharanpur)! 🏍️\n\n' +
      'We supply *100% Genuine (Original)* and *Aftermarket (Local)* spare parts.\n\n' +
      'Please select your bike brand:\n' +
      '1️⃣ *Bajaj Spare Parts*\n2️⃣ *Hero Spare Parts*\n3️⃣ *Honda Spare Parts*',
    isSubMenu: true,
  },

  itr_insurance: {
    id: 'icebreaker_2_itr_insurance',
    name: '📄 Vehicle Insurance & Annual ITR Filing Inquiry',
    buttonTitle: '📄 ITR & Insurance',
    keywords: [
      '📄 vehicle insurance & annual itr filing inquiry',
      '📄 itr & insurance',
      'btn_itr_insurance',
      '/itr',
      'itr',
      'itr filing',
      'annual itr',
      'annual itr filing',
      'income tax return',
      'tax return',
      'insurance',
      'vehicle insurance',
      'bike insurance',
      'car insurance',
      'bima',
      'tax filing',
    ],
    responseTemplate:
      'Welcome to *Best Auto Parts & Online Services*! 📄\n\n' +
      'Please select the service you need help with:\n' +
      '1️⃣ *Vehicle Insurance*\n2️⃣ *Annual ITR Filing*',
    isSubMenu: true,
  },

  rto_tax: {
    id: 'icebreaker_3_rto_tax',
    name: '🚔 RTO Road Tax, E-Challan & Border Tax Service',
    buttonTitle: '🚔 RTO Tax & Challan',
    keywords: [
      '🚔 rto road tax, e-challan & border tax service',
      '🚔 rto tax & challan',
      'btn_rto_tax',
      '/rto',
      'rto',
      'road tax',
      'rto road tax',
      'challan',
      'e-challan',
      'echallan',
      'traffic challan',
      'border tax',
      'state border tax',
      'entry tax',
      'rto service',
    ],
    responseTemplate:
      'Welcome to *Best Auto Parts & Online Services*! 🚔\n\n' +
      'Please select the RTO / Tax service you require:\n' +
      '1️⃣ *RTO Road Tax*\n2️⃣ *E-Challan Service*\n3️⃣ *State Border Tax*',
    isSubMenu: true,
  },

  mechanic_desk: {
    id: 'icebreaker_4_mechanic_desk',
    name: '🔧 Mechanic Desk, Shop Location & Timings',
    buttonTitle: '🔧 Mechanic Desk',
    keywords: [
      '🔧 mechanic desk, shop location & timings',
      '🔧 mechanic desk',
      '/mechanic',
      'mechanic desk',
      'mechanic',
      'mechanic khata',
      'workshop',
      'mechanic partner',
      'wholesale mechanic',
    ],
    responseTemplate:
      'Welcome to *Best Auto Parts* (Kailashpur, Dehradun Road, Saharanpur)! 🔧\n\n' +
      'How can we assist you today?\n' +
      '1️⃣ *Mechanic Partner*\n2️⃣ *Location & Timings*',
    isSubMenu: true,
  },

  location: {
    id: 'command_5_location',
    name: '📍 Store Location & Timings',
    buttonTitle: 'Store Location',
    keywords: [
      '/location',
      'location',
      'store location',
      'shop location',
      'address',
      'dukan kahan hai',
      'store timings',
      'google maps',
      'map link',
    ],
    responseTemplate:
      '📍 *Best Auto Parts — Store Location & Timings*\n\n' +
      '• *Address:* Kailashpur, Dehradun Road, Saharanpur, Uttar Pradesh 247001\n' +
      '• *Google Maps:* https://maps.app.goo.gl/itvYp76TAaw8yy3V7?g_st=aw\n' +
      '• *Shop Timings:* 09:00 AM – 09:00 PM (Daily)\n' +
      '• *Friday (Juma) Break:* 12:30 PM – 02:30 PM\n' +
      '• *Contact:* Saud Khan (+91 96347 22174)',
  },

  catalog: {
    id: 'command_6_catalog',
    name: 'Digital Catalog',
    buttonTitle: 'Digital Catalog',
    keywords: [
      '/catalog',
      'catalog',
      'catalogue',
      'digital catalog',
      'store catalog',
      'online catalog',
      'view catalog',
      'product list',
    ],
    responseTemplate:
      '🏍️ *Best Auto Parts — WhatsApp Digital Catalog*\n\n' +
      'Browse our live catalog of genuine & aftermarket spare parts for Bajaj, Hero, and Honda motorcycles directly on WhatsApp!\n\n' +
      '👉 *View Store Catalog:* https://wa.me/c/919634722174\n' +
      '🌐 *Online Store:* https://best-auto-parts-one.vercel.app\n\n' +
      '• Genuine OEM & Aftermarket Spares\n' +
      '• Instant Pricing & Live Availability\n' +
      '• Local Delivery in Kailashpur / Saharanpur\n\n' +
      'Select parts from the catalog or reply with your bike model & part name anytime!',
  },
};

/**
 * 10 Deterministic Sub-Button Definitions (taps & keyword matches)
 */
export const SUB_BUTTONS: Record<string, IcebreakerDef> = {
  brand_bajaj: {
    id: 'btn_brand_bajaj',
    name: 'Bajaj Spare Parts',
    buttonTitle: 'Bajaj Spare Parts',
    keywords: ['btn_brand_bajaj', 'bajaj spare parts', 'bajaj parts', 'bajaj'],
    responseTemplate:
      'Welcome to *Best Auto Parts* (Kailashpur, Saharanpur)! 🏍️\n\n' +
      'Selected: *Bajaj Spare Parts*\n' +
      'We supply both *100% Genuine (Original)* and *Aftermarket (Local)* parts for Bajaj motorcycles.\n\n' +
      'Please share:\n' +
      '1️⃣ Your *Bike Model* (e.g., Pulsar 150/180/220/NS, Platina, CT100, Avenger)\n' +
      '2️⃣ *Part Name / Part Number* (or a clear photo of the old part)\n\n' +
      'We will check our live inventory and share the exact price right away!',
  },

  brand_hero: {
    id: 'btn_brand_hero',
    name: 'Hero Spare Parts',
    buttonTitle: 'Hero Spare Parts',
    keywords: ['btn_brand_hero', 'hero spare parts', 'hero parts', 'hero'],
    responseTemplate:
      'Welcome to *Best Auto Parts* (Kailashpur, Saharanpur)! 🏍️\n\n' +
      'Selected: *Hero Spare Parts*\n' +
      'We supply both *100% Genuine (Original)* and *Aftermarket (Local)* parts for Hero two-wheelers.\n\n' +
      'Please share:\n' +
      '1️⃣ Your *Bike Model* (e.g., Splendor Plus/Pro, HF Deluxe, Glamour, Passion, Pleasure, Maestro)\n' +
      '2️⃣ *Part Name / Part Number* (or a clear photo of the old part)\n\n' +
      'We will check our live inventory and share the exact price right away!',
  },

  brand_honda: {
    id: 'btn_brand_honda',
    name: 'Honda Spare Parts',
    buttonTitle: 'Honda Spare Parts',
    keywords: ['btn_brand_honda', 'honda spare parts', 'honda parts', 'honda'],
    responseTemplate:
      'Welcome to *Best Auto Parts* (Kailashpur, Saharanpur)! 🏍️\n\n' +
      'Selected: *Honda Spare Parts*\n' +
      'We supply both *100% Genuine (Original)* and *Aftermarket (Local)* parts for Honda two-wheelers.\n\n' +
      'Please share:\n' +
      '1️⃣ Your *Bike Model* (e.g., Activa 3G/4G/5G/6G, Shine, SP 125, Unicorn, Dio)\n' +
      '2️⃣ *Part Name / Part Number* (or a clear photo of the old part)\n\n' +
      'We will check our live inventory and share the exact price right away!',
  },

  service_insurance: {
    id: 'btn_service_insurance',
    name: 'Vehicle Insurance',
    buttonTitle: 'Vehicle Insurance',
    keywords: [
      'btn_service_insurance',
      'vehicle insurance',
      'bike insurance',
      'car insurance',
      'motor insurance',
    ],
    responseTemplate:
      '🛡️ *Vehicle Insurance Desk — Best Auto Parts & Online Services*\n\n' +
      'Please share the following details for your insurance quote:\n' +
      '1️⃣ *Vehicle Type:* Two-Wheeler / Car / Commercial\n' +
      '2️⃣ *Vehicle Registration Number* or a clear photo of your *RC*\n' +
      '3️⃣ *Policy Preference:* Third-Party or Comprehensive (First-Party)\n\n' +
      '*Saud Khan (+91 96347 22174)* will check all insurance portals and share the best quote with maximum discount.',
  },

  service_itr: {
    id: 'btn_service_itr',
    name: 'Annual ITR Filing',
    buttonTitle: 'Annual ITR Filing',
    keywords: [
      'btn_service_itr',
      'annual itr filing',
      'itr filing',
      'income tax return',
      'annual itr',
    ],
    responseTemplate:
      '📊 *Annual Income Tax Return (ITR) Desk — Best Auto Parts & Online Services*\n\n' +
      'Please share the following details for your ITR filing:\n' +
      '1️⃣ *Full Name* (as per PAN Card)\n' +
      '2️⃣ *PAN Number* & *Aadhaar Number*\n' +
      '3️⃣ *Mobile Number* & *Email ID*\n' +
      '4️⃣ *Source of Income:* Salary / Business / Other\n\n' +
      '*Saud Khan (+91 96347 22174)* will review your details, compute your tax return, and guide you with the exact process.',
  },

  service_road_tax: {
    id: 'btn_service_road_tax',
    name: 'RTO Road Tax',
    buttonTitle: 'RTO Road Tax',
    keywords: ['btn_service_road_tax', 'rto road tax', 'road tax', 'vahan road tax'],
    responseTemplate:
      '🚔 *RTO Road Tax Service — Best Auto Parts & Online Services*\n\n' +
      'Please share the following details:\n' +
      '1️⃣ *Vehicle Registration Number* (e.g., UP11...)\n' +
      '2️⃣ *State Name* & *Tax Period* (Quarterly / Annual / One-Time / Lifetime)\n\n' +
      '*Saud Khan (+91 96347 22174)* will check the official Vahan portal and share the exact tax dues and receipt timeline.',
  },

  service_echallan: {
    id: 'btn_service_echallan',
    name: 'E-Challan Service',
    buttonTitle: 'E-Challan Service',
    keywords: [
      'btn_service_echallan',
      'e-challan service',
      'echallan service',
      'e-challan',
      'echallan',
      'traffic challan',
    ],
    responseTemplate:
      '🚔 *E-Challan Settlement Service — Best Auto Parts & Online Services*\n\n' +
      'Please share:\n' +
      '1️⃣ *Vehicle Registration Number* (e.g., UP11...)\n' +
      '2️⃣ *Last 5 digits of Chassis Number or Engine Number* (if available)\n\n' +
      '*Saud Khan (+91 96347 22174)* will verify pending traffic challans on the Parivahan portal and assist in immediate online settlement.',
  },

  service_border_tax: {
    id: 'btn_service_border_tax',
    name: 'State Border Tax',
    buttonTitle: 'State Border Tax',
    keywords: ['btn_service_border_tax', 'state border tax', 'border tax', 'entry tax'],
    responseTemplate:
      '🚔 *State Border Tax Entry Service — Best Auto Parts & Online Services*\n\n' +
      'Please share:\n' +
      '1️⃣ *Vehicle Registration Number* (e.g., UP11...)\n' +
      '2️⃣ *Entry State Name* (e.g., Uttarakhand, Haryana, Delhi, HP, Rajasthan)\n' +
      '3️⃣ *Entry Date & Duration* (Days / Monthly Pass)\n\n' +
      '*Saud Khan (+91 96347 22174)* will generate the official State Border Tax entry receipt immediately.',
  },

  mechanic_partner: {
    id: 'btn_mechanic_partner',
    name: 'Mechanic Partner',
    buttonTitle: 'Mechanic Partner',
    keywords: ['btn_mechanic_partner', 'mechanic partner', 'partner mechanic'],
    responseTemplate:
      '🔧 *Best Auto Parts — Mechanic Partner Program*\n\n' +
      'Welcome to our Mechanic Partner Desk! Here is how we support our partner mechanics:\n' +
      '• *Priority Packing:* Quick counter delivery for all running repair jobs.\n' +
      '• *Dedicated Mechanic Khata:* Clear monthly ledger statements with flexible settlement.\n' +
      '• *Loyalty Benefits:* Special gifts and festival rewards for loyal partners.\n' +
      '*(Note: We maintain fixed transparent rates and never offer wholesale rates).*\n\n' +
      'Send your bike spare parts list or photo anytime to get them packed and ready for pickup!',
  },

  shop_location: {
    id: 'btn_shop_location',
    name: 'Location & Timings',
    buttonTitle: 'Location & Timings',
    keywords: ['btn_shop_location', 'location & timings', 'shop location', 'store location'],
    responseTemplate:
      '📍 *Best Auto Parts — Store Location & Timings*\n\n' +
      '• *Address:* Kailashpur, Dehradun Road, Saharanpur, Uttar Pradesh 247001\n' +
      '• *Google Maps:* https://maps.app.goo.gl/itvYp76TAaw8yy3V7?g_st=aw\n' +
      '• *Shop Timings:* 09:00 AM – 09:00 PM (Daily)\n' +
      '• *Friday (Juma) Break:* 12:30 PM – 02:30 PM\n' +
      '• *Contact:* Saud Khan (+91 96347 22174)',
  },
};

/**
 * Checks whether an incoming message is a generic greeting.
 */
export function isGreetingMessage(text: string): boolean {
  const norm = (text || '')
    .trim()
    .toLowerCase()
    .replace(/[!.,?_#-]/g, '');

  const greetings = [
    'hi',
    'hello',
    'hey',
    'salam',
    'salaam',
    'assalam',
    'assalamu alaikum',
    'assalamualaikum',
    'menu',
    'start',
    'namaste',
    'namaskar',
    'ram ram',
  ];

  return greetings.includes(norm);
}

/**
 * Normalizes input text and checks whether it matches any Sub-Button, Icebreaker or Command.
 */
export function matchIcebreaker(
  rawText: string,
  interactiveReplyId?: string | null
): IcebreakerDef | null {
  const normId = (interactiveReplyId || '').trim().toLowerCase();
  const normText = (rawText || '').trim().toLowerCase();

  // 1. Check Sub-Buttons FIRST (direct ID or text match)
  for (const item of Object.values(SUB_BUTTONS)) {
    if (normId && (normId === item.id.toLowerCase() || item.keywords.some((kw) => normId === kw))) {
      return item;
    }
    if (normText) {
      if (normText === item.buttonTitle.toLowerCase()) {
        return item;
      }
      for (const kw of item.keywords) {
        if (normText === kw || normText.startsWith(kw + ' ') || normText.includes(kw)) {
          return item;
        }
      }
    }
  }

  // 2. Check Top-Level Icebreakers and Slash Commands
  for (const item of Object.values(META_ICEBREAKERS)) {
    if (normId) {
      if (normId === item.id.toLowerCase()) return item;
      if (item.keywords.some((kw) => normId === kw || normId.includes(kw))) {
        return item;
      }
    }

    if (normText) {
      if (normText === item.buttonTitle.toLowerCase()) {
        return item;
      }
      for (const kw of item.keywords) {
        if (normText === kw || normText.startsWith(kw + ' ') || normText.includes(kw)) {
          return item;
        }
      }
    }
  }

  return null;
}

export interface HandleIcebreakerInput {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  inboundText: string;
  interactiveReplyId?: string | null;
}

export interface HandleIcebreakerResult {
  handled: boolean;
  icebreakerId?: string;
  responseSent?: string;
  whatsappMessageId?: string;
}

/**
 * Sends the free ₹0 interactive 3-button greeting menu.
 * Button 1: 🏍️ Auto Spare Parts (19 chars)
 * Button 2: 📄 ITR & Insurance (18 chars)
 * Button 3: 🚔 RTO Tax & Challan (20 chars)
 */
export async function sendGreetingMenu(
  input: HandleIcebreakerInput
): Promise<HandleIcebreakerResult> {
  const { accountId, userId, conversationId, contactId } = input;

  const bodyText =
    'Welcome to *Best Auto Parts* (Kailashpur, Saharanpur)! 🏍️\n\n' +
    'We supply genuine & aftermarket spare parts for Bajaj, Hero & Honda, plus RTO, Insurance & Tax services.\n\n' +
    'How can we assist you today? Please choose an option below:';

  const buttons = [
    { id: 'btn_spare_parts', title: '🏍️ Auto Spare Parts' },
    { id: 'btn_itr_insurance', title: '📄 ITR & Insurance' },
    { id: 'btn_rto_tax', title: '🚔 RTO Tax & Challan' },
  ];

  try {
    const sendRes = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons,
    });

    return {
      handled: true,
      icebreakerId: 'greeting_menu',
      responseSent: bodyText,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  } catch (err) {
    console.warn('[icebreaker] failed to send interactive buttons menu, falling back to text:', err);
    const fallbackText =
      bodyText +
      '\n\n1️⃣ */parts* — Spare Parts Rate Check\n2️⃣ */itr* — Vehicle Insurance & ITR\n3️⃣ */rto* — RTO Tax & Challan\n4️⃣ */location* — Store Location';

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: fallbackText,
    });

    return {
      handled: true,
      icebreakerId: 'greeting_menu_text',
      responseSent: fallbackText,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  }
}

/**
 * Executes the tailored actions for the matched Meta WhatsApp Icebreaker, Sub-Menu, or Command.
 */
export async function executeIcebreaker(
  input: HandleIcebreakerInput
): Promise<HandleIcebreakerResult> {
  const { db, accountId, userId, conversationId, contactId, inboundText, interactiveReplyId } =
    input;

  // 1. Generic greeting: send the 3-button greeting menu immediately
  if (isGreetingMessage(inboundText) && !interactiveReplyId) {
    return await sendGreetingMenu(input);
  }

  const matched = matchIcebreaker(inboundText, interactiveReplyId);
  if (!matched) {
    return { handled: false };
  }

  // ============================================================
  // A. Top-Level Sub-Menu Triggers (Free ₹0 Interactive Button Menus)
  // ============================================================

  // Trigger 1: Spare Parts Brand Selection Sub-Menu
  if (matched.id === META_ICEBREAKERS.rate_check.id) {
    const bodyText =
      'Welcome to *Best Auto Parts* (Kailashpur, Saharanpur)! 🏍️\n\n' +
      'We supply *100% Genuine (Original)* and *Aftermarket (Local)* spare parts.\n\n' +
      'Please select your bike brand:';

    const buttons = [
      { id: 'btn_brand_bajaj', title: 'Bajaj Spare Parts' },
      { id: 'btn_brand_hero', title: 'Hero Spare Parts' },
      { id: 'btn_brand_honda', title: 'Honda Spare Parts' },
    ];

    try {
      const sendRes = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: bodyText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    } catch (err) {
      console.warn('[icebreaker] spare parts sub-menu button error, falling back to text:', err);
      const fallbackText =
        bodyText +
        '\n\n1️⃣ *Bajaj Spare Parts*\n2️⃣ *Hero Spare Parts*\n3️⃣ *Honda Spare Parts*\n\nReply with your brand & bike model!';

      const sendRes = await engineSendText({
        accountId,
        userId,
        conversationId,
        contactId,
        text: fallbackText,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: fallbackText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    }
  }

  // Trigger 2: Insurance & ITR Sub-Menu
  if (matched.id === META_ICEBREAKERS.itr_insurance.id) {
    const bodyText =
      'Welcome to *Best Auto Parts & Online Services*! 📄\n\n' +
      'Please select the service you need help with:';

    const buttons = [
      { id: 'btn_service_insurance', title: 'Vehicle Insurance' },
      { id: 'btn_service_itr', title: 'Annual ITR Filing' },
    ];

    try {
      const sendRes = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: bodyText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    } catch (err) {
      console.warn('[icebreaker] itr/insurance sub-menu button error, falling back to text:', err);
      const fallbackText =
        bodyText +
        '\n\n1️⃣ *Vehicle Insurance* (RC & Policy quote)\n2️⃣ *Annual ITR Filing* (PAN & Income Tax)\n\nReply with 1 or 2 to proceed!';

      const sendRes = await engineSendText({
        accountId,
        userId,
        conversationId,
        contactId,
        text: fallbackText,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: fallbackText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    }
  }

  // Trigger 3: RTO, Road Tax, Challan & Border Tax Sub-Menu
  if (matched.id === META_ICEBREAKERS.rto_tax.id) {
    const bodyText =
      'Welcome to *Best Auto Parts & Online Services*! 🚔\n\n' +
      'Please select the RTO / Tax service you require:';

    const buttons = [
      { id: 'btn_service_road_tax', title: 'RTO Road Tax' },
      { id: 'btn_service_echallan', title: 'E-Challan Service' },
      { id: 'btn_service_border_tax', title: 'State Border Tax' },
    ];

    try {
      const sendRes = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: bodyText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    } catch (err) {
      console.warn('[icebreaker] rto sub-menu button error, falling back to text:', err);
      const fallbackText =
        bodyText +
        '\n\n1️⃣ *RTO Road Tax* (Vahan tax payment)\n2️⃣ *E-Challan Service* (Traffic fine check & settlement)\n3️⃣ *State Border Tax* (Entry permit & pass)\n\nReply with your option and vehicle number!';

      const sendRes = await engineSendText({
        accountId,
        userId,
        conversationId,
        contactId,
        text: fallbackText,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: fallbackText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    }
  }

  // Trigger 4: Mechanic Desk Sub-Menu
  if (matched.id === META_ICEBREAKERS.mechanic_desk.id) {
    const bodyText =
      'Welcome to *Best Auto Parts* (Kailashpur, Dehradun Road, Saharanpur)! 🔧\n\n' +
      'How can we assist you today?';

    const buttons = [
      { id: 'btn_mechanic_partner', title: 'Mechanic Partner' },
      { id: 'btn_shop_location', title: 'Location & Timings' },
    ];

    try {
      const sendRes = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: bodyText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    } catch (err) {
      console.warn('[icebreaker] mechanic desk sub-menu button error, falling back to text:', err);
      const fallbackText =
        bodyText +
        '\n\n1️⃣ *Mechanic Partner* (Khata & counter packing)\n2️⃣ *Location & Timings* (Address & Google Maps)';

      const sendRes = await engineSendText({
        accountId,
        userId,
        conversationId,
        contactId,
        text: fallbackText,
      });

      return {
        handled: true,
        icebreakerId: matched.id,
        responseSent: fallbackText,
        whatsappMessageId: sendRes.whatsapp_message_id,
      };
    }
  }

  // ============================================================
  // B. Sub-Button Deterministic Text Replies & Side Effects
  // ============================================================

  // 1. Brand Sub-Buttons (Bajaj, Hero, Honda) -> Enable AI autoreply for live inventory
  if (
    matched.id === SUB_BUTTONS.brand_bajaj.id ||
    matched.id === SUB_BUTTONS.brand_hero.id ||
    matched.id === SUB_BUTTONS.brand_honda.id
  ) {
    try {
      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: false,
          assigned_agent_id: null,
          ai_handoff_summary: null,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);

      await db
        .from('contacts')
        .update({ preferred_language: 'en' })
        .eq('id', contactId)
        .eq('account_id', accountId);
    } catch {
      // best-effort
    }
  }

  // 2. Mechanic Partner Sub-Button -> Add Mechanic tag
  if (matched.id === SUB_BUTTONS.mechanic_partner.id) {
    try {
      let { data: tag } = await db
        .from('tags')
        .select('id')
        .eq('account_id', accountId)
        .ilike('name', 'Mechanic')
        .maybeSingle();

      if (!tag) {
        const { data: newTag } = await db
          .from('tags')
          .insert({
            account_id: accountId,
            name: 'Mechanic',
            color: '#10B981',
          })
          .select('id')
          .single();
        tag = newTag;
      }

      if (tag?.id) {
        await addContactTagIfAbsent(db, {
          accountId,
          contactId,
          tagId: tag.id,
        });
      }
    } catch (err) {
      console.warn('[icebreaker] mechanic tagging notice:', err);
    }
  }

  // 3. Online Services Sub-Buttons -> Auto-create service_cases card
  const isOnlineServiceButton =
    matched.id === SUB_BUTTONS.service_insurance.id ||
    matched.id === SUB_BUTTONS.service_itr.id ||
    matched.id === SUB_BUTTONS.service_road_tax.id ||
    matched.id === SUB_BUTTONS.service_echallan.id ||
    matched.id === SUB_BUTTONS.service_border_tax.id;

  if (isOnlineServiceButton) {
    try {
      const { data: contact } = await db
        .from('contacts')
        .select('name, phone, phone_normalized')
        .eq('id', contactId)
        .maybeSingle();

      const phone = contact?.phone || contact?.phone_normalized;
      if (phone) {
        let serviceType: 'ITR' | 'Vehicle Insurance' | 'RTO Road Tax' | 'State Border Tax' | 'E-Challan' =
          'Vehicle Insurance';

        if (matched.id === SUB_BUTTONS.service_itr.id) {
          serviceType = 'ITR';
        } else if (matched.id === SUB_BUTTONS.service_insurance.id) {
          serviceType = 'Vehicle Insurance';
        } else if (matched.id === SUB_BUTTONS.service_road_tax.id) {
          serviceType = 'RTO Road Tax';
        } else if (matched.id === SUB_BUTTONS.service_echallan.id) {
          serviceType = 'E-Challan';
        } else if (matched.id === SUB_BUTTONS.service_border_tax.id) {
          serviceType = 'State Border Tax';
        }

        const regMatch = inboundText
          .toUpperCase()
          .match(/\b[A-Z]{2}\s*[-0-9]{1,2}\s*[A-Z]{0,3}\s*[0-9]{4}\b/);
        const vehicleOrRef = regMatch ? regMatch[0].replace(/\s+/g, '') : '';

        await autoCreateServiceCaseFromWhatsApp({
          phone,
          customerName: contact.name,
          serviceType,
          inboundText,
          vehicleOrRef,
          accountId,
          db,
        });
      }
    } catch (caseErr) {
      console.warn('[icebreaker] auto-create service case notice:', caseErr);
    }
  }

  // Send deterministic reply text
  const replyText = matched.responseTemplate || '';
  const sendRes = await engineSendText({
    accountId,
    userId,
    conversationId,
    contactId,
    text: replyText,
  });

  return {
    handled: true,
    icebreakerId: matched.id,
    responseSent: replyText,
    whatsappMessageId: sendRes.whatsapp_message_id,
  };
}
