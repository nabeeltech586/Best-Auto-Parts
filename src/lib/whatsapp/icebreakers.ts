import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText, engineSendInteractiveButtons } from '@/lib/flows/meta-send';
import { addContactTagIfAbsent } from '@/lib/contacts/tag-write';

export interface IcebreakerDef {
  id: string;
  name: string;
  buttonTitle: string;
  keywords: string[];
  responseTemplate: string;
}

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
      'We supply *100% Genuine (Original)* and *Aftermarket (Local)* spare parts for *Bajaj, Hero, and Honda* two-wheelers.\n\n' +
      'Please share:\n' +
      '1️⃣ Your *Bike Brand & Model*\n' +
      '2️⃣ *Part Name / Part Number* (or a clear photo of the old part)\n\n' +
      'We will check stock and share the exact rate right away.',
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
      'Please share your details based on the service you need:\n\n' +
      '🛡️ *Vehicle Insurance (Two-Wheeler / Car / Commercial):*\n' +
      '• Send a clear photo of your *RC* or your *Vehicle Registration Number*.\n\n' +
      '📊 *Annual Income Tax Return (ITR) Filing:*\n' +
      '• Send your *Full Name, PAN Number, Aadhaar, and Mobile Number*.\n\n' +
      '*Saud Khan (+91 96347 22174)* will review and guide you with the exact quote and process.',
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
      'We assist with *RTO Road Tax, E-Challan Check/Settlement, and State Border Tax*.\n\n' +
      'Please send:\n' +
      '1️⃣ Your *Vehicle Registration Number* (e.g., UP11...)\n' +
      '2️⃣ The *Service Required* (Road Tax / E-Challan / Border Tax) & *State Name*\n\n' +
      '*Saud Khan (+91 96347 22174)* will verify the status and share the details shortly.',
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
      '🔧 *Best Auto Parts — Mechanic Partner Desk*\n\n' +
      'Regular mechanics receive priority part packing, dedicated *Mechanic Khata* ledger tracking, and special loyalty benefits & occasional gifts.\n\n' +
      '📍 *Location:* Kailashpur, Dehradun Road, Saharanpur, UP 247001\n' +
      '🕒 *Timings:* 09:00 AM – 09:00 PM Daily (Friday Juma Break: 12:30 PM – 02:30 PM)\n' +
      '🗺️ *Google Maps:* https://maps.app.goo.gl/itvYp76TAaw8yy3V7?g_st=aw\n\n' +
      'Send your bike parts list or photo anytime to place an order!',
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
 * Normalizes input text and checks whether it matches any Icebreaker or Command.
 */
export function matchIcebreaker(
  rawText: string,
  interactiveReplyId?: string | null
): IcebreakerDef | null {
  const normId = (interactiveReplyId || '').trim().toLowerCase();
  const normText = (rawText || '').trim().toLowerCase();

  for (const item of Object.values(META_ICEBREAKERS)) {
    // 1. Direct ID match (from button / interactive tap)
    if (normId) {
      if (normId === item.id.toLowerCase()) return item;
      if (item.keywords.some((kw) => normId === kw || normId.includes(kw))) {
        return item;
      }
    }

    // 2. Exact or substring match against text body
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
    // Graceful fallback to text menu
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
 * Executes the tailored actions for the matched Meta WhatsApp Icebreaker or Command.
 */
export async function executeIcebreaker(
  input: HandleIcebreakerInput
): Promise<HandleIcebreakerResult> {
  const { db, accountId, userId, conversationId, contactId, inboundText, interactiveReplyId } =
    input;

  // 1. If it's a generic greeting, send the 3-button greeting menu immediately
  if (isGreetingMessage(inboundText) && !interactiveReplyId) {
    return await sendGreetingMenu(input);
  }

  const matched = matchIcebreaker(inboundText, interactiveReplyId);
  if (!matched) {
    return { handled: false };
  }

  // Auto-tag / auto-enable AI depending on command
  if (matched.id === META_ICEBREAKERS.rate_check.id) {
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

  if (matched.id === META_ICEBREAKERS.mechanic_desk.id) {
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

  const sendRes = await engineSendText({
    accountId,
    userId,
    conversationId,
    contactId,
    text: matched.responseTemplate,
  });

  return {
    handled: true,
    icebreakerId: matched.id,
    responseSent: matched.responseTemplate,
    whatsappMessageId: sendRes.whatsapp_message_id,
  };
}
