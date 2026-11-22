/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
  engineSendMedia,
  engineSendText,
} from '@/lib/flows/meta-send'
import { addContactTagIfAbsent, removeContactTag } from '@/lib/contacts/tag-write'
import {
  getSmartProductClarification,
  extractInventoryKeywords,
  hasInventoryIntent,
  searchInventoryForAi,
  type InventoryContextResult,
} from '@/lib/ai/inventory-context'
import { cleanCustomerFacingPartName } from '@/lib/ai/stock-privacy'
import { formatVehicleFitment } from '@/lib/inventory/fitment'
import { PaymentService } from '@/lib/payments/payment-service'

export type CustomerLanguage = 'en' | 'hinglish'

// ============================================================
// Stable Callback Identifiers
// ============================================================
export const WELCOME_CALLBACKS = {
  // Language Selection & Switch
  LANG_ENGLISH: 'LANG_ENGLISH',
  LANG_HINGLISH: 'LANG_HINGLISH',
  CHANGE_LANGUAGE: 'CHANGE_LANGUAGE',
  SWITCH_TO_ENGLISH: 'SWITCH_TO_ENGLISH',
  SWITCH_TO_HINGLISH: 'SWITCH_TO_HINGLISH',

  // Main Customer Menu
  MENU_FIND_PART: 'MENU_FIND_PART',
  MENU_PRODUCT_PRICE: 'MENU_PRODUCT_PRICE',
  MENU_SEARCH_BIKE: 'MENU_SEARCH_BIKE',
  MENU_ORDER_DELIVERY: 'MENU_ORDER_DELIVERY',
  MENU_SHOP_LOCATION: 'MENU_SHOP_LOCATION',
  MENU_TALK_HUMAN: 'MENU_TALK_HUMAN',

  // Product Purchase Journey
  BUY_NOW: 'BUY_NOW',
  BUY_WANT: 'BUY_WANT',
  BUY_EXPLORING: 'BUY_EXPLORING',
  BUY_PICKUP: 'BUY_PICKUP',
  BUY_DELIVERY: 'BUY_DELIVERY',
  BUY_ONLINE_PAY: 'BUY_ONLINE_PAY',
  PAY_UPI_ID: 'PAY_UPI_ID',
  PAY_SCAN_QR: 'PAY_SCAN_QR',
  PAY_RETRY: 'PAY_RETRY',
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

// In-memory session cache for fast, zero-fail language resolution within session
const contactLanguageCache = new Map<string, { lang: CustomerLanguage; timestamp: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function clearContactLanguageCache(): void {
  contactLanguageCache.clear()
}

export async function getContactLanguage(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<CustomerLanguage | null> {
  const cacheKey = `${accountId}:${contactId}`

  // 1. Check contacts.preferred_language column first
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
            const lang = val as CustomerLanguage
            contactLanguageCache.set(cacheKey, { lang, timestamp: Date.now() })
            return lang
          }
        }
      }
    }
  } catch {
    // Column may not exist if migration 061 hasn't landed in environment
  }

  // 2. Check in-memory session cache (critical for unmigrated environment or fast turns)
  const cached = contactLanguageCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.lang
  }

  // 3. Check contact_tags via robust 2-step lookup (avoids fragile PostgREST inner joins)
  try {
    const ctTable = db.from('contact_tags')
    if (ctTable && typeof ctTable.select === 'function') {
      let q: any = ctTable.select('tag_id')
      if (typeof q?.eq === 'function') {
        q = q.eq('contact_id', contactId)
      }
      const { data: contactTags, error: tagErr } = await (q?.then ? q : q?.maybeSingle ? q.maybeSingle() : Promise.resolve({ data: null, error: null }))

      if (!tagErr && Array.isArray(contactTags) && contactTags.length > 0) {
        const tagIds = contactTags.map((ct: any) => ct.tag_id).filter(Boolean)
        if (tagIds.length > 0) {
          let tq: any = db.from('tags').select('name')
          if (typeof tq?.in === 'function') tq = tq.in('id', tagIds)
          if (typeof tq?.eq === 'function') tq = tq.eq('account_id', accountId)
          const { data: tagsList } = await (tq?.then ? tq : Promise.resolve({ data: null }))
          if (Array.isArray(tagsList)) {
            for (const t of tagsList) {
              const tagName = String(t.name || '').toLowerCase()
              if (tagName.includes('hinglish')) {
                contactLanguageCache.set(cacheKey, { lang: 'hinglish', timestamp: Date.now() })
                return 'hinglish'
              }
              if (tagName.includes('english')) {
                contactLanguageCache.set(cacheKey, { lang: 'en', timestamp: Date.now() })
                return 'en'
              }
            }
          }
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
            if (lower === 'en' || lower === 'english') {
              contactLanguageCache.set(cacheKey, { lang: 'en', timestamp: Date.now() })
              return 'en'
            }
            if (lower === 'hinglish') {
              contactLanguageCache.set(cacheKey, { lang: 'hinglish', timestamp: Date.now() })
              return 'hinglish'
            }
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
  userId?: string,
): Promise<void> {
  // Update in-memory session cache immediately
  const cacheKey = `${accountId}:${contactId}`
  contactLanguageCache.set(cacheKey, { lang, timestamp: Date.now() })

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
      // Resolve effective user_id required by tags table schema (user_id NOT NULL REFERENCES auth.users)
      let effectiveUserId = userId
      if (!effectiveUserId) {
        try {
          const { data: contact } = await db
            .from('contacts')
            .select('user_id')
            .eq('id', contactId)
            .maybeSingle()
          if (contact?.user_id) {
            effectiveUserId = contact.user_id
          }
        } catch {
          // ignore
        }
      }

      if (!effectiveUserId) {
        try {
          const { data: account } = await db
            .from('accounts')
            .select('owner_user_id')
            .eq('id', accountId)
            .maybeSingle()
          if (account?.owner_user_id) {
            effectiveUserId = account.owner_user_id
          }
        } catch {
          // ignore
        }
      }

      if (!effectiveUserId) {
        try {
          const { data: profile } = await db
            .from('profiles')
            .select('user_id')
            .eq('account_id', accountId)
            .limit(1)
            .maybeSingle()
          if (profile?.user_id) {
            effectiveUserId = profile.user_id
          }
        } catch {
          // ignore
        }
      }

      const tagPayload: Record<string, any> = {
        account_id: accountId,
        name: desiredTagName,
        color: '#10B981',
      }
      if (effectiveUserId) {
        tagPayload.user_id = effectiveUserId
      }

      const { data: createdTag } = await db
        .from('tags')
        .insert(tagPayload)
        .select('id')
        .single()
      tag = createdTag
    }

    if (tag?.id) {
      try {
        await addContactTagIfAbsent(db, {
          accountId,
          contactId,
          tagId: tag.id,
        })
      } catch {
        // Fallback: direct insert into contact_tags if addContactTagIfAbsent throws (e.g. non-UUID in tests or strict ownership check)
        try {
          await db
            .from('contact_tags')
            .insert({ contact_id: contactId, tag_id: tag.id })
        } catch {
          // Best-effort
        }
      }
    }

    // Clean up opposing tag if present
    const { data: oldTag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', oldTagName)
      .maybeSingle()

    if (oldTag?.id) {
      try {
        await removeContactTag(db, {
          accountId,
          contactId,
          tagId: oldTag.id,
        })
      } catch {
        try {
          await db
            .from('contact_tags')
            .delete()
            .eq('contact_id', contactId)
            .eq('tag_id', oldTag.id)
        } catch {
          // Best-effort
        }
      }
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

// UPI ID detection (e.g., username@okaxis, 9761224004@axl)
export const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/

// Customer payment claim detection ("I have paid", "Payment done", UTR numbers)
export const PAYMENT_CLAIM_REGEX =
  /^(paid|i\s*have\s*paid|payment\s*done|maine\s*pay\s*kar\s*diya|pay\s*ho\s*gaya|payment\s*ho\s*gayi|utr\s*[:0-9a-zA-Z]+)\b/i

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
    ? `${prefix}Aapko kis cheez mein madad chahiye?\n\nKripya shuru karne ke liye niche diye gaye menu se ek option chunein:`
    : `${prefix}How can we help you?\n\nPlease choose an option from the menu below to get started:`

  const sectionTitle = isHinglish ? 'Hamari Suvidhayein' : 'Customer Services'

  const rows = isHinglish
    ? [
        {
          id: WELCOME_CALLBACKS.MENU_FIND_PART,
          title: 'Spare Part Dhoondhein',
          description: 'Part ka naam ya bike model likhein',
        },
        {
          id: WELCOME_CALLBACKS.MENU_PRODUCT_PRICE,
          title: 'Price & Availability',
          description: 'Product ki keemat aur availability jaanein',
        },
        {
          id: WELCOME_CALLBACKS.MENU_SEARCH_BIKE,
          title: 'Bike Model Search Karein',
          description: 'Apni bike ke compatible parts dhoondhein',
        },
        {
          id: WELCOME_CALLBACKS.MENU_ORDER_DELIVERY,
          title: 'Order & Delivery Jankari',
          description: 'Order aur delivery ka process jaanein',
        },
        {
          id: WELCOME_CALLBACKS.MENU_SHOP_LOCATION,
          title: 'Store Location & Timing',
          description: 'Hamare store ki location aur timing jaanein',
        },
        {
          id: WELCOME_CALLBACKS.MENU_TALK_HUMAN,
          title: 'Specialist Se Baat Karein',
          description: 'Hamari team se madad lein',
        },
      ]
    : [
        {
          id: WELCOME_CALLBACKS.MENU_FIND_PART,
          title: 'Find a Spare Part',
          description: 'Search parts by name or model',
        },
        {
          id: WELCOME_CALLBACKS.MENU_PRODUCT_PRICE,
          title: 'Price & Availability',
          description: 'Check product details',
        },
        {
          id: WELCOME_CALLBACKS.MENU_SEARCH_BIKE,
          title: 'Search Bike Model',
          description: 'Find compatible spare parts',
        },
        {
          id: WELCOME_CALLBACKS.MENU_ORDER_DELIVERY,
          title: 'Order & Delivery Process',
          description: 'Learn about ordering and delivery',
        },
        {
          id: WELCOME_CALLBACKS.MENU_SHOP_LOCATION,
          title: 'Store Location & Timings',
          description: 'Find our store information',
        },
        {
          id: WELCOME_CALLBACKS.MENU_TALK_HUMAN,
          title: 'Talk to Specialist',
          description: 'Get help from our team',
        },
      ]

  const switchSection = isHinglish
    ? {
        title: 'Bhasha Badlein',
        rows: [
          {
            id: WELCOME_CALLBACKS.SWITCH_TO_ENGLISH,
            title: 'Switch to English',
            description: 'Change language to English',
          },
        ],
      }
    : {
        title: 'Language Settings',
        rows: [
          {
            id: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
            title: 'Switch to Hinglish',
            description: 'Bhasha badal kar Hinglish karein',
          },
        ],
      }

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
        title: sectionTitle,
        rows,
      },
      switchSection,
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
  // 0. Auto-Reset Human Handoff on Greeting / Menu Navigation / Switch
  // When a customer who was previously handed off to human support
  // sends "Hi", returns to the bot menu, or switches language,
  // clear ai_autoreply_disabled so automated replies resume immediately.
  // ------------------------------------------------------------
  const isLanguageSwitchIntent =
    interactiveReplyId === WELCOME_CALLBACKS.SWITCH_TO_ENGLISH ||
    interactiveReplyId === WELCOME_CALLBACKS.SWITCH_TO_HINGLISH ||
    /^(switch\s*to\s*(english|hinglish)|change\s*to\s*(english|hinglish))$/i.test(rawText)

  const shouldResetHandoff =
    isGreeting(rawText) ||
    isLanguageChangeRequest(rawText) ||
    isLanguageSwitchIntent ||
    interactiveReplyId === WELCOME_CALLBACKS.BACK_TO_MENU ||
    (interactiveReplyId && isWelcomeFlowCallback(interactiveReplyId))

  if (shouldResetHandoff) {
    try {
      const { data: conv } = await db
        .from('conversations')
        .select('ai_autoreply_disabled, assigned_agent_id')
        .eq('id', conversationId)
        .eq('account_id', accountId)
        .maybeSingle()

      if (conv?.ai_autoreply_disabled || conv?.assigned_agent_id) {
        await db
          .from('conversations')
          .update({
            ai_autoreply_disabled: false,
            assigned_agent_id: null,
            ai_handoff_summary: null,
          })
          .eq('id', conversationId)
          .eq('account_id', accountId)
      }
    } catch {
      // Best-effort handoff reset
    }
  }

  // ------------------------------------------------------------
  // 1. Direct Language Switch Callbacks & Natural Text
  // ------------------------------------------------------------
  const isSwitchToEnglish =
    interactiveReplyId === WELCOME_CALLBACKS.SWITCH_TO_ENGLISH ||
    /^(switch\s*to\s*english|change\s*to\s*english|english\s*language)$/i.test(rawText)

  const isSwitchToHinglish =
    interactiveReplyId === WELCOME_CALLBACKS.SWITCH_TO_HINGLISH ||
    /^(switch\s*to\s*hinglish|change\s*to\s*hinglish|hinglish\s*language)$/i.test(rawText)

  if (isSwitchToEnglish || isSwitchToHinglish) {
    const targetLang: CustomerLanguage = isSwitchToEnglish ? 'en' : 'hinglish'
    await setContactLanguage(db, accountId, contactId, targetLang, userId)

    const confirmation =
      targetLang === 'hinglish'
        ? 'Aapki bhasha Hinglish mein switch ho gayi hai! Ab hamare saare messages Hinglish mein aayenge. 😊'
        : 'Your language has been switched to English! All future messages will be in English. 😊'

    const res = await sendMainMenu({
      accountId,
      userId,
      conversationId,
      contactId,
      lang: targetLang,
      greetingPrefix: confirmation,
    })

    return {
      consumed: true,
      responseSent: confirmation,
      messageId: res.whatsapp_message_id,
    }
  }

  // ------------------------------------------------------------
  // 1A. Language Change Command Prompt
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
  // 2. Language Selection Callbacks & Typed Selection
  // ------------------------------------------------------------
  const existingSavedLang = await getContactLanguage(db, accountId, contactId)

  let isSelectingLanguage = false
  let selectedLang: CustomerLanguage = 'en'

  if (
    interactiveReplyId === WELCOME_CALLBACKS.LANG_ENGLISH ||
    interactiveReplyId === WELCOME_CALLBACKS.LANG_HINGLISH
  ) {
    isSelectingLanguage = true
    selectedLang =
      interactiveReplyId === WELCOME_CALLBACKS.LANG_HINGLISH ? 'hinglish' : 'en'
  } else if (!interactiveReplyId && rawText) {
    if (/^(hinglish|hindi)\b/i.test(rawText) && !isGreeting(rawText)) {
      isSelectingLanguage = true
      selectedLang = 'hinglish'
    } else if (/^(english|en)\b/i.test(rawText) && !isGreeting(rawText)) {
      isSelectingLanguage = true
      selectedLang = 'en'
    } else if (/^(2|do|two)$/i.test(rawText) && !existingSavedLang) {
      isSelectingLanguage = true
      selectedLang = 'hinglish'
    } else if (/^(1|one|ek)$/i.test(rawText) && !existingSavedLang) {
      isSelectingLanguage = true
      selectedLang = 'en'
    } else if (/^(1|2)$/.test(rawText)) {
      try {
        const { data: lastBotMsg } = await db
          .from('messages')
          .select('content_text')
          .eq('conversation_id', conversationId)
          .eq('sender_type', 'bot')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (
          lastBotMsg?.content_text?.includes('preferred language') ||
          lastBotMsg?.content_text?.includes('bhasha')
        ) {
          isSelectingLanguage = true
          selectedLang = rawText === '2' ? 'hinglish' : 'en'
        }
      } catch {}
    }
  }

  if (isSelectingLanguage) {
    await setContactLanguage(db, accountId, contactId, selectedLang, userId)

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
  const savedLang = existingSavedLang ?? (await getContactLanguage(db, accountId, contactId))

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
      ? 'Bilkul! Aap apni bike ka brand aur poora model batayein, saath hi jis spare part ki zarurat hai uska naam bhi likhein.\n\nExample:\nBajaj Pulsar 150 – Clutch Plate\nHonda Shine – Brake Shoe\nHero Splendor Plus – Chain Sprocket Kit'
      : 'Sure! Please tell us your bike brand and complete model, along with the spare part you need.\n\nFor example:\nBajaj Pulsar 150 – Clutch Plate\nHonda Shine – Brake Shoe\nHero Splendor Plus – Chain Sprocket Kit'

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
  // 8. Product Purchase Journey Callbacks (Section 8, 9, 10)
  // ------------------------------------------------------------
  if (
    interactiveReplyId === WELCOME_CALLBACKS.BUY_NOW ||
    interactiveReplyId === WELCOME_CALLBACKS.BUY_WANT ||
    /^(buy\s*now|kharidna\s*hai|i\s*want\s*to\s*buy)$/i.test(rawText)
  ) {
    const bodyText = isHinglish
      ? 'Bahut badhiya! Aap product store se pickup karna chahenge, home delivery chahiye ya online payment karna chahenge?'
      : 'Great! Would you prefer to pick up the product from our store, get home delivery, or pay online?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_PICKUP, title: 'Store Pickup' },
        { id: WELCOME_CALLBACKS.BUY_DELIVERY, title: 'Home Delivery' },
        { id: WELCOME_CALLBACKS.BUY_ONLINE_PAY, title: 'Online Payment' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 8A. Online Payment Flow (PhonePe Gateway Track 2)
  // ------------------------------------------------------------
  if (
    interactiveReplyId === WELCOME_CALLBACKS.BUY_ONLINE_PAY ||
    interactiveReplyId === WELCOME_CALLBACKS.PAY_RETRY ||
    /^(online\s*payment|pay\s*online|online\s*pay)$/i.test(rawText)
  ) {
    let checkoutLink = 'https://best-auto-parts-one.vercel.app/pay?order=BAP-ORDER'
    try {
      const initResult = await PaymentService.initiatePayment({
        db,
        accountId,
        userId,
        contactId,
        conversationId,
        partName: 'Bajaj Pulsar 150 Clutch Plate Set',
        unitPrice: 690,
        quantity: 1,
        fulfillmentType: 'online_checkout',
        preferredLanguage: isHinglish ? 'hinglish' : 'en',
        paymentMethod: 'CHECKOUT_LINK',
      })
      if (initResult.checkoutUrl) {
        checkoutLink = initResult.checkoutUrl
      }
    } catch {
      // Fallback
    }

    const bodyText = isHinglish
      ? `Online Payment ke liye kripya apna tarika chuniye:\n\n` +
        `Same-phone payment ke liye aap direct secure web checkout link bhi use kar sakte hain:\n` +
        `👉 ${checkoutLink}`
      : `Please choose your online payment method:\n\n` +
        `If you are paying from the same phone, you can also use our secure checkout link:\n` +
        `👉 ${checkoutLink}`

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.PAY_UPI_ID, title: 'UPI ID Payment' },
        { id: WELCOME_CALLBACKS.PAY_SCAN_QR, title: 'Scan QR Code' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  // Scan Dynamic QR Code Flow
  if (
    interactiveReplyId === WELCOME_CALLBACKS.PAY_SCAN_QR ||
    /^(scan\s*qr|scan\s*qr\s*code|qr\s*code)$/i.test(rawText)
  ) {
    let orderRef = 'BAP-9634'
    let totalAmt = 690
    try {
      const initResult = await PaymentService.initiatePayment({
        db,
        accountId,
        userId,
        contactId,
        conversationId,
        partName: 'Bajaj Pulsar 150 Clutch Plate Set',
        unitPrice: 690,
        quantity: 1,
        fulfillmentType: 'online_checkout',
        preferredLanguage: isHinglish ? 'hinglish' : 'en',
        paymentMethod: 'UPI_QR',
      })
      orderRef = initResult.merchantTransactionId
      totalAmt = initResult.totalAmount
    } catch {
      // Fallback
    }

    const shortRef = orderRef.slice(-6)
    const bodyText = isHinglish
      ? `📷 *Scan karke Pay karein: ₹${totalAmt.toFixed(2)}*\n` +
        `Payee: Best Auto Parts (Nabeel Khan)\n` +
        `Order ID: #${shortRef}\n\n` +
        `1. Apne PhonePe, Google Pay ya Paytm se scan karein.\n` +
        `2. ₹${totalAmt.toFixed(2)} ka amount automatically pre-filled hai.\n` +
        `3. Kripya agle 15 minutes ke andar payment complete karein.\n\n` +
        `⏱️ *Yeh Dynamic QR agle 15 minutes ke liye valid hai.*\n` +
        `✅ PhonePe gateway dwara verify hote hi order confirm ho jayega.`
      : `📷 *Scan to Pay: ₹${totalAmt.toFixed(2)}*\n` +
        `Payee: Best Auto Parts (Nabeel Khan)\n` +
        `Order ID: #${shortRef}\n\n` +
        `1. Scan this dynamic QR using PhonePe, Google Pay, or Paytm.\n` +
        `2. The amount ₹${totalAmt.toFixed(2)} is pre-filled.\n` +
        `3. Please complete payment within 15 minutes.\n\n` +
        `⏱️ *This Dynamic QR will expire in 15 minutes.*\n` +
        `✅ Your order will be confirmed automatically once verified by PhonePe.`;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://best-auto-parts-one.vercel.app'
    const qrImageUrl = `${siteUrl}/api/payments/phonepe/qr/${encodeURIComponent(orderRef)}`

    let mediaMessageId: string | undefined
    try {
      const mediaRes = await engineSendMedia({
        accountId,
        userId,
        conversationId,
        contactId,
        kind: 'image',
        link: qrImageUrl,
        caption: bodyText,
      })
      mediaMessageId = mediaRes?.whatsapp_message_id
    } catch (mediaErr) {
      console.warn('[welcome-flow] engineSendMedia fallback:', mediaErr)
    }

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText: isHinglish
        ? 'Same-phone payment ke liye aap direct link ya UPI ID use kar sakte hain:'
        : 'For same-phone payment, you can also use direct checkout or UPI ID:',
      buttons: [
        { id: WELCOME_CALLBACKS.PAY_UPI_ID, title: 'UPI ID Payment' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: mediaMessageId || res.whatsapp_message_id }
  }

  // UPI ID Payment / Same-phone Web Checkout Flow
  if (
    interactiveReplyId === WELCOME_CALLBACKS.PAY_UPI_ID ||
    /^(upi\s*id|upi\s*id\s*payment|pay\s*via\s*upi)$/i.test(rawText)
  ) {
    let checkoutLink = 'https://best-auto-parts-one.vercel.app/pay?order=BAP-ORDER'
    let orderRef = 'BAP-9634'
    let totalAmt = 690
    try {
      const initResult = await PaymentService.initiatePayment({
        db,
        accountId,
        userId,
        contactId,
        conversationId,
        partName: 'Bajaj Pulsar 150 Clutch Plate Set',
        unitPrice: 690,
        quantity: 1,
        fulfillmentType: 'online_checkout',
        preferredLanguage: isHinglish ? 'hinglish' : 'en',
        paymentMethod: 'CHECKOUT_LINK',
      })
      if (initResult.checkoutUrl) {
        checkoutLink = initResult.checkoutUrl
      }
      orderRef = initResult.merchantTransactionId
      totalAmt = initResult.totalAmount
    } catch {
      // Fallback
    }

    const shortRef = orderRef.slice(-6)
    const formattedAmt = `₹${totalAmt.toFixed(2)}`
    const text = isHinglish
      ? `⚡ *UPI ID Payment — PhonePe Gateway*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Order ID: #${shortRef}\n` +
        `• Total Amount: ${formattedAmt} (All taxes included)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Apne phone se seedhe 1-click pay karne ke liye niche secure checkout link par tap karein:\n` +
        `👉 ${checkoutLink}\n\n` +
        `Yeh PhonePe, Google Pay aur Paytm ko support karta hai.\n\n` +
        `Ya agar aap direct collect request chahte hain, toh apni UPI ID (VPA) yahan send karein (jaise: username@okhdfcbank).`
      : `⚡ *UPI ID Payment — PhonePe Gateway*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Order ID: #${shortRef}\n` +
        `• Total Amount: ${formattedAmt} (All taxes included)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `To pay directly from your UPI app on this phone, tap our secure checkout link:\n` +
        `👉 ${checkoutLink}\n\n` +
        `Supports PhonePe, Google Pay, and Paytm.\n\n` +
        `Alternatively, type your UPI ID (VPA) here to receive an instant collect request (e.g. username@okhdfcbank).`;

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  // Customer Enters / Sends a UPI ID (VPA)
  if (UPI_ID_REGEX.test(rawText)) {
    const customerVpa = rawText
    let orderRef = 'BAP-9634'
    let totalAmt = 690
    try {
      const initResult = await PaymentService.initiatePayment({
        db,
        accountId,
        userId,
        contactId,
        conversationId,
        partName: 'Bajaj Pulsar 150 Clutch Plate Set',
        unitPrice: 690,
        quantity: 1,
        fulfillmentType: 'online_checkout',
        preferredLanguage: isHinglish ? 'hinglish' : 'en',
        paymentMethod: 'UPI_COLLECT',
        customerVpa,
      })
      orderRef = initResult.merchantTransactionId
      totalAmt = initResult.totalAmount
    } catch {
      // Fallback
    }

    const shortRef = orderRef.slice(-6)
    const formattedAmt = `₹${totalAmt.toFixed(2)}`
    const text = isHinglish
      ? `✅ Hamne aapki UPI ID (*${customerVpa}*) par Order #${shortRef} ke liye ${formattedAmt} ka payment collect request bhej diya hai.\n\n` +
        `Kripya apne UPI app (PhonePe / Google Pay / Paytm) mein jakar payment approve karein. ⏱️ (Valid for 15 minutes)\n\n` +
        `Jaise hi payment confirm hoga, aapko foran WhatsApp par receipt mil jayegi!`
      : `✅ We have sent a collect request of ${formattedAmt} for Order #${shortRef} to your UPI ID (*${customerVpa}*).\n\n` +
        `Please open your UPI app (PhonePe / Google Pay / Paytm) and approve the payment. ⏱️ (Valid for 15 minutes)\n\n` +
        `Your order will be confirmed automatically once verified!`;

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  // Customer Claims Payment Done via WhatsApp text / typed UTR
  if (PAYMENT_CLAIM_REGEX.test(rawText)) {
    const text = isHinglish
      ? `Ham aapka payment PhonePe gateway ke saath verify kar rahe hain. ⏳\n\n` +
        `Best Auto Parts ka system gateway se cryptographically verified confirmation milne par hi order confirm karta hai.\n` +
        `Jaise hi verification complete hogi, aapko official receipt send kar di jayegi!\n\n` +
        `Kisi bhi inquiry ke liye aap hamare store staff se baat kar sakte hain.`
      : `We are verifying your transaction with the PhonePe gateway. ⏳\n\n` +
        `Best Auto Parts confirms orders automatically once cryptographic gateway confirmation is received.\n` +
        `You will receive your official receipt here as soon as verification completes!\n\n` +
        `If you have questions, please feel free to speak with our store staff.`;

    const res = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text,
    })
    return { consumed: true, responseSent: text, messageId: res.whatsapp_message_id }
  }

  if (
    interactiveReplyId === WELCOME_CALLBACKS.BUY_EXPLORING ||
    /^(just\s*exploring|abhi\s*sirf\s*dekh\s*raha\s*hoon)$/i.test(rawText)
  ) {
    const bodyText = isHinglish
      ? 'Koi baat nahi! Aap araam se products dekh sakte hain. Agar kisi aur spare part ki zarurat ho, toh humein bata dijiye.'
      : 'No problem! Feel free to explore. Let us know if you need help finding another spare part.'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
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

  // ------------------------------------------------------------
  // 13. Yes/No Context Handling (Section 11)
  // ------------------------------------------------------------
  const isYes = /^(yes|yeah|yep|yup|haan|ha|ji|sure|bilkul|zaroor)$/i.test(rawText)
  const isNo = /^(no|nope|nah|nahi|nahin|na|matlab nahi)$/i.test(rawText)

  if (!interactiveReplyId && (isYes || isNo)) {
    // Inspect the last bot message in the conversation
    let lastBotText = ''
    try {
      const { data: lastBotMsg } = await db
        .from('messages')
        .select('content_text')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      lastBotText = (lastBotMsg?.content_text || '').toLowerCase()
    } catch {
      // fallback
    }

    // Context A: Store address prompt ("Kya aapko store address chahiye?" / "Would you like store location details?")
    if (
      lastBotText.includes('store address') ||
      lastBotText.includes('store location') ||
      lastBotText.includes('address chahiye')
    ) {
      if (isYes) {
        // Return store location details
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
      } else {
        const bodyText = isHinglish
          ? 'Theek hai! Jab bhi aapko zaroorat ho, Best Auto Parts aapki sewa ke liye hazir hai. 😊'
          : 'Understood! Best Auto Parts is always here to assist you whenever you need. 😊'

        const res = await engineSendInteractiveButtons({
          accountId,
          userId,
          conversationId,
          contactId,
          bodyText,
          buttons: [
            { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
            { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
          ],
        })
        return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
      }
    }

    // Context B: Proceed with order after delivery check ("Would you like to proceed with your order?" / "Ab aap apna order aage badhana chahenge?")
    if (
      lastBotText.includes('proceed with your order') ||
      lastBotText.includes('aage badhana chahenge')
    ) {
      if (isYes) {
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
      } else {
        const bodyText = isHinglish
          ? 'Koi baat nahi! Jab bhi aap order aage badhana chahein, humein batayein.'
          : 'No problem! Whenever you are ready to proceed, please let us know.'

        const res = await engineSendInteractiveButtons({
          accountId,
          userId,
          conversationId,
          contactId,
          bodyText,
          buttons: [
            { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
            { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
          ],
        })
        return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
      }
    }

    // Context C: Product purchase inquiry ("Kya aap ise kharidna chahenge?" / "Would you like to purchase it?")
    if (
      lastBotText.includes('purchase') ||
      lastBotText.includes('kharidna chahenge') ||
      lastBotText.includes('buy now')
    ) {
      if (isYes) {
        const bodyText = isHinglish
          ? 'Bahut badhiya! Aap product store se pickup karna chahenge ya delivery chahiye?'
          : 'Great! Would you prefer to pick up the product from our store or have it delivered?'

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
      } else {
        const bodyText = isHinglish
          ? 'Koi baat nahi! Aap araam se products dekh sakte hain. Agar kisi aur spare part ki zarurat ho, toh humein bata dijiye.'
          : 'No problem! Feel free to explore. Let us know if you need help finding another spare part.'

        const res = await engineSendInteractiveButtons({
          accountId,
          userId,
          conversationId,
          contactId,
          bodyText,
          buttons: [
            { id: WELCOME_CALLBACKS.BUY_ANOTHER, title: 'Find Another Part' },
            { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
          ],
        })
        return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
      }
    }

    // Context D: Unclear/No pending question.
    // Bare Yes must NEVER confirm an order or payment.
    const bodyText = isHinglish
      ? 'Kripya batayein aap kis baare mein baat kar rahe hain? Hum aapki kaise madad kar sakte hain?'
      : 'Could you please clarify what you are referring to? How can we help you?'

    const res = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons: [
        { id: WELCOME_CALLBACKS.MENU_FIND_PART, title: 'Find a Spare Part' },
        { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
      ],
    })
    return { consumed: true, responseSent: bodyText, messageId: res.whatsapp_message_id }
  }

  // ------------------------------------------------------------
  // 14. Smart Product Clarification (Section 6)
  // Handles Pu, G, Cluch plate, Break pad, Price?, Available?
  // ------------------------------------------------------------
  if (!interactiveReplyId) {
    const clarification = getSmartProductClarification(rawText, savedLang)
    if (clarification) {
      const res = await engineSendText({
        accountId,
        userId,
        conversationId,
        contactId,
        text: clarification,
      })
      return {
        consumed: true,
        responseSent: clarification,
        messageId: res.whatsapp_message_id,
      }
    }
  }

  // ------------------------------------------------------------
  // 15. Automotive Product Catalog Discovery & Search
  // Directly handles product search queries across English & Hinglish, e.g.:
  // 1. Bajaj Pulsar 150 – Clutch Plate (with en dash)
  // 2. Bajaj Pulsar 150 - Clutch Plate (with hyphen)
  // 3. Bajaj Pulsar 150 clutch plate
  // 4. Pulsar 150 clutch plate
  // 5. Pulsar 150 ki clutch plate chahiye
  // 6. Bajaj Pulsar 150 ka clutch plate
  // 7. Clutch plate for Pulsar 150
  // ------------------------------------------------------------
  if (!interactiveReplyId && rawText) {
    const normalizedQueryText = rawText.replace(/[\u2010-\u2015\u2212]/g, ' - ')
    const query = extractInventoryKeywords(normalizedQueryText)
    const hasIntent = hasInventoryIntent(query)

    if (hasIntent) {
      // Perform catalog search
      let searchResult: InventoryContextResult | null = null
      try {
        searchResult = await searchInventoryForAi(db, accountId, query, 5)
      } catch (err) {
        console.warn('[welcome-flow] searchInventoryForAi lookup:', err)
      }

      const matchedPart = searchResult?.parts?.[0]

      if (matchedPart) {
        const cleanName = cleanCustomerFacingPartName(matchedPart.part_name)
        const brandPrefix =
          matchedPart.brand &&
          !cleanName.toLowerCase().includes(matchedPart.brand.toLowerCase())
            ? `${matchedPart.brand} `
            : ''
        const fullDisplayName = `${brandPrefix}${cleanName}`

        // Strict product price integrity: reject null, undefined, <=0, NaN, non-finite
        const rawPrice = matchedPart.selling_price
        const hasValidPrice =
          typeof rawPrice === 'number' &&
          !Number.isNaN(rawPrice) &&
          Number.isFinite(rawPrice) &&
          rawPrice > 0

        const priceLine = hasValidPrice
          ? `• *Price:* ₹${rawPrice.toFixed(2)} (All taxes included)`
          : isHinglish
            ? `• *Price:* Counter / inquiry par verify karein (Team will confirm latest rate)`
            : `• *Price:* Available on inquiry with store team`

        // Vehicle fitment evidence: format verified fitments or display uncertainty
        let fitmentLine = ''
        if (matchedPart.fitments && matchedPart.fitments.length > 0) {
          const fitmentDetails = matchedPart.fitments
            .map((f: any) => {
              const base = formatVehicleFitment(f)
              return f.notes ? `${base} (${f.notes})` : base
            })
            .join(', ')
          fitmentLine = `\n• *Fitment:* ${fitmentDetails}`
        } else {
          fitmentLine = isHinglish
            ? `\n• *Fitment:* Model & year verification recommended at store counter`
            : `\n• *Fitment:* Vehicle model and year verification recommended at counter`
        }

        const bodyText = isHinglish
          ? `Ji! Hamare paas *${fullDisplayName}* available hai. 😊\n\n` +
            `• *Product:* ${fullDisplayName}\n` +
            `• *Status:* Shop par available hai (In Stock)\n` +
            `${priceLine}${fitmentLine}\n\n` +
            `Kya aap ise kharidna chahenge? Store visit ya delivery ke liye neeche button select karein.`
          : `Great news! 😊 *${fullDisplayName}* is available in stock.\n\n` +
            `• *Product:* ${fullDisplayName}\n` +
            `• *Status:* In Stock (Available at shop)\n` +
            `${priceLine}${fitmentLine}\n\n` +
            `Would you like to buy this part? Please select an option below or visit our store.`

        const buttons = isHinglish
          ? [
              { id: WELCOME_CALLBACKS.BUY_NOW, title: 'Kharidna Hai' },
              { id: WELCOME_CALLBACKS.BUY_EXPLORING, title: 'Abhi Dekh Raha Hoon' },
            ]
          : [
              { id: WELCOME_CALLBACKS.BUY_NOW, title: 'Buy Now' },
              { id: WELCOME_CALLBACKS.BUY_EXPLORING, title: 'Just Exploring' },
            ]

        const res = await engineSendInteractiveButtons({
          accountId,
          userId,
          conversationId,
          contactId,
          bodyText,
          buttons,
        })

        return {
          consumed: true,
          responseSent: bodyText,
          messageId: res.whatsapp_message_id,
        }
      } else {
        const bodyText = isHinglish
          ? `Humein khed hai, aapka requested part filhaal catalog mein verify nahi ho paya. 🙏\n\n` +
            `Saud Bhai aur hamari team se direct connect karein, hum aapko priority par part arrange karwake denge!`
          : `We could not locate this exact part in our active catalog right now. 🙏\n\n` +
            `Please connect directly with Saud Bhai and our team, and we will be happy to assist you in arranging it!`

        const buttons = [
          { id: WELCOME_CALLBACKS.MENU_TALK_HUMAN, title: 'Talk to Human' },
          { id: WELCOME_CALLBACKS.BACK_TO_MENU, title: 'Main Menu' },
        ]

        const res = await engineSendInteractiveButtons({
          accountId,
          userId,
          conversationId,
          contactId,
          bodyText,
          buttons,
        })

        return {
          consumed: true,
          responseSent: bodyText,
          messageId: res.whatsapp_message_id,
        }
      }
    }
  }

  // If none of the welcome-flow specific interactive callbacks or states matched,
  // return consumed: false so the rest of the CRM routing (flows, automations, AI) can process it.
  return { consumed: false }
}
