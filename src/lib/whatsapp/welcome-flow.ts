import type { SupabaseClient } from '@supabase/supabase-js'
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
  engineSendText,
} from '@/lib/flows/meta-send'
import { addContactTagIfAbsent, removeContactTag } from '@/lib/contacts/tag-write'

export type CustomerLanguage = 'en' | 'hinglish'

// ============================================================
// Stable Callback Identifiers
// ============================================================
export const WELCOME_CALLBACKS = {
  // Language Selection
  LANG_ENGLISH: 'LANG_ENGLISH',
  LANG_HINGLISH: 'LANG_HINGLISH',
  CHANGE_LANGUAGE: 'CHANGE_LANGUAGE',

  // Main Customer Menu
  MENU_FIND_PART: 'MENU_FIND_PART',
  MENU_PRODUCT_PRICE: 'MENU_PRODUCT_PRICE',
  MENU_SEARCH_BIKE: 'MENU_SEARCH_BIKE',
  MENU_ORDER_DELIVERY: 'MENU_ORDER_DELIVERY',
  MENU_SHOP_LOCATION: 'MENU_SHOP_LOCATION',
  MENU_TALK_HUMAN: 'MENU_TALK_HUMAN',

  // Product Purchase Journey
  BUY_WANT: 'BUY_WANT',
  BUY_EXPLORING: 'BUY_EXPLORING',
  BUY_PICKUP: 'BUY_PICKUP',
  BUY_DELIVERY: 'BUY_DELIVERY',
  BUY_DETAILS: 'BUY_DETAILS',
  BUY_ANOTHER: 'BUY_ANOTHER',

  // Store Pickup Journey
  PICKUP_TODAY: 'PICKUP_TODAY',
  PICKUP_TOMORROW: 'PICKUP_TOMORROW',
  PICKUP_LATER: 'PICKUP_LATER',
  PICKUP_TIME_MORNING: 'PICKUP_TIME_MORNING',
  PICKUP_TIME_AFTERNOON: 'PICKUP_TIME_AFTERNOON',
  PICKUP_TIME_EVENING: 'PICKUP_TIME_EVENING',
  STORE_SHARE_DETAILS: 'STORE_SHARE_DETAILS',

  // Delivery Assistance & Order Quantity
  DELIVERY_CONTINUE: 'DELIVERY_CONTINUE',
  ORDER_QTY_1: 'ORDER_QTY_1',
  ORDER_QTY_2: 'ORDER_QTY_2',
  ORDER_QTY_OTHER: 'ORDER_QTY_OTHER',

  // Navigation & Exit
  BACK_TO_MENU: 'BACK_TO_MENU',
  EXIT_MAYBE_LATER: 'EXIT_MAYBE_LATER',
  EXIT_NO_THANK_YOU: 'EXIT_NO_THANK_YOU',
} as const

export type WelcomeCallbackId =
  (typeof WELCOME_CALLBACKS)[keyof typeof WELCOME_CALLBACKS]

const ALL_CALLBACK_IDS = new Set<string>(Object.values(WELCOME_CALLBACKS))

export function isWelcomeFlowCallback(callbackId: string | null | undefined): boolean {
  if (!callbackId) return false
  return ALL_CALLBACK_IDS.has(callbackId)
}

// ============================================================
// Time-based Greetings (Asia/Kolkata)
// 05:00–11:59: Good Morning
// 12:00–16:59: Good Afternoon
// 17:00–20:59: Good Evening
// 21:00–04:59: Good Night
// ============================================================
export function getTimeBasedGreeting(
  date: Date = new Date(),
  timeZone = 'Asia/Kolkata',
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const hourPart = parts.find((p) => p.type === 'hour')
  const hour = hourPart ? parseInt(hourPart.value, 10) % 24 : 9

  if (hour >= 5 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 17) return 'Good Afternoon'
  if (hour >= 17 && hour < 21) return 'Good Evening'
  return 'Good Night'
}

// ============================================================
// Language Persistence (contacts.preferred_language & tags fallback)
// ============================================================
const TAG_LANG_EN = 'Language: English'
const TAG_LANG_HINGLISH = 'Language: Hinglish'

export async function getContactLanguage(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<CustomerLanguage | null> {
  // 1. Check contacts.preferred_language column
  try {
    const table = db.from('contacts')
    if (table && typeof table.select === 'function') {
      let q: any = table.select('preferred_language')
      if (typeof q?.eq === 'function') {
        q = q.eq('id', contactId)
        if (typeof q?.eq === 'function') {
          q = q.eq('account_id', accountId)
        }
      }
      if (typeof q?.maybeSingle === 'function') {
        const { data: contact, error } = await q.maybeSingle()
        if (!error && contact?.preferred_language) {
          const val = String(contact.preferred_language).toLowerCase().trim()
          if (val === 'en' || val === 'hinglish') {
            return val as CustomerLanguage
          }
        }
      }
    }
  } catch {
    // Column may not exist if migration 061 hasn't landed in environment
  }

  // 2. Check contact_tags
  try {
    const table = db.from('contact_tags')
    if (table && typeof table.select === 'function') {
      let q: any = table.select('tag_id, tags!inner(name, account_id)')
      if (typeof q?.eq === 'function') {
        q = q.eq('contact_id', contactId)
      }
      const { data: contactTags, error: tagErr } = await (q?.then ? q : q?.maybeSingle ? q.maybeSingle() : Promise.resolve({ data: null, error: null }))

      if (!tagErr && Array.isArray(contactTags)) {
        for (const ct of contactTags) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tagName = (ct as any).tags?.name?.toLowerCase() ?? ''
          if (tagName.includes('hinglish')) return 'hinglish'
          if (tagName.includes('english')) return 'en'
        }
      }
    }
  } catch {
    // Fallback error swallowed
  }

  // 3. Check contact_custom_values for custom field 'preferred_language'
  try {
    const cfTable = db.from('custom_fields')
    if (cfTable && typeof cfTable.select === 'function') {
      let q: any = cfTable.select('id')
      if (typeof q?.eq === 'function') q = q.eq('account_id', accountId)
      if (typeof q?.in === 'function') q = q.in('field_key', ['preferred_language', 'language'])
      const { data: cf } = typeof q?.maybeSingle === 'function' ? await q.maybeSingle() : { data: null }

      if (cf?.id) {
        const ccvTable = db.from('contact_custom_values')
        if (ccvTable && typeof ccvTable.select === 'function') {
          let vq: any = ccvTable.select('value')
          if (typeof vq?.eq === 'function') {
            vq = vq.eq('contact_id', contactId)
            if (typeof vq?.eq === 'function') vq = vq.eq('custom_field_id', cf.id)
          }
          const { data: val } = typeof vq?.maybeSingle === 'function' ? await vq.maybeSingle() : { data: null }

          if (val?.value) {
            const lower = String(val.value).toLowerCase().trim()
            if (lower === 'en' || lower === 'english') return 'en'
            if (lower === 'hinglish') return 'hinglish'
          }
        }
      }
    }
  } catch {
    // Swallowed
  }

  return null
}

export async function setContactLanguage(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  lang: CustomerLanguage,
): Promise<void> {
  // 1. Update contacts.preferred_language
  try {
    await db
      .from('contacts')
      .update({ preferred_language: lang })
      .eq('id', contactId)
      .eq('account_id', accountId)
  } catch {
    // Column might not exist in unmigrated environment
  }

  // 2. Add / mirror contact tag for CRM inbox visibility
  try {
    const desiredTagName = lang === 'hinglish' ? TAG_LANG_HINGLISH : TAG_LANG_EN
    const oldTagName = lang === 'hinglish' ? TAG_LANG_EN : TAG_LANG_HINGLISH

    // Find or create tag
    let { data: tag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', desiredTagName)
      .maybeSingle()

    if (!tag) {
      const { data: createdTag } = await db
        .from('tags')
        .insert({ account_id: accountId, name: desiredTagName, color: '#10B981' })
        .select('id')
        .single()
      tag = createdTag
    }

    if (tag?.id) {
      await addContactTagIfAbsent(db, {
        accountId,
        contactId,
        tagId: tag.id,
      }).catch(() => {})
    }

    // Clean up opposing tag if present
    const { data: oldTag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', oldTagName)
      .maybeSingle()

    if (oldTag?.id) {
      await removeContactTag(db, {
        accountId,
        contactId,
        tagId: oldTag.id,
      }).catch(() => {})
    }
  } catch {
    // Best-effort tag sync
  }
}

// ============================================================
// Natural Language Intent Helpers
// ============================================================
const GREETING_REGEX =
  /^(hi|hello|hey|salam|assalamu\s*alaikum|namaste|ram\s*ram|adaab|start|menu|shuru|halo|hii+)\b/i

export function isGreeting(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim()
  return GREETING_REGEX.test(trimmed)
}

const LANGUAGE_CHANGE_REGEX =
  /^(change\s*language|language\s*settings|set\s*language|bhasha|select\s*language|\/language|#language)\b/i

export function isLanguageChangeRequest(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim().toLowerCase()
  return LANGUAGE_CHANGE_REGEX.test(trimmed)
}

// PIN code detection for Delivery Assistance (6-digit Indian PIN)
const PIN_CODE_REGEX = /\b[1-9][0-9]{5}\b/

export function extractPinCode(text: string): string | null {
  const match = text.match(PIN_CODE_REGEX)
  return match ? match[0] : null
}

// Delivery zones verification
// In a production setup, this checks verified database records or delivery APIs.
// If not found in verified database, returns 'unknown' to prompt human verification.
const VERIFIED_DELIVERY_PINCODES = new Set([
  '110001',
  '110002',
  '110006',
  '110025',
  '201301',
  '122001',
])

const VERIFIED_DELIVERY_AREAS = [
  'delhi',
  'ncr',
  'noida',
  'gurgaon',
  'ghaziabad',
  'faridabad',
]

const EXCLUDED_DELIVERY_PINCODES = new Set(['190001', '790001', '682001'])

export function verifyDeliveryArea(query: string): {
  status: 'available' | 'unavailable' | 'unknown'
  matchedZone?: string
} {
  const pin = extractPinCode(query)
  if (pin) {
    if (EXCLUDED_DELIVERY_PINCODES.has(pin)) {
      return { status: 'unavailable', matchedZone: pin }
    }
    if (VERIFIED_DELIVERY_PINCODES.has(pin)) {
      return { status: 'available', matchedZone: pin }
    }
    // Unverified PIN -> Offer human verification, do not fabricate
    return { status: 'unknown', matchedZone: pin }
  }

  const lower = query.toLowerCase()
  for (const area of VERIFIED_DELIVERY_AREAS) {
    if (lower.includes(area)) {
      return { status: 'available', matchedZone: area }
    }
  }

  // Unknown location without verified data
  return { status: 'unknown' }
}

// ============================================================
// Core Send Helpers (Meta Interactive Messages)
// All button labels are strictly English (≤ 20 chars per Meta).
// Row titles ≤ 24 chars, descriptions ≤ 72 chars.
// ============================================================

export async function sendLanguageSelectionPrompt(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  date?: Date
}): Promise<{ whatsapp_message_id: string }> {
  const greeting = getTimeBasedGreeting(args.date ?? new Date(), 'Asia/Kolkata')
  const body =
    `${greeting}! Welcome to Best Auto Parts. 😊\n\n` +
    `We're happy to assist you with your spare parts requirements.\n\n` +
    `Please choose your preferred language to continue.`

  return engineSendInteractiveButtons({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    bodyText: body,
    buttons: [
      { id: WELCOME_CALLBACKS.LANG_ENGLISH, title: 'English' },
      { id: WELCOME_CALLBACKS.LANG_HINGLISH, title: 'Hinglish' },
    ],
  })
}

export async function sendMainMenu(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  lang: CustomerLanguage
  greetingPrefix?: string
}): Promise<{ whatsapp_message_id: string }> {
  const isHinglish = args.lang === 'hinglish'

  const prefix = args.greetingPrefix ? `${args.greetingPrefix}\n\n` : ''
  const bodyText = isHinglish
    ? `${prefix}Kripya shuru karne ke liye niche diye gaye menu se ek option chunein:`
    : `${prefix}Please choose an option from the menu below to get started:`

  return engineSendInteractiveList({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    headerText: 'Best Auto Parts',
    bodyText,
    footerText: 'Best Auto Parts • Quality & Trust',
    buttonLabel: 'View Menu',
    sections: [
      {
        title: 'Customer Services',
        rows: [
          {
            id: WELCOME_CALLBACKS.MENU_FIND_PART,
            title: 'Find a Spare Part',
            description: 'Search parts by name or model',
          },
          {
            id: WELCOME_CALLBACKS.MENU_PRODUCT_PRICE,
            title: 'Product Info & Price',
            description: 'Get verified genuine prices',
          },
          {
            id: WELCOME_CALLBACKS.MENU_SEARCH_BIKE,
            title: 'Search by Bike Model',
            description: 'Bajaj, Hero, Honda & more',
          },
          {
            id: WELCOME_CALLBACKS.MENU_ORDER_DELIVERY,
            title: 'Order & Delivery',
            description: 'Store pickup & delivery',
          },
          {
            id: WELCOME_CALLBACKS.MENU_SHOP_LOCATION,
            title: 'Shop Location & Timing',
            description: 'Address, hours & Friday break',
          },
          {
            id: WELCOME_CALLBACKS.MENU_TALK_HUMAN,
            title: 'Talk to Human',
            description: 'Connect with Saud Bhai & team',
          },
        ],
      },
    ],
  })
}

// ============================================================
// Main Welcome Flow Inbound Handler
// ============================================================

export interface WelcomeFlowInput {
  db: SupabaseClient
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  inboundText: string
  interactiveReplyId?: string | null
  isFirstInboundMessage?: boolean
  date?: Date
}

export interface WelcomeFlowOutput {
  consumed: boolean
  responseSent?: string
  messageId?: string
  handoff?: boolean
}

export async function handleWelcomeFlowInbound(
  input: WelcomeFlowInput,
): Promise<WelcomeFlowOutput> {
  const {
    db,
    accountId,
    userId,
    conversationId,
    contactId,
    inboundText,
    interactiveReplyId,
    isFirstInboundMessage,
    date = new Date(),
  } = input

  const rawText = inboundText?.trim() ?? ''

  // ------------------------------------------------------------
  // 1. Language Change Command
  // ------------------------------------------------------------
  if (
    interactiveReplyId === WELCOME_CALLBACKS.CHANGE_LANGUAGE ||
    isLanguageChangeRequest(rawText)
  ) {
    const res = await sendLanguageSelectionPrompt({
      accountId,
      userId,
      conversationId,
      contactId,
      date,
    })
    return { consumed: true, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 2. Language Selection Callbacks (LANG_ENGLISH / LANG_HINGLISH)
  // ------------------------------------------------------------
  if (
    interactiveReplyId === WELCOME_CALLBACKS.LANG_ENGLISH ||
    interactiveReplyId === WELCOME_CALLBACKS.LANG_HINGLISH
  ) {
    const selectedLang: CustomerLanguage =
      interactiveReplyId === WELCOME_CALLBACKS.LANG_HINGLISH ? 'hinglish' : 'en'

    await setContactLanguage(db, accountId, contactId, selectedLang)

    const isHinglish = selectedLang === 'hinglish'
    const confirmation = isHinglish
      ? 'Aapne Hinglish select kiya hai. Best Auto Parts mein aapka swagat hai! 😊'
      : "You have selected English. Welcome to Best Auto Parts! We're here to help you find the right parts! 😊"

    const res = await sendMainMenu({
      accountId,
      userId,
      conversationId,
      contactId,
      lang: selectedLang,
      greetingPrefix: confirmation,
    })

    return {
      consumed: true,
      responseSent: confirmation,
      messageId: res.whatsapp_message_id,
    }
  }

  // ------------------------------------------------------------
  // 3. Resolve Current Saved Language
  // ------------------------------------------------------------
  const savedLang = await getContactLanguage(db, accountId, contactId)

  // ------------------------------------------------------------
  // 4. UNSELECTED LANGUAGE STATE (Critical Section 4)
  // If customer has no saved language:
  // Any inbound text (Hi, greeting, product query, random message)
  // MUST re-prompt language selection.
  // Suppress all AI, FAQ, OOO, and delivery/purchase flows.
  // ------------------------------------------------------------
  if (!savedLang) {
    let shouldPrompt = false
    if (isFirstInboundMessage || isGreeting(rawText)) {
      shouldPrompt = true
    } else {
      try {
        const { data: lastBotMsg } = await db
          .from('messages')
          .select('content_text')
          .eq('conversation_id', conversationId)
          .eq('sender_type', 'bot')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastBotMsg?.content_text?.includes('preferred language')) {
          shouldPrompt = true
        }
      } catch {
        // Fallback
      }
    }

    if (shouldPrompt) {
      const res = await sendLanguageSelectionPrompt({
        accountId,
        userId,
        conversationId,
        contactId,
        date,
      })
      return {
        consumed: true,
        responseSent: 'language_selection_prompt',
        messageId: res.whatsapp_message_id,
      }
    }

    return { consumed: false }
  }

  // From here onward, customer HAS a saved language.
  const isHinglish = savedLang === 'hinglish'

  // ------------------------------------------------------------
  // 5. Back to Main Menu Callback
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.BACK_TO_MENU) {
    const res = await sendMainMenu({
      accountId,
      userId,
      conversationId,
      contactId,
      lang: savedLang,
    })
    return { consumed: true, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 6. Returning Customer Greeting
  // If returning customer with saved language sends greeting:
  // Greet warmly in saved language and display Main Menu.
  // ------------------------------------------------------------
  if (!interactiveReplyId && (isGreeting(rawText) || rawText === '')) {
    const welcomeBack = isHinglish
      ? 'Best Auto Parts mein aapka phir se swagat hai! 😊 Aaj hum aapki kya madad kar sakte hain?'
      : 'Welcome back to Best Auto Parts! 😊 Great to see you again. How can we help you today?'

    const res = await sendMainMenu({
      accountId,
      userId,
      conversationId,
      contactId,
      lang: savedLang,
      greetingPrefix: welcomeBack,
    })
    return {
      consumed: true,
      responseSent: welcomeBack,
      messageId: res.whatsapp_message_id,
    }
  }

  // ------------------------------------------------------------
  // 7. Main Menu Callbacks
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.MENU_FIND_PART) {
    const text = isHinglish
      ? 'Kripya spare part ka naam aur apni bike ka model share karein (jaise "Pulsar 150 clutch plate" ya "Splendor brake shoe"). Hum foran price aur availability check karenge! 😊'
      : 'Please share the name of the spare part you are looking for along with your bike model (e.g., "Pulsar 150 clutch plate" or "Splendor brake shoe"). We will check availability and price right away! 😊'

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.MENU_PRODUCT_PRICE) {
    const text = isHinglish
      ? 'Kisi bhi spare part ki price aur details janne ke liye, bas part ka naam aur bike model likh kar bhejein. Hamare paas genuine parts verified best rates par milte hain! 🏍️'
      : 'To check the price and details of any part, simply type the part name and bike model. All our parts are genuine with verified pricing! 🏍️'

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.MENU_SEARCH_BIKE) {
    const text = isHinglish
      ? 'Aapke paas kaunsi bike hai? Hamare paas Bajaj, Hero, Honda, TVS aur Yamaha ke genuine parts available hain. Apni bike ka model aur zaroori part ka naam bhejein! 🏍️'
      : 'Which bike do you ride? We stock genuine parts for Bajaj, Hero, Honda, TVS, and Yamaha. Send us your bike model and the part you need! 🏍️'

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.MENU_ORDER_DELIVERY) {
    const bodyText = isHinglish
      ? 'Hum Store Pickup aur Delivery Assistance dono offer karte hain. Aap store se collect karna chahenge ya delivery check karna chahenge?'
      : 'We offer both Store Pickup and Delivery Assistance. Would you like to pick up from our store or check delivery to your area?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_PICKUP, title: 'Store Pickup' },
        { id: WELCOME_CALLBACKS.BUY_DELIVERY, title: 'Delivery Assistance' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.MENU_SHOP_LOCATION) {
    const bodyText = isHinglish
      ? '📍 *Best Auto Parts*\nShop Timing: 09:00 AM – 08:00 PM (Somwar se Itwar)\n*(Juma Namaz Break: 12:30 PM – 02:30 PM)*\n\nStore visit kijiye aur genuine spare parts best rates par payein! 🏍️'
      : '📍 *Best Auto Parts*\nShop Timing: 09:00 AM – 08:00 PM (Monday – Sunday)\n*(Friday Juma Break: 12:30 PM – 02:30 PM)*\n\nVisit our store for genuine spare parts at the best rates! 🏍️'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.STORE_SHARE_DETAILS, title: 'Yes, Share Details' },
        { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (
    interactiveReplyId === WELCOME_CALLBACKS.MENU_TALK_HUMAN ||
    rawText.toLowerCase() === 'talk to human'
  ) {
    const text = isHinglish
      ? 'Hum aapko Saud Bhai aur hamari team se connect kar rahe hain. Apni query yahan chhod dein, hum priority par rabta karenge! 🤝'
      : 'We are connecting you with Saud Bhai and our team. Please leave your inquiry and we will get back to you shortly! 🤝'

    // Update conversation to open/handoff and disable auto-reply
    await db
      .from('conversations')
      .update({
        ai_autoreply_disabled: true,
        status: 'open',
        ai_handoff_summary: 'Customer requested human support from WhatsApp menu',
      })
      .eq('id', conversationId)
      .eq('account_id', accountId)

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return {
      consumed: true,
      responseSent: text,
      messageId: res.whatsapp_message_id,
      handoff: true,
    }
  }

  // ------------------------------------------------------------
  // 8. Product Purchase Journey Callbacks (Section 8)
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.BUY_WANT) {
    const bodyText = isHinglish
      ? 'Bahut badhiya! 😊 Aapki pasand ke liye dhanyavaad!\n\nHum aapki purchase ko aasaan banane mein madad karenge.\n\nAap kaunsa option pasand karenge?'
      : 'Great choice! 😊 Thank you for choosing Best Auto Parts.\n\nWe are here to assist you with your purchase.\n\nWhich option would you prefer?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_PICKUP, title: 'Store Pickup' },
        { id: WELCOME_CALLBACKS.BUY_DELIVERY, title: 'Delivery Assistance' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.BUY_EXPLORING) {
    const bodyText = isHinglish
      ? 'Koi baat nahi! 😊 Aap araam se products explore kijiye.\n\nAap aage kya dekhna chahenge?'
      : 'No problem at all! 😊 Feel free to explore our products.\n\nWhat would you like to see next?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_DETAILS, title: 'Product Details' },
        { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
        { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.BUY_DETAILS) {
    const bodyText = isHinglish
      ? 'Hamare sabhi parts 100% genuine aur authorized company ke hote hain with guaranteed vehicle fitment.\n\nKya aap ise buy karna chahenge ya koi doosra part dekhna chahenge?'
      : 'All our parts are 100% genuine with guaranteed vehicle fitment.\n\nWould you like to purchase this part or explore another item?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_WANT, title: 'I Want to Buy' },
        { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.BUY_ANOTHER) {
    const text = isHinglish
      ? 'Aapko kaunsa doosra spare part ya bike model check karna hai? Naam ya model likh kar bhejein, hum foran check karenge! 🏍️'
      : 'Which other spare part or bike model would you like to check? Type the name or model and we will find it for you! 🏍️'

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 9. Store Pickup Journey Callbacks (Section 9)
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.BUY_PICKUP) {
    const bodyText = isHinglish
      ? 'Ji zaroor! 😊\n\nAap store se apna product lena chahte hain.\n\nAap kab aana pasand karenge?'
      : 'Certainly! 😊\n\nYou would like to pick up your product from our store.\n\nWhen would you prefer to visit?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.PICKUP_TODAY, title: 'Today' },
        { id: WELCOME_CALLBACKS.PICKUP_TOMORROW, title: 'Tomorrow' },
        { id: WELCOME_CALLBACKS.PICKUP_LATER, title: 'Decide Later' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (
    interactiveReplyId === WELCOME_CALLBACKS.PICKUP_TODAY ||
    interactiveReplyId === WELCOME_CALLBACKS.PICKUP_TOMORROW ||
    interactiveReplyId === WELCOME_CALLBACKS.PICKUP_LATER
  ) {
    const bodyText = isHinglish
      ? 'Aap kaunse time par aana pasand karenge?\n\nStore timing: 09:00 AM – 08:00 PM\n(Friday Juma break: 12:30 PM – 02:30 PM)'
      : 'What time would you prefer to visit?\n\nStore timing: 09:00 AM – 08:00 PM\n(Friday Juma break: 12:30 PM – 02:30 PM)'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.PICKUP_TIME_MORNING, title: 'Morning' },
        { id: WELCOME_CALLBACKS.PICKUP_TIME_AFTERNOON, title: 'Afternoon' },
        { id: WELCOME_CALLBACKS.PICKUP_TIME_EVENING, title: 'Evening' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (
    interactiveReplyId === WELCOME_CALLBACKS.PICKUP_TIME_MORNING ||
    interactiveReplyId === WELCOME_CALLBACKS.PICKUP_TIME_AFTERNOON ||
    interactiveReplyId === WELCOME_CALLBACKS.PICKUP_TIME_EVENING
  ) {
    const bodyText = isHinglish
      ? 'Bahut badhiya! 😊 Aapka preferred pickup time note ho gaya hai.\n\nStore timing: 09:00 AM – 08:00 PM (Friday Juma break: 12:30 PM – 02:30 PM).\nNote: Counter par part inspection ke baad final confirm hoga.\n\nKya aapko store address chahiye?'
      : 'Great! 😊 Your preferred pickup time has been noted.\n\nStore timing: 09:00 AM – 08:00 PM (Friday Juma break: 12:30 PM – 02:30 PM).\nNote: Part availability will be confirmed at the counter.\n\nWould you like store location details?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.STORE_SHARE_DETAILS, title: 'Yes, Share Details' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
        { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.STORE_SHARE_DETAILS) {
    const bodyText = isHinglish
      ? '📍 *Best Auto Parts*\nMain Market, Auto Parts Hub, Delhi/NCR\n⏰ Timings: 09:00 AM – 08:00 PM (Daily)\n🕌 Friday Juma Break: 12:30 PM – 02:30 PM\n📞 Contact: Saud Bhai\n\nCounter par aakar apna order collect karein! 🏍️'
      : '📍 *Best Auto Parts*\nMain Market, Auto Parts Hub, Delhi/NCR\n⏰ Timings: 09:00 AM – 08:00 PM (Daily)\n🕌 Friday Juma Break: 12:30 PM – 02:30 PM\n📞 Contact: Saud Bhai\n\nVisit our counter to pick up your order! 🏍️'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
        { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 10. Delivery Assistance Journey Callbacks (Section 10)
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.BUY_DELIVERY) {
    const text = isHinglish
      ? 'Ji zaroor! 😊 Kripya apna area ya PIN code share karein.\n\nHum check karte hain ki aapke area mein delivery ki suvidha available hai ya nahi.'
      : 'Certainly! 😊 Please share your area or PIN code.\n\nWe will check if delivery service is available in your area.'

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  // If customer replies with PIN code (or area text) after asking delivery:
  const pin = extractPinCode(rawText)
  if (pin) {
    const verification = verifyDeliveryArea(rawText)

    if (verification.status === 'available') {
      const bodyText = isHinglish
        ? 'Ji! 😊 Aapke area mein delivery ki suvidha available hai.\n\nAb aap apna order aage badhana chahenge?'
        : 'Great news! 😊 Delivery service is available in your area.\n\nWould you like to proceed with your order?'

      const res = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons: [
          { id: WELCOME_CALLBACKS.DELIVERY_CONTINUE, title: 'Continue with Order' },
          { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
          { id: WELCOME_CALLBACKS.EXIT_MAYBE_LATER, title: 'Maybe Later' },
        ],
      })
      return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
    } else if (verification.status === 'unavailable') {
      const bodyText = isHinglish
        ? 'Humein khed hai! 🙏\n\nFilhaal aapke area mein delivery ki suvidha available nahi hai.\n\nLekin aapke liye kuch aur options hain:'
        : 'We apologize! 🙏\n\nCurrently, delivery service is not available in your area.\n\nHowever, you can explore other options:'

      const res = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons: [
          { id: WELCOME_CALLBACKS.BUY_PICKUP, title: 'Store Pickup' },
          { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
          { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
        ],
      })
      return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
    } else {
      // Unknown delivery source: Do not fabricate. Offer human verification (Section 10).
      const bodyText = isHinglish
        ? 'Aapka area/PIN code note kar liya gaya hai. Delivery availability verify karne ke liye hamari team aap se jald rabta karegi. 😊\n\nYa aap store pickup bhi choose kar sakte hain.'
        : 'We have noted your area/PIN code. Our team will verify delivery availability and contact you shortly. 😊\n\nYou can also opt for store pickup.'

      const res = await engineSendInteractiveButtons({
        accountId,
        userId,
        conversationId,
        contactId,
        bodyText,
        buttons: [
          { id: WELCOME_CALLBACKS.BUY_PICKUP, title: 'Store Pickup' },
          { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
          { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
        ],
      })
      return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
    }
  }

  // ------------------------------------------------------------
  // 11. Order & Quantity Safety (Section 15)
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.DELIVERY_CONTINUE) {
    const bodyText = isHinglish
      ? 'Bahut achha! Aapko kitne pieces ki zaroorat hai? Kripya quantity select karein:'
      : 'Excellent! How many pieces do you require? Please select a quantity:'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.ORDER_QTY_1, title: '1 Piece' },
        { id: WELCOME_CALLBACKS.ORDER_QTY_2, title: '2 Pieces' },
        { id: WELCOME_CALLBACKS.ORDER_QTY_OTHER, title: 'Other Quantity' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (
    interactiveReplyId === WELCOME_CALLBACKS.ORDER_QTY_1 ||
    interactiveReplyId === WELCOME_CALLBACKS.ORDER_QTY_2 ||
    interactiveReplyId === WELCOME_CALLBACKS.ORDER_QTY_OTHER
  ) {
    const bodyText = isHinglish
      ? 'Aapki requested quantity note ho gayi hai. Hamari sales team internal availability check karke order finalize karne ke liye jald contact karegi. Shukriya! ❤️'
      : 'Your requested quantity has been noted. Our sales team will verify internal availability and connect with you to finalize order details. Thank you! ❤️'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
        { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 12. Maybe Later & Exit Callbacks (Section 11)
  // ------------------------------------------------------------
  if (interactiveReplyId === WELCOME_CALLBACKS.EXIT_MAYBE_LATER) {
    const bodyText = isHinglish
      ? 'Koi baat nahi! 😊\n\nJab bhi aapko kisi spare part ki zaroorat ho, Best Auto Parts aapki help ke liye yahin hai.\n\nKya hum aapki kisi aur cheez mein madad kar sakte hain?'
      : 'No worries at all! 😊\n\nWhenever you need any spare parts, Best Auto Parts is always here to help.\n\nIs there anything else we can assist you with?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
        { id: WELCOME_CALLBACKS.MENU_SHOP_LOCATION, title: 'Shop Information' },
        { id: WELCOME_CALLBACKS.EXIT_NO_THANK_YOU, title: 'No, Thank You' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  if (interactiveReplyId === WELCOME_CALLBACKS.EXIT_NO_THANK_YOU) {
    const text = isHinglish
      ? 'Aapka bahut-bahut dhanyavaad! ❤️\n\nBest Auto Parts se judne ke liye shukriya.\n\nAapka din shubh rahe! 😊'
      : 'Thank you very much! ❤️\n\nThank you for choosing Best Auto Parts.\n\nHave a wonderful day ahead! 😊'

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  // If none of the welcome-flow specific interactive callbacks or states matched,
  // return consumed: false so the rest of the CRM routing (flows, automations, AI) can process it.
  return { consumed: false }
}
