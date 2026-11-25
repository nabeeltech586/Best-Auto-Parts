/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getTimeBasedGreeting,
  getContactLanguage,
  setContactLanguage,
  handleWelcomeFlowInbound,
  WELCOME_CALLBACKS,
  isLanguageChangeRequest,
  verifyDeliveryArea,
  clearContactLanguageCache,
} from './welcome-flow'
import { createFakeDb } from '@/lib/flows/fake-db.test-helper'
import { validateInteractivePayload } from '@/lib/whatsapp/interactive'
import { containsStockQuantityLeak, sanitizeCustomerStockPrivacy } from '@/lib/ai/stock-privacy'
import { isWithinTimeWindow } from '@/lib/automations/time-of-day'
import { matchesKeywordTrigger } from '@/lib/flows/engine'

// Mock meta senders from '@/lib/flows/meta-send'
const sentButtons: any[] = []
const sentLists: any[] = []
const sentTexts: any[] = []
const sentMedia: any[] = []

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendInteractiveButtons: vi.fn(async (args: any) => {
    sentButtons.push(args)
    return { whatsapp_message_id: `wamid.btn.${sentButtons.length}` }
  }),
  engineSendInteractiveList: vi.fn(async (args: any) => {
    sentLists.push(args)
    return { whatsapp_message_id: `wamid.list.${sentLists.length}` }
  }),
  engineSendText: vi.fn(async (args: any) => {
    sentTexts.push(args)
    return { whatsapp_message_id: `wamid.txt.${sentTexts.length}` }
  }),
  engineSendMedia: vi.fn(async (args: any) => {
    sentMedia.push(args)
    return { whatsapp_message_id: `wamid.media.${sentMedia.length}` }
  }),
  loadAccountMetaCredentials: vi.fn(async () => ({
    phoneNumberId: 'phone-num-id-123',
    accessToken: 'decrypted-token-xyz',
  })),
}))

describe('COMPLETE WHATSAPP WELCOME FLOW UPGRADE — 24 VERIFICATION TESTS', () => {
  const accountId = 'acc-test-123'
  const userId = 'user-test-456'
  const contactId = 'contact-test-789'
  const conversationId = 'conv-test-012'

  beforeEach(() => {
    clearContactLanguageCache()
    sentButtons.length = 0
    sentLists.length = 0
    sentTexts.length = 0
    sentMedia.length = 0
    vi.clearAllMocks()
  })

  // ------------------------------------------------------------
  // Test 1: First-time Hi in morning (05:00–11:59)
  // ------------------------------------------------------------
  it('1. First-time Hi in morning: sends Good Morning greeting & language buttons', async () => {
    // 08:30 AM IST (03:00 UTC)
    const morningDate = new Date('2026-01-15T03:00:00Z')
    expect(getTimeBasedGreeting(morningDate, 'Asia/Kolkata')).toBe('Good Morning')

    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
      conversations: [{ id: conversationId, account_id: accountId }],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi',
      isFirstInboundMessage: true,
      date: morningDate,
    })

    expect(outcome.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    const call = sentButtons[0]
    expect(call.bodyText).toContain('Good Morning! Welcome to Best Auto Parts. 😊')
    expect(call.bodyText).toContain('Please choose your preferred language to continue.')
    expect(call.buttons).toEqual([
      { id: 'LANG_ENGLISH', title: 'English' },
      { id: 'LANG_HINGLISH', title: 'Hinglish' },
    ])

    // Validate interactive payload against Meta Cloud API limits
    const valid = validateInteractivePayload({
      kind: 'buttons',
      body: call.bodyText,
      buttons: call.buttons,
    })
    expect(valid.ok).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 2: First-time Hi in afternoon (12:00–16:59)
  // ------------------------------------------------------------
  it('2. First-time Hi in afternoon: sends Good Afternoon greeting & language buttons', async () => {
    // 02:30 PM IST (09:00 UTC)
    const afternoonDate = new Date('2026-01-15T09:00:00Z')
    expect(getTimeBasedGreeting(afternoonDate, 'Asia/Kolkata')).toBe('Good Afternoon')

    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hello',
      isFirstInboundMessage: true,
      date: afternoonDate,
    })

    expect(outcome.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].bodyText).toContain('Good Afternoon! Welcome to Best Auto Parts. 😊')
  })

  // ------------------------------------------------------------
  // Test 3: First-time Hi in evening (17:00–20:59)
  // ------------------------------------------------------------
  it('3. First-time Hi in evening: sends Good Evening greeting & language buttons', async () => {
    // 06:15 PM IST (12:45 UTC)
    const eveningDate = new Date('2026-01-15T12:45:00Z')
    expect(getTimeBasedGreeting(eveningDate, 'Asia/Kolkata')).toBe('Good Evening')

    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi',
      isFirstInboundMessage: true,
      date: eveningDate,
    })

    expect(outcome.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].bodyText).toContain('Good Evening! Welcome to Best Auto Parts. 😊')
  })

  // ------------------------------------------------------------
  // Test 4: First-time Hi at night (21:00–04:59)
  // ------------------------------------------------------------
  it('4. First-time Hi at night: sends Good Night greeting & language buttons', async () => {
    // 11:30 PM IST (18:00 UTC)
    const nightDate = new Date('2026-01-15T18:00:00Z')
    expect(getTimeBasedGreeting(nightDate, 'Asia/Kolkata')).toBe('Good Night')

    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi',
      isFirstInboundMessage: true,
      date: nightDate,
    })

    expect(outcome.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].bodyText).toContain('Good Night! Welcome to Best Auto Parts. 😊')
  })

  // ------------------------------------------------------------
  // Test 5: English language selection
  // ------------------------------------------------------------
  it('5. English language selection: saves preference, confirms, and displays Main Menu in English', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
      tags: [],
      contact_tags: [],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'English',
      interactiveReplyId: WELCOME_CALLBACKS.LANG_ENGLISH,
    })

    expect(outcome.consumed).toBe(true)
    // Check saved language
    const lang = await getContactLanguage(db as any, accountId, contactId)
    expect(lang).toBe('en')

    // Expect Main Menu list sent
    expect(sentLists.length).toBe(1)
    const list = sentLists[0]
    expect(list.bodyText).toContain('Welcome to *Best Auto Parts*!')
    expect(list.bodyText).toContain('Bajaj, Hero, or Honda')
    expect(list.sections[0].rows.length).toBe(6)

    // Validate interactive list payload against Meta Cloud API limits
    const valid = validateInteractivePayload({
      kind: 'list',
      header: list.headerText,
      body: list.bodyText,
      footer: list.footerText,
      button_label: list.buttonLabel,
      sections: list.sections,
    })
    expect(valid.ok).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 6: Hinglish language selection
  // ------------------------------------------------------------
  it('6. Hinglish language selection: saves preference, confirms, and displays Main Menu in Hinglish with English button titles', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
      tags: [],
      contact_tags: [],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.LANG_HINGLISH,
    })

    expect(outcome.consumed).toBe(true)
    const lang = await getContactLanguage(db as any, accountId, contactId)
    expect(lang).toBe('hinglish')

    // Expect Main Menu list sent in Hinglish
    expect(sentLists.length).toBe(1)
    const list = sentLists[0]
    expect(list.bodyText).toContain('Welcome to *Best Auto Parts*!')
    expect(list.bodyText).toContain('Bajaj, Hero, or Honda')
    expect(list.bodyText).toContain('View Menu')

    // Localized menu rows in Hinglish per Section 4
    const rowTitles = list.sections[0].rows.map((r: any) => r.title)
    expect(rowTitles).toContain('Spare Part Dhoondhein')
    expect(rowTitles).toContain('Price & Availability')
    expect(rowTitles).toContain('Bike Model Search Karein')
    expect(rowTitles).toContain('Order & Delivery Jankari')
    expect(rowTitles).toContain('Store Location & Timing')
    expect(rowTitles).toContain('Specialist Se Baat Karein')

    // Strictly no stock counting options
    for (const title of rowTitles) {
      expect(title.toLowerCase()).not.toContain('stock')
      expect(title.toLowerCase()).not.toContain('quantity')
    }
  })

  // ------------------------------------------------------------
  // Test 7: Saved language persistence
  // ------------------------------------------------------------
  it('7. Saved language persistence: preserves preference across turns and reads from DB/tags, including when column is absent', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      tags: [],
      contact_tags: [],
    })

    await setContactLanguage(db as any, accountId, contactId, 'en')
    let lang = await getContactLanguage(db as any, accountId, contactId)
    expect(lang).toBe('en')

    await setContactLanguage(db as any, accountId, contactId, 'hinglish')
    lang = await getContactLanguage(db as any, accountId, contactId)
    expect(lang).toBe('hinglish')

    // Scenario: contacts.preferred_language column does NOT exist in production Supabase
    // (migration 061 not applied). Simulates error 42703 on column select.
    const dbUnmigrated = {
      from: vi.fn((table: string) => {
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: '42703', message: 'column contacts.preferred_language does not exist' },
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: '42703', message: 'column contacts.preferred_language does not exist' },
                }),
              }),
            }),
          }
        }
        if (table === 'contact_tags') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ tag_id: 'tag-hinglish', tags: { name: 'Language: Hinglish', account_id: accountId } }],
                error: null,
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }
      }),
    }

    // Resolves smoothly via contact tags fallback
    const fallbackLang = await getContactLanguage(dbUnmigrated as any, accountId, contactId)
    expect(fallbackLang).toBe('hinglish')
  })

  // ------------------------------------------------------------
  // Test 8: Returning customer welcome
  // ------------------------------------------------------------
  it('8. Returning customer welcome: customer with saved language receives welcome back + Main Menu, not language selection', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      conversations: [{ id: conversationId, account_id: accountId }],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi',
      isFirstInboundMessage: false,
    })

    expect(outcome.consumed).toBe(true)
    // Does NOT ask for language selection again
    expect(sentButtons.length).toBe(0)
    // Sends welcome back + Main Menu list
    expect(sentLists.length).toBe(1)
    expect(sentLists[0].bodyText).toContain('Welcome back')
    expect(sentLists[0].bodyText).toContain('Bajaj, Hero, or Honda')
  })

  // ------------------------------------------------------------
  // Test 9: Returning customer without a saved language
  // ------------------------------------------------------------
  it('9. Returning customer without a saved language: gracefully prompts for language selection', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
      conversations: [{ id: conversationId, account_id: accountId }],
    })

    const outcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi again',
      isFirstInboundMessage: false,
    })

    expect(outcome.consumed).toBe(true)
    // Prompts for language selection
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].buttons).toEqual([
      { id: 'LANG_ENGLISH', title: 'English' },
      { id: 'LANG_HINGLISH', title: 'Hinglish' },
    ])
  })

  // ------------------------------------------------------------
  // Test 10: Repeated Hi before language selection
  // ------------------------------------------------------------
  it('10. Repeated Hi before language selection: redisplays language prompt without crashing or duplicate sessions', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
    })

    // Turn 1
    const res1 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi',
    })
    expect(res1.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)

    // Turn 2: Repeated "Hi"
    const res2 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Hi',
    })
    expect(res2.consumed).toBe(true)
    expect(sentButtons.length).toBe(2)
    expect(sentButtons[1].buttons[0].id).toBe('LANG_ENGLISH')
  })

  // ------------------------------------------------------------
  // Test 11: Unrecognized message before language selection
  // ------------------------------------------------------------
  it('11. Unrecognized message before language selection: gracefully redisplays language prompt', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
      messages: [
        {
          conversation_id: conversationId,
          sender_type: 'bot',
          content_text: 'Please choose your preferred language to continue.',
        },
      ],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'random unrecognized text 12345',
    })

    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].buttons).toEqual([
      { id: 'LANG_ENGLISH', title: 'English' },
      { id: 'LANG_HINGLISH', title: 'Hinglish' },
    ])
  })

  // ------------------------------------------------------------
  // Test 12: No unrelated FAQ/OOO/AI response before language selection
  // ------------------------------------------------------------
  it('12. No unrelated FAQ/OOO/AI response before language selection: consumed=true suppresses downstream responders', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: null }],
      messages: [
        {
          conversation_id: conversationId,
          sender_type: 'bot',
          content_text: 'Please choose your preferred language to continue.',
        },
      ],
    })

    // Customer types product inquiry or FAQ command before selecting language
    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Pulsar clutch plate price',
    })

    // Consumed must be true so webhook suppresses automations and AI
    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].buttons[0].id).toBe('LANG_ENGLISH')
  })

  // ------------------------------------------------------------
  // Test 13: Actual interactive button callback processing
  // ------------------------------------------------------------
  it('13. Actual interactive button callback processing: processes BUY_WANT callback with English buttons', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'I Want to Buy',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_WANT,
    })

    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    const btnCall = sentButtons[0]
    expect(btnCall.bodyText).toContain('store se pickup karna chahenge, home delivery chahiye ya online payment')
    expect(btnCall.buttons).toEqual([
      { id: 'BUY_PICKUP', title: 'Store Pickup' },
      { id: 'BUY_DELIVERY', title: 'Home Delivery' },
      { id: 'BUY_ONLINE_PAY', title: 'Online Payment' },
    ])
    expect(validateInteractivePayload({ kind: 'buttons', body: btnCall.bodyText, buttons: btnCall.buttons }).ok).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 14: List-selection callback processing
  // ------------------------------------------------------------
  it('14. List-selection callback processing: processes MENU_SHOP_LOCATION callback', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Shop Location & Timing',
      interactiveReplyId: WELCOME_CALLBACKS.MENU_SHOP_LOCATION,
    })

    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    const btnCall = sentButtons[0]
    expect(btnCall.bodyText).toContain('09:00 AM – 09:00 PM')
    expect(btnCall.bodyText).toContain('Friday Juma Break')
    expect(btnCall.bodyText).toContain('12:30 PM – 02:30 PM')
    expect(btnCall.buttons).toEqual([
      { id: 'STORE_SHARE_DETAILS', title: 'Yes, Share Details' },
      { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ------------------------------------------------------------
  // Test 15: Language-change flow
  // ------------------------------------------------------------
  it('15. Language-change flow: triggers on "Change Language" command without losing contact state', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'en' }],
    })

    expect(isLanguageChangeRequest('Change Language')).toBe(true)
    expect(isLanguageChangeRequest('Language Settings')).toBe(true)
    expect(isLanguageChangeRequest('/language')).toBe(true)

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Change Language',
    })

    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].buttons).toEqual([
      { id: 'LANG_ENGLISH', title: 'English' },
      { id: 'LANG_HINGLISH', title: 'Hinglish' },
    ])
  })

  // ------------------------------------------------------------
  // Test 16: Main menu navigation
  // ------------------------------------------------------------
  it('16. Main menu navigation: BACK_TO_MENU callback redisplays the Main Menu', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'en' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Main Menu',
      interactiveReplyId: WELCOME_CALLBACKS.BACK_TO_MENU,
    })

    expect(res.consumed).toBe(true)
    expect(sentLists.length).toBe(1)
    expect(sentLists[0].headerText).toBe('Best Auto Parts 🏍️')
    expect(sentLists[0].sections[0].rows.length).toBe(6)
  })

  // ------------------------------------------------------------
  // Test 17: Product purchase flow
  // ------------------------------------------------------------
  it('17. Product purchase flow: BUY_EXPLORING offers Product Details, Find Another Part, Talk to Human', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Just Exploring',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_EXPLORING,
    })

    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    const btnCall = sentButtons[0]
    expect(btnCall.bodyText).toContain('Koi baat nahi! Aap araam se products dekh sakte hain. Agar kisi aur spare part ki zarurat ho, toh humein bata dijiye.')
    expect(btnCall.buttons).toEqual([
      { id: 'BUY_ANOTHER', title: 'Find Another Part' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ------------------------------------------------------------
  // Test 18: Store pickup flow
  // ------------------------------------------------------------
  it('18. Store pickup flow: branches Today/Tomorrow/Decide Later → Morning/Afternoon/Evening', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    // Step 1: Click Store Pickup
    const res1 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Store Pickup',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_PICKUP,
    })
    expect(res1.consumed).toBe(true)
    expect(sentButtons[0].buttons).toEqual([
      { id: 'PICKUP_TODAY', title: 'Today' },
      { id: 'PICKUP_TOMORROW', title: 'Tomorrow' },
      { id: 'PICKUP_LATER', title: 'Decide Later' },
    ])

    // Step 2: Choose Tomorrow
    const res2 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Tomorrow',
      interactiveReplyId: WELCOME_CALLBACKS.PICKUP_TOMORROW,
    })
    expect(res2.consumed).toBe(true)
    expect(sentButtons[1].buttons).toEqual([
      { id: 'PICKUP_TIME_MORNING', title: 'Morning' },
      { id: 'PICKUP_TIME_AFTERNOON', title: 'Afternoon' },
      { id: 'PICKUP_TIME_EVENING', title: 'Evening' },
    ])

    // Step 3: Choose Afternoon
    const res3 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Afternoon',
      interactiveReplyId: WELCOME_CALLBACKS.PICKUP_TIME_AFTERNOON,
    })
    expect(res3.consumed).toBe(true)
    expect(sentButtons[2].bodyText).toContain('09:00 AM – 09:00 PM')
    expect(sentButtons[2].bodyText).toContain('Friday Juma break: 12:30 PM – 02:30 PM')
    expect(sentButtons[2].buttons).toEqual([
      { id: 'STORE_SHARE_DETAILS', title: 'Yes, Share Details' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
      { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
    ])
  })

  // ------------------------------------------------------------
  // Test 19: Delivery verification and unknown delivery status
  // ------------------------------------------------------------
  it('19. Delivery verification and unknown delivery status: handles available, unavailable, and offers human verification for unknown areas', async () => {
    // Verification function
    expect(verifyDeliveryArea('247001').status).toBe('available')
    expect(verifyDeliveryArea('190001').status).toBe('unavailable')
    expect(verifyDeliveryArea('400001').status).toBe('unknown')

    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    // Unknown PIN code query: offers human-team verification without fabricating false delivery
    const resUnknown = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'My pin code is 400001',
    })
    expect(resUnknown.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    expect(sentButtons[0].bodyText).toContain('Delivery availability verify karne ke liye hamari team aap se jald rabta karegi')
    expect(sentButtons[0].buttons).toEqual([
      { id: 'BUY_PICKUP', title: 'Store Pickup' },
      { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ------------------------------------------------------------
  // Test 20: Human handoff
  // ------------------------------------------------------------
  it('20. Human handoff: sets ai_autoreply_disabled and informs customer with Saud Bhai contact message', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      conversations: [
        {
          id: conversationId,
          account_id: accountId,
          ai_autoreply_disabled: false,
          status: 'closed',
        },
      ],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Talk to Human',
      interactiveReplyId: WELCOME_CALLBACKS.MENU_TALK_HUMAN,
    })

    expect(res.consumed).toBe(true)
    expect(res.handoff).toBe(true)
    expect(sentTexts.length).toBe(1)
    expect(sentTexts[0].text).toContain('Saud Bhai')

    // Verify conversation update
    const { data } = (await (db as any).from('conversations').select('*').maybeSingle()) as { data: any }
    expect(data.ai_autoreply_disabled).toBe(true)
    expect(data.status).toBe('open')
  })

  // ------------------------------------------------------------
  // Test 21: Duplicate inbound and callback protection
  // ------------------------------------------------------------
  it('21. Duplicate inbound and callback protection: repeated identical callbacks execute cleanly without throwing', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'en' }],
    })

    const res1 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'English',
      interactiveReplyId: WELCOME_CALLBACKS.LANG_ENGLISH,
    })
    expect(res1.consumed).toBe(true)

    const res2 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'English',
      interactiveReplyId: WELCOME_CALLBACKS.LANG_ENGLISH,
    })
    expect(res2.consumed).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 22: Customer stock privacy regression
  // ------------------------------------------------------------
  it('22. Customer stock privacy regression: no welcome flow response reveals quantity counts', () => {
    const sampleResponses = [
      'Good Morning! Welcome to Best Auto Parts. 😊 Please choose your preferred language to continue.',
      'Ji! 😊 Bajaj Pulsar 150 ka Clutch Plate Set available hai. Price: ₹690',
      'Bahut badhiya! 😊 Store timing: 09:00 AM – 09:00 PM (Friday Juma break: 12:30 PM – 02:30 PM).',
      'Aapka area/PIN code note kar liya gaya hai. Delivery availability verify karenge.',
    ]

    for (const text of sampleResponses) {
      expect(containsStockQuantityLeak(text)).toBe(false)
      expect(sanitizeCustomerStockPrivacy(text)).toBe(text)
    }

    // Leaky response is stripped
    const leaky = 'Pulsar 150 clutch plate is available with 15 units in stock for ₹690.'
    expect(containsStockQuantityLeak(leaky)).toBe(true)
    const sanitized = sanitizeCustomerStockPrivacy(leaky)
    expect(sanitized).not.toContain('15 units in stock')
  })

  // ------------------------------------------------------------
  // Test 23: Existing OOO and FAQ routing regression
  // ------------------------------------------------------------
  it('23. Existing OOO and FAQ routing regression: command match preserves menu/help/options', () => {
    const faqConfig = {
      keywords: ['menu', 'help', 'options'],
      match_type: 'command' as const,
    }
    expect(matchesKeywordTrigger('menu', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('help', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('options', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('Hi', faqConfig)).toBe(false)

    // OOO schedule
    const storeSchedule = '20:00-09:00, fri:12:30-14:30'
    const tz = 'Asia/Kolkata'
    // Friday 13:00 IST -> Closed (Juma break)
    expect(isWithinTimeWindow(storeSchedule, new Date('2026-01-16T07:30:00Z'), tz)).toBe(true)
    // Thursday 13:00 IST -> Open
    expect(isWithinTimeWindow(storeSchedule, new Date('2026-01-15T07:30:00Z'), tz)).toBe(false)
  })

  // ------------------------------------------------------------
  // Test 24: Tenant and contact isolation
  // ------------------------------------------------------------
  it('24. Tenant and contact isolation: contact language operations are scoped by account_id', async () => {
    const db = createFakeDb({
      contacts: [
        { id: 'contact-tenant-A', account_id: 'acc-A', preferred_language: 'en' },
        { id: 'contact-tenant-B', account_id: 'acc-B', preferred_language: 'hinglish' },
      ],
    })

    // Tenant A queries Tenant B's contact -> returns null
    const crossLang = await getContactLanguage(db as any, 'acc-A', 'contact-tenant-B')
    expect(crossLang).toBeNull()

    // Tenant B queries own contact -> returns 'hinglish'
    const ownLang = await getContactLanguage(db as any, 'acc-B', 'contact-tenant-B')
    expect(ownLang).toBe('hinglish')
  })

  // ------------------------------------------------------------
  // Test 25: Section 5 — Selecting Find a Spare Part
  // ------------------------------------------------------------
  it('25. Section 5 — Selecting Find a Spare Part sends immediate localized instruction message', async () => {
    // Hinglish customer
    const dbHinglish = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })
    const resH = await handleWelcomeFlowInbound({
      db: dbHinglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Find a Spare Part',
      interactiveReplyId: WELCOME_CALLBACKS.MENU_FIND_PART,
    })
    expect(resH.consumed).toBe(true)
    expect(sentTexts.length).toBe(1)
    expect(sentTexts[0].text).toContain('Bilkul! Aap apni bike ka brand aur poora model batayein')
    expect(sentTexts[0].text).toContain('Bajaj Pulsar 150 – Clutch Plate')
    expect(sentTexts[0].text).toContain('Honda Shine – Brake Shoe')
    expect(sentTexts[0].text).toContain('Hero Splendor Plus – Chain Sprocket Kit')

    sentTexts.length = 0

    // English customer
    const dbEnglish = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'en' }],
    })
    const resE = await handleWelcomeFlowInbound({
      db: dbEnglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Find a Spare Part',
      interactiveReplyId: WELCOME_CALLBACKS.MENU_FIND_PART,
    })
    expect(resE.consumed).toBe(true)
    expect(sentTexts.length).toBe(1)
    expect(sentTexts[0].text).toContain('Sure! Please tell us your bike brand and complete model')
    expect(sentTexts[0].text).toContain('Bajaj Pulsar 150 – Clutch Plate')
    expect(sentTexts[0].text).toContain('Honda Shine – Brake Shoe')
    expect(sentTexts[0].text).toContain('Hero Splendor Plus – Chain Sprocket Kit')
  })

  // ------------------------------------------------------------
  // Test 26: Section 6 — Smart Product Search Clarifications
  // ------------------------------------------------------------
  it('26. Section 6 — Incomplete product queries and typos trigger localized clarifications', async () => {
    const dbHinglish = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    // "Pu" in Hinglish
    const resPuH = await handleWelcomeFlowInbound({
      db: dbHinglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Pu',
    })
    expect(resPuH.consumed).toBe(true)
    expect(sentTexts[sentTexts.length - 1].text).toContain('Bajaj Pulsar')

    // "G" in Hinglish
    const resGH = await handleWelcomeFlowInbound({
      db: dbHinglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'G',
    })
    expect(resGH.consumed).toBe(true)
    expect(sentTexts[sentTexts.length - 1].text).toContain('kaunsa spare part dhoondh rahe hain')

    // "Cluch plate" in Hinglish
    const resCluchH = await handleWelcomeFlowInbound({
      db: dbHinglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Cluch plate',
    })
    expect(resCluchH.consumed).toBe(true)
    expect(sentTexts[sentTexts.length - 1].text).toContain('Clutch Plate ki baat kar rahe hain')

    // "Price?" in Hinglish
    const resPriceH = await handleWelcomeFlowInbound({
      db: dbHinglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Price?',
    })
    expect(resPriceH.consumed).toBe(true)
    expect(sentTexts[sentTexts.length - 1].text).toContain('kis bike ke kaunse spare part ka price')

    // "Pu" in English
    const dbEnglish = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'en' }],
    })
    const resPuE = await handleWelcomeFlowInbound({
      db: dbEnglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Pu',
    })
    expect(resPuE.consumed).toBe(true)
    expect(sentTexts[sentTexts.length - 1].text).toContain('Are you looking for Bajaj Pulsar spare parts?')

    // "Cluch plate" in English
    const resCluchE = await handleWelcomeFlowInbound({
      db: dbEnglish as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Cluch plate',
    })
    expect(resCluchE.consumed).toBe(true)
    expect(sentTexts[sentTexts.length - 1].text).toContain('Are you looking for a clutch plate?')
  })

  // ------------------------------------------------------------
  // Test 27: Section 8 & 9 — Buy Now Callback & Natural Language
  // ------------------------------------------------------------
  it('27. Section 8 & 9 — Buy Now via callback and text sends Store Pickup & Delivery Assistance buttons', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    // Via BUY_NOW callback
    const res1 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Buy Now',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_NOW,
    })
    expect(res1.consumed).toBe(true)
    expect(sentButtons[sentButtons.length - 1].bodyText).toContain('store se pickup karna chahenge, home delivery chahiye ya online payment')
    expect(sentButtons[sentButtons.length - 1].buttons).toEqual([
      { id: 'BUY_PICKUP', title: 'Store Pickup' },
      { id: 'BUY_DELIVERY', title: 'Home Delivery' },
      { id: 'BUY_ONLINE_PAY', title: 'Online Payment' },
    ])

    // Via natural language text "kharidna hai"
    const res2 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'kharidna hai',
    })
    expect(res2.consumed).toBe(true)
    expect(sentButtons[sentButtons.length - 1].buttons[0].title).toBe('Store Pickup')
    expect(sentButtons[sentButtons.length - 1].buttons[2].title).toBe('Online Payment')
  })

  // ------------------------------------------------------------
  // Test 28: Section 8 & 10 — Just Exploring Flow
  // ------------------------------------------------------------
  it('28. Section 8 & 10 — Just Exploring sends polite acknowledgment with Find Another Part and Main Menu', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'just exploring',
    })
    expect(res.consumed).toBe(true)
    expect(sentButtons[sentButtons.length - 1].bodyText).toContain('Koi baat nahi! Aap araam se products dekh sakte hain')
    expect(sentButtons[sentButtons.length - 1].buttons).toEqual([
      { id: 'BUY_ANOTHER', title: 'Find Another Part' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ------------------------------------------------------------
  // Test 29: Section 11 — Yes/No Context Handling
  // ------------------------------------------------------------
  it('29. Section 11 — Yes/No context handling answers pending questions and bare Yes never confirms order/payment', async () => {
    // Context A: Store address prompt pending
    const dbStorePrompt = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      messages: [
        {
          id: 'msg-1',
          conversation_id: conversationId,
          sender_type: 'bot',
          content_text: 'Store timing: 09:00 AM – 09:00 PM. Kya aapko store address chahiye?',
          created_at: '2026-01-15T10:00:00Z',
        },
      ],
    })

    const resYesStore = await handleWelcomeFlowInbound({
      db: dbStorePrompt as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Haan',
    })
    expect(resYesStore.consumed).toBe(true)
    expect(sentButtons[sentButtons.length - 1].bodyText).toContain('Best Auto Parts')
    expect(sentButtons[sentButtons.length - 1].bodyText).toContain('Kailashpur, Saharanpur')

    // Context B: Bare Yes with no pending question
    const dbEmpty = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      messages: [],
    })
    const resBareYes = await handleWelcomeFlowInbound({
      db: dbEmpty as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Yes',
    })
    expect(resBareYes.consumed).toBe(true)
    // NEVER confirms order or payment!
    expect(sentButtons[sentButtons.length - 1].bodyText).not.toContain('confirmed')
    expect(sentButtons[sentButtons.length - 1].bodyText).not.toContain('payment')
    expect(sentButtons[sentButtons.length - 1].bodyText).toContain('Kripya batayein aap kis baare mein baat kar rahe hain?')
  })

  // ------------------------------------------------------------
  // Test 30: Section 12 — Missing tenant/user ID handling in tag creation
  // ------------------------------------------------------------
  it('30. Section 12 — setContactLanguage resolves user_id when not passed and avoids duplicate tags', async () => {
    const tagsState: any[] = []
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, user_id: 'resolved-user-id-999' }],
      tags: tagsState,
      contact_tags: [],
    })

    // Call setContactLanguage without userId
    await setContactLanguage(db as any, accountId, contactId, 'hinglish')

    // Verify tag was created with resolved user_id
    const { data: createdTags } = await (db as any).from('tags').select('*')
    expect(createdTags.length).toBe(1)
    expect(createdTags[0].name).toBe('Language: Hinglish')
    expect(createdTags[0].user_id).toBe('resolved-user-id-999')

    // Second call with same language does not create duplicate tag
    await setContactLanguage(db as any, accountId, contactId, 'hinglish')
    const { data: secondQuery } = await (db as any).from('tags').select('*')
    expect(secondQuery.length).toBe(1)
  })

  // ------------------------------------------------------------
  // Test 31: Online Payment Options & Same-phone link
  // ------------------------------------------------------------
  it('31. Online Payment menu: displays UPI ID and Scan QR choices with secure web checkout link', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      orders: [],
      payments: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Online Payment',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_ONLINE_PAY,
    })

    expect(res.consumed).toBe(true)
    const btnCall = sentButtons[sentButtons.length - 1]
    expect(btnCall.bodyText).toContain('Online Payment ke liye kripya apna tarika chuniye')
    expect(btnCall.bodyText).toContain('https://best-auto-parts-one.vercel.app/pay?order=')
    expect(btnCall.buttons).toEqual([
      { id: 'PAY_UPI_ID', title: 'UPI ID Payment' },
      { id: 'PAY_SCAN_QR', title: 'Scan QR Code' },
    ])
    expect(validateInteractivePayload({ kind: 'buttons', body: btnCall.bodyText, buttons: btnCall.buttons }).ok).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 32: Scan QR Code with 15-minute validity & pre-filled amount
  // ------------------------------------------------------------
  it('32. Scan QR Code: delivers Dynamic QR details with pre-filled ₹340 and 15-minute countdown', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      orders: [],
      payments: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Scan QR Code',
      interactiveReplyId: WELCOME_CALLBACKS.PAY_SCAN_QR,
    })

    expect(res.consumed).toBe(true)
    // Dynamic QR image dispatch verified via engineSendMedia
    expect(sentMedia.length).toBe(1)
    const mediaCall = sentMedia[0]
    expect(mediaCall.kind).toBe('image')
    expect(mediaCall.link).toContain('/api/payments/phonepe/qr/')
    expect(mediaCall.caption).toContain('Scan karke Pay karein: ₹340.00')
    expect(mediaCall.caption).toContain('15 minutes')
    expect(mediaCall.caption).toContain('Saud Bhai')
    // Guarantee stock privacy: no counts
    expect(mediaCall.caption).not.toMatch(/\b(in stock|remaining|units left)\b/i)

    // Interactive button alternatives sent for same-phone users
    const btnCall = sentButtons[sentButtons.length - 1]
    expect(btnCall.bodyText).toContain('Same-phone payment')
    expect(btnCall.buttons).toEqual([
      { id: 'PAY_UPI_ID', title: 'UPI ID Payment' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ------------------------------------------------------------
  // Test 33: UPI ID Payment Callback
  // ------------------------------------------------------------
  it('33. UPI ID Payment: provides 1-click checkout link and collect instructions in English for English user', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'en' }],
      orders: [],
      payments: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'UPI ID Payment',
      interactiveReplyId: WELCOME_CALLBACKS.PAY_UPI_ID,
    })

    expect(res.consumed).toBe(true)
    const txtCall = sentTexts[sentTexts.length - 1]
    expect(txtCall.text).toContain('UPI ID Payment — BestPay Instant Checkout')
    expect(txtCall.text).toContain('https://best-auto-parts-one.vercel.app/pay?order=')
    expect(txtCall.text).toContain('9761224004-2@ybl')
    expect(txtCall.text).toContain('₹340.00')
    expect(txtCall.text).toContain('PhonePe, Google Pay, Paytm, and BHIM')
    expect(txtCall.text).not.toContain('okhdfcbank')
  })

  // ------------------------------------------------------------
  // Test 34: Customer sends VPA for UPI collect
  // ------------------------------------------------------------
  it('34. Customer typing UPI ID: triggers collect request confirmation', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      orders: [],
      payments: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'nabeelkhan@okhdfcbank',
    })

    expect(res.consumed).toBe(true)
    const txtCall = sentTexts[sentTexts.length - 1]
    expect(txtCall.text).toContain('nabeelkhan@okhdfcbank')
    expect(txtCall.text).toContain('₹340.00')
    expect(txtCall.text).toContain('15 minutes')
  })

  it('34b. Preserves exact catalog quoted price through Buy Now -> Online Payment -> UPI ID Payment', async () => {
    const customConvId = 'conv-pricing-preservation'
    const customContactId = 'contact-pricing-test'
    const db = createFakeDb({
      contacts: [{ id: customContactId, account_id: accountId, name: 'Aslam Bhai', phone: '+919634722174', preferred_language: 'en' }],
      parts_catalog: [
        {
          id: 'part-pulsar-150-clutch-340',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: 340,
          quantity_in_stock: 15,
          is_active: true,
          fitments: [
            {
              id: 'fit-pulsar-150-340',
              account_id: accountId,
              part_id: 'part-pulsar-150-clutch-340',
              vehicle_type: 'Motorcycle',
              manufacturer: 'Bajaj',
              model: 'Pulsar 150',
              year_from: 2010,
              year_to: 2023,
              engine: '150cc DTS-i',
              fuel_type: 'Petrol',
              notes: 'Fits all Pulsar 150',
            },
          ],
        },
      ],
      vehicle_fitment: [],
      orders: [],
      payments: [],
    })

    // 1. Inquiry: search and quote product at ₹340
    const inqRes = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: customConvId,
      contactId: customContactId,
      inboundText: 'Bajaj Pulsar 150 clutch plate',
    })
    expect(inqRes.consumed).toBe(true)
    expect(inqRes.responseSent).toContain('₹340.00')

    // 2. Buy Now action
    const buyRes = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: customConvId,
      contactId: customContactId,
      inboundText: 'Buy Now',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_NOW,
    })
    expect(buyRes.consumed).toBe(true)

    // 3. Online Payment action
    const onlinePayRes = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: customConvId,
      contactId: customContactId,
      inboundText: 'Online Payment',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_ONLINE_PAY,
    })
    expect(onlinePayRes.consumed).toBe(true)
    expect(onlinePayRes.responseSent).toContain('amount=340')
    expect(onlinePayRes.responseSent).not.toContain('amount=690')

    // 4. UPI ID Payment action
    const upiRes = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: customConvId,
      contactId: customContactId,
      inboundText: 'UPI ID Payment',
      interactiveReplyId: WELCOME_CALLBACKS.PAY_UPI_ID,
    })
    expect(upiRes.consumed).toBe(true)
    const txtCall = sentTexts[sentTexts.length - 1]
    expect(txtCall.text).toContain('₹340.00')
    expect(txtCall.text).not.toContain('₹690')
    expect(txtCall.text).toContain('9761224004-2@ybl')
  })

  // ------------------------------------------------------------
  // Test 35: Customer Payment Claim ("I have paid") never marks paid
  // ------------------------------------------------------------
  it('35. Customer payment claim: never marks paid, responds that gateway verifies automatically', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
      orders: [{ id: 'order-claim', account_id: accountId, order_status: 'pending_payment' }],
      payments: [{ id: 'pay-claim', account_id: accountId, payment_status: 'pending' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'Maine pay kar diya hai',
    })

    expect(res.consumed).toBe(true)
    const txtCall = sentTexts[sentTexts.length - 1]
    expect(txtCall.text).toContain('Ham aapka payment PhonePe gateway ke saath verify kar rahe hain')
    // Order in DB MUST still be pending!
    const { data: orders } = await (db as any).from('orders').select('*')
    expect(orders[0].order_status).toBe('pending_payment')
  })

  // ------------------------------------------------------------
  // Test 36: Typed Language Selection (Hinglish, hindi, 2, English, 1)
  // ------------------------------------------------------------
  it('36. Typed language selection: supports Hinglish, hindi, 2, English, 1', async () => {
    // 36a: Typed "Hinglish"
    const db1 = createFakeDb({
      contacts: [{ id: 'c-typed-1', account_id: accountId, preferred_language: null }],
    })
    const res1 = await handleWelcomeFlowInbound({
      db: db1 as any,
      accountId,
      userId,
      conversationId: 'conv-1',
      contactId: 'c-typed-1',
      inboundText: 'Hinglish',
    })
    expect(res1.consumed).toBe(true)
    expect(res1.responseSent).toContain('Welcome to *Best Auto Parts*!')
    expect(await getContactLanguage(db1 as any, accountId, 'c-typed-1')).toBe('hinglish')

    // 36b: Typed "hindi"
    const db2 = createFakeDb({
      contacts: [{ id: 'c-typed-2', account_id: accountId, preferred_language: null }],
    })
    const res2 = await handleWelcomeFlowInbound({
      db: db2 as any,
      accountId,
      userId,
      conversationId: 'conv-2',
      contactId: 'c-typed-2',
      inboundText: 'hindi',
    })
    expect(res2.consumed).toBe(true)
    expect(res2.responseSent).toContain('Welcome to *Best Auto Parts*!')
    expect(await getContactLanguage(db2 as any, accountId, 'c-typed-2')).toBe('hinglish')

    // 36c: Typed "2"
    const db3 = createFakeDb({
      contacts: [{ id: 'c-typed-3', account_id: accountId, preferred_language: null }],
    })
    const res3 = await handleWelcomeFlowInbound({
      db: db3 as any,
      accountId,
      userId,
      conversationId: 'conv-3',
      contactId: 'c-typed-3',
      inboundText: '2',
    })
    expect(res3.consumed).toBe(true)
    expect(res3.responseSent).toContain('Welcome to *Best Auto Parts*!')
    expect(await getContactLanguage(db3 as any, accountId, 'c-typed-3')).toBe('hinglish')

    // 36d: Typed "English"
    const db4 = createFakeDb({
      contacts: [{ id: 'c-typed-4', account_id: accountId, preferred_language: null }],
    })
    const res4 = await handleWelcomeFlowInbound({
      db: db4 as any,
      accountId,
      userId,
      conversationId: 'conv-4',
      contactId: 'c-typed-4',
      inboundText: 'English',
    })
    expect(res4.consumed).toBe(true)
    expect(res4.responseSent).toContain('Welcome to *Best Auto Parts*!')
    expect(await getContactLanguage(db4 as any, accountId, 'c-typed-4')).toBe('en')

    // 36e: Typed "1"
    const db5 = createFakeDb({
      contacts: [{ id: 'c-typed-5', account_id: accountId, preferred_language: null }],
    })
    const res5 = await handleWelcomeFlowInbound({
      db: db5 as any,
      accountId,
      userId,
      conversationId: 'conv-5',
      contactId: 'c-typed-5',
      inboundText: '1',
    })
    expect(res5.consumed).toBe(true)
    expect(res5.responseSent).toContain('Welcome to *Best Auto Parts*!')
    expect(await getContactLanguage(db5 as any, accountId, 'c-typed-5')).toBe('en')
  })

  // ------------------------------------------------------------
  // Test 37: Language retention across turns in unmigrated environment
  // ------------------------------------------------------------
  it('37. Language retention: preserves Hinglish preference without preferred_language column', async () => {
    // DB without preferred_language column (migration 061 not run)
    const db = createFakeDb({
      contacts: [{ id: 'c-unmigrated', account_id: accountId }],
      tags: [],
      contact_tags: [],
    })

    // Customer selects Hinglish
    await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-unmigrated',
      contactId: 'c-unmigrated',
      inboundText: '',
      interactiveReplyId: WELCOME_CALLBACKS.LANG_HINGLISH,
    })

    // Simulate server restart / cache expiry / new serverless instance
    clearContactLanguageCache()

    // Turn 2: Customer greets again
    const resTurn2 = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-unmigrated',
      contactId: 'c-unmigrated',
      inboundText: 'Hi',
    })

    expect(resTurn2.consumed).toBe(true)
    expect(resTurn2.responseSent).toContain('Welcome back')
  })

  // ------------------------------------------------------------
  // Test 38-44: Product Search across all 7 variations (Known Issue 2)
  // ------------------------------------------------------------
  const samplePulsarClutchPart = {
    id: 'part-pulsar-150-clutch',
    account_id: accountId,
    part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
    brand: 'Bajaj',
    selling_price: 690,
    quantity_in_stock: 15,
    is_active: true,
    fitments: [
      {
        id: 'fit-pulsar-150',
        account_id: accountId,
        part_id: 'part-pulsar-150-clutch',
        vehicle_type: 'Motorcycle',
        manufacturer: 'Bajaj',
        model: 'Pulsar 150',
        year_from: 2010,
        year_to: 2023,
        engine: '150cc DTS-i',
        fuel_type: 'Petrol',
        notes: 'Fits all Pulsar 150 UG3, UG4, BS4, BS6',
      },
    ],
  }

  it('38. Product Search Variation 1: "Bajaj Pulsar 150 – Clutch Plate" (with en dash) in Hinglish', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-1', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-1',
      contactId: 'c-search-1',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    expect(sentButtons.length).toBe(1)
    const call = sentButtons[0]
    expect(call.bodyText).toContain('Bajaj Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('Shop par available hai (In Stock)')
    expect(call.bodyText).toContain('₹690.00')
    expect(call.bodyText).toContain('Bajaj Pulsar 150 (2010 - 2023) • 150cc DTS-i Petrol (Fits all Pulsar 150 UG3, UG4, BS4, BS6)')
    expect(call.bodyText).not.toMatch(/\b(15|10|5)\s*(units|pieces|in stock)\b/i) // Stock privacy
    expect(call.buttons).toEqual([
      { id: 'BUY_NOW', title: 'Kharidna Hai' },
      { id: 'BUY_EXPLORING', title: 'Abhi Dekh Raha Hoon' },
    ])
  })

  it('39. Product Search Variation 2: "Bajaj Pulsar 150 - Clutch Plate" (with hyphen) in Hinglish', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-2', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-2',
      contactId: 'c-search-2',
      inboundText: 'Bajaj Pulsar 150 - Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Bajaj Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('₹690.00')
    expect(call.buttons).toEqual([
      { id: 'BUY_NOW', title: 'Kharidna Hai' },
      { id: 'BUY_EXPLORING', title: 'Abhi Dekh Raha Hoon' },
    ])
  })

  it('40. Product Search Variation 3: "Bajaj Pulsar 150 clutch plate" in Hinglish', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-3', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-3',
      contactId: 'c-search-3',
      inboundText: 'Bajaj Pulsar 150 clutch plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Bajaj Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('₹690.00')
  })

  it('41. Product Search Variation 4: "Pulsar 150 clutch plate" in Hinglish', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-4', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-4',
      contactId: 'c-search-4',
      inboundText: 'Pulsar 150 clutch plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('₹690.00')
  })

  it('42. Product Search Variation 5: "Pulsar 150 ki clutch plate chahiye" in Hinglish', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-5', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-5',
      contactId: 'c-search-5',
      inboundText: 'Pulsar 150 ki clutch plate chahiye',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('₹690.00')
  })

  it('43. Product Search Variation 6: "Bajaj Pulsar 150 ka clutch plate" in Hinglish', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-6', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-6',
      contactId: 'c-search-6',
      inboundText: 'Bajaj Pulsar 150 ka clutch plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Bajaj Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('₹690.00')
  })

  it('44. Product Search Variation 7: "Clutch plate for Pulsar 150" in English', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-7', account_id: accountId, preferred_language: 'en' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-7',
      contactId: 'c-search-7',
      inboundText: 'Clutch plate for Pulsar 150',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Pulsar 150 Clutch Plate Set')
    expect(call.bodyText).toContain('In Stock (Available at shop)')
    expect(call.bodyText).toContain('₹690.00')
    expect(call.buttons).toEqual([
      { id: 'BUY_NOW', title: 'Buy Now' },
      { id: 'BUY_EXPLORING', title: 'Just Exploring' },
    ])
  })

  // ------------------------------------------------------------
  // Test 45: Product search -> Click BUY_NOW -> Shows Store Pickup, Home Delivery, Online Payment
  // ------------------------------------------------------------
  it('45. End-to-end: Product search -> BUY_NOW -> Online Payment -> PhonePe choices', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-e2e', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [samplePulsarClutchPart],
      vehicle_fitment: [],
    })

    // Step 1: Customer searches for part
    const resSearch = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-e2e',
      contactId: 'c-e2e',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })
    expect(resSearch.consumed).toBe(true)

    // Step 2: Customer taps BUY_NOW (Kharidna Hai)
    const resBuy = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-e2e',
      contactId: 'c-e2e',
      inboundText: '',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_NOW,
    })
    expect(resBuy.consumed).toBe(true)
    const buyCall = sentButtons[sentButtons.length - 1]
    expect(buyCall.buttons).toEqual([
      { id: 'BUY_PICKUP', title: 'Store Pickup' },
      { id: 'BUY_DELIVERY', title: 'Home Delivery' },
      { id: 'BUY_ONLINE_PAY', title: 'Online Payment' },
    ])

    // Step 3: Customer taps Online Payment
    const resPay = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-e2e',
      contactId: 'c-e2e',
      inboundText: '',
      interactiveReplyId: WELCOME_CALLBACKS.BUY_ONLINE_PAY,
    })
    expect(resPay.consumed).toBe(true)
    const payCall = sentButtons[sentButtons.length - 1]
    expect(payCall.buttons).toEqual([
      { id: 'PAY_UPI_ID', title: 'UPI ID Payment' },
      { id: 'PAY_SCAN_QR', title: 'Scan QR Code' },
    ])
  })

  // ------------------------------------------------------------
  // Test 46: Database selling_price is used dynamically (not hardcoded)
  // ------------------------------------------------------------
  it('46. Database price dynamics: retrieves selling_price from DB record and not hardcoded', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-price-dyn', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-dyn-price',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: 725.5,
          quantity_in_stock: 12,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-price-dyn',
      contactId: 'c-price-dyn',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('₹725.50')
    expect(call.bodyText).not.toContain('₹690')
  })

  // ------------------------------------------------------------
  // Test 47: Distinct products are not conflated
  // ------------------------------------------------------------
  it('47. Distinct product isolation: Honda Shine brake shoe is not treated as Pulsar clutch plate', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-distinct-prod', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-shine-brake',
          account_id: accountId,
          part_name: 'CB Shine Brake Shoe Set',
          brand: 'Honda',
          selling_price: 320,
          quantity_in_stock: 8,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-distinct-prod',
      contactId: 'c-distinct-prod',
      inboundText: 'Honda Shine – Brake Shoe',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Honda CB Shine Brake Shoe Set')
    expect(call.bodyText).toContain('₹320.00')
    expect(call.bodyText).not.toContain('Pulsar')
    expect(call.bodyText).not.toContain('Clutch Plate')
  })

  // ------------------------------------------------------------
  // Test 48: Null selling_price shows localized unavailable message
  // ------------------------------------------------------------
  it('48. Price Integrity: null selling_price shows localized price-unavailable message and NO fabricated amount', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-price-null', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-null-price',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: null,
          quantity_in_stock: 5,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-price-null',
      contactId: 'c-price-null',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Counter / inquiry par verify karein (Team will confirm latest rate)')
    expect(call.bodyText).not.toContain('₹')
    expect(call.bodyText).not.toContain('690')
  })

  // ------------------------------------------------------------
  // Test 49: Zero selling_price shows localized unavailable message
  // ------------------------------------------------------------
  it('49. Price Integrity: zero selling_price (0.00) shows localized unavailable message and does not display ₹0.00', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-price-zero', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-zero-price',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: 0,
          quantity_in_stock: 5,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-price-zero',
      contactId: 'c-price-zero',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Counter / inquiry par verify karein (Team will confirm latest rate)')
    expect(call.bodyText).not.toContain('₹0.00')
    expect(call.bodyText).not.toContain('690')
  })

  // ------------------------------------------------------------
  // Test 50: Missing/undefined selling_price in English shows English unavailable message
  // ------------------------------------------------------------
  it('50. Price Integrity: undefined selling_price in English shows English unavailable message', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-price-undef', account_id: accountId, preferred_language: 'en' }],
      parts_catalog: [
        {
          id: 'p-undef-price',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: undefined,
          quantity_in_stock: 5,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-price-undef',
      contactId: 'c-price-undef',
      inboundText: 'Clutch plate for Pulsar 150',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Available on inquiry with store team')
    expect(call.bodyText).not.toContain('₹')
    expect(call.bodyText).not.toContain('690')
  })

  // ------------------------------------------------------------
  // Test 51: Negative / NaN price is rejected safely
  // ------------------------------------------------------------
  it('51. Price Integrity: negative / NaN price is safely handled as unavailable', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-price-nan', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-nan-price',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: -50,
          quantity_in_stock: 5,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-price-nan',
      contactId: 'c-price-nan',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Counter / inquiry par verify karein')
    expect(call.bodyText).not.toContain('₹-50')
  })

  // ------------------------------------------------------------
  // Test 52: Part not found in database catalog does NOT fabricate fallback
  // ------------------------------------------------------------
  it('52. Catalog Fidelity: unknown part does not fabricate mock response, offers human assistance', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-not-found', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [], // Completely empty catalog
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-not-found',
      contactId: 'c-not-found',
      inboundText: 'Pulsar 150 clutch plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('filhaal catalog mein verify nahi ho paya')
    expect(call.bodyText).toContain('Saud Bhai')
    expect(call.bodyText).not.toContain('690')
    expect(call.buttons).toEqual([
      { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ------------------------------------------------------------
  // Test 53: Missing fitment records does not claim universal compatibility
  // ------------------------------------------------------------
  it('53. Fitment Integrity: missing fitment records expresses uncertainty rather than universal compatibility', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-fit-missing', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-no-fit',
          account_id: accountId,
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: 690,
          quantity_in_stock: 10,
          is_active: true,
          fitments: [], // No fitments linked
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-fit-missing',
      contactId: 'c-fit-missing',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('Model & year verification recommended at store counter')
    expect(call.bodyText).not.toContain('universal')
  })

  // ------------------------------------------------------------
  // Test 54: Tenant isolation: parts from another account are never returned
  // ------------------------------------------------------------
  it('54. Tenant Isolation: part belonging to other account is never returned', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-tenant-iso', account_id: accountId, preferred_language: 'hinglish' }],
      parts_catalog: [
        {
          id: 'p-other-tenant',
          account_id: 'other-acc-999', // Different account
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs)',
          brand: 'Bajaj',
          selling_price: 690,
          quantity_in_stock: 10,
          is_active: true,
        },
      ],
      vehicle_fitment: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-tenant-iso',
      contactId: 'c-tenant-iso',
      inboundText: 'Bajaj Pulsar 150 – Clutch Plate',
    })

    expect(res.consumed).toBe(true)
    const call = sentButtons[sentButtons.length - 1]
    expect(call.bodyText).toContain('filhaal catalog mein verify nahi ho paya')
    expect(call.buttons).toEqual([
      { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
      { id: 'BACK_TO_MENU', title: 'Main Menu' },
    ])
  })

  // ============================================================
  // PHASE 3 — CUSTOMER LANGUAGE SWITCH & SECOND NUMBER RECOVERY
  // ============================================================

  // Test 55: English -> Hinglish switch
  it('55. Language Switch: English to Hinglish callback updates persistence and sends Hinglish menu', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-lang-sw-1', account_id: accountId, preferred_language: 'en' }],
      conversations: [{ id: 'conv-lang-sw-1', account_id: accountId }],
      tags: [{ id: 'tag-en-1', account_id: accountId, name: 'Language: English' }],
      contact_tags: [{ id: 'ct-1', contact_id: 'c-lang-sw-1', tag_id: 'tag-en-1' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-lang-sw-1',
      contactId: 'c-lang-sw-1',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })

    expect(res.consumed).toBe(true)
    expect(res.responseSent).toContain('Aapki bhasha Hinglish mein switch ho gayi hai!')
    const saved = await getContactLanguage(db as any, accountId, 'c-lang-sw-1')
    expect(saved).toBe('hinglish')

    expect(sentLists.length).toBe(1)
    const list = sentLists[0]
    expect(list.bodyText).toContain('Aapko kis cheez mein madad chahiye?')
    expect(list.sections[1].rows[0].id).toBe(WELCOME_CALLBACKS.SWITCH_TO_ENGLISH)
  })

  // Test 56: Hinglish -> English switch
  it('56. Language Switch: Hinglish to English callback updates persistence and sends English menu', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-lang-sw-2', account_id: accountId, preferred_language: 'hinglish' }],
      conversations: [{ id: 'conv-lang-sw-2', account_id: accountId }],
      tags: [{ id: 'tag-hi-2', account_id: accountId, name: 'Language: Hinglish' }],
      contact_tags: [{ id: 'ct-2', contact_id: 'c-lang-sw-2', tag_id: 'tag-hi-2' }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-lang-sw-2',
      contactId: 'c-lang-sw-2',
      inboundText: 'Switch to English',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_ENGLISH,
    })

    expect(res.consumed).toBe(true)
    expect(res.responseSent).toContain('Your language has been switched to English!')
    const saved = await getContactLanguage(db as any, accountId, 'c-lang-sw-2')
    expect(saved).toBe('en')

    expect(sentLists.length).toBe(1)
    const list = sentLists[0]
    expect(list.bodyText).toContain('How can we help you?')
    expect(list.sections[1].rows[0].id).toBe(WELCOME_CALLBACKS.SWITCH_TO_HINGLISH)
  })

  // Test 57: Accidental English selection followed by Hinglish switch
  it('57. Language Switch: Accidental English selection followed by Hinglish switch immediately corrects language', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-lang-accidental', account_id: accountId, preferred_language: null }],
      conversations: [{ id: 'conv-lang-accidental', account_id: accountId }],
      tags: [],
      contact_tags: [],
    })

    // 1. Accidental selection of English
    const firstOutcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-lang-accidental',
      contactId: 'c-lang-accidental',
      inboundText: 'English',
      interactiveReplyId: WELCOME_CALLBACKS.LANG_ENGLISH,
    })
    expect(firstOutcome.consumed).toBe(true)
    let currentLang = await getContactLanguage(db as any, accountId, 'c-lang-accidental')
    expect(currentLang).toBe('en')

    // 2. Customer immediately corrects by tapping Switch to Hinglish
    const switchOutcome = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-lang-accidental',
      contactId: 'c-lang-accidental',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })
    expect(switchOutcome.consumed).toBe(true)
    currentLang = await getContactLanguage(db as any, accountId, 'c-lang-accidental')
    expect(currentLang).toBe('hinglish')
  })

  // Test 58: Switch during product search
  it('58. Language Switch: natural language "switch to hinglish" works during search', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-search-switch', account_id: accountId, preferred_language: 'en' }],
      conversations: [{ id: 'conv-search-switch', account_id: accountId }],
      tags: [],
      contact_tags: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-search-switch',
      contactId: 'c-search-switch',
      inboundText: 'switch to hinglish',
    })

    expect(res.consumed).toBe(true)
    const saved = await getContactLanguage(db as any, accountId, 'c-search-switch')
    expect(saved).toBe('hinglish')
  })

  // Test 59: Switch during purchase journey
  it('59. Language Switch: natural language "switch to english" works during purchase flow', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-buy-switch', account_id: accountId, preferred_language: 'hinglish' }],
      conversations: [{ id: 'conv-buy-switch', account_id: accountId }],
      tags: [],
      contact_tags: [],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-buy-switch',
      contactId: 'c-buy-switch',
      inboundText: 'switch to english',
    })

    expect(res.consumed).toBe(true)
    const saved = await getContactLanguage(db as any, accountId, 'c-buy-switch')
    expect(saved).toBe('en')
  })

  // Test 60: Persistence after cache clearing
  it('60. Language Persistence: survives cache clearing without losing customer preference', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-cache-evict', account_id: accountId, preferred_language: null }],
      conversations: [{ id: 'conv-cache-evict', account_id: accountId }],
      tags: [],
      contact_tags: [],
    })

    // Switch to hinglish
    await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-cache-evict',
      contactId: 'c-cache-evict',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })

    // Evict in-memory cache
    clearContactLanguageCache()

    // Must be retrieved accurately from database tags
    const retrieved = await getContactLanguage(db as any, accountId, 'c-cache-evict')
    expect(retrieved).toBe('hinglish')
  })

  // Test 61: Persistence across independent instances
  it('61. Language Persistence: recovered on separate serverless instance', async () => {
    const tables: any = {
      contacts: [{ id: 'c-serverless', account_id: accountId, preferred_language: null }],
      conversations: [{ id: 'conv-serverless', account_id: accountId }],
      tags: [],
      contact_tags: [],
    }
    const dbInstance1 = createFakeDb(tables)

    await handleWelcomeFlowInbound({
      db: dbInstance1 as any,
      accountId,
      userId,
      conversationId: 'conv-serverless',
      contactId: 'c-serverless',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })

    // Instance 2 with fresh in-memory state but shared database records
    clearContactLanguageCache()
    const dbInstance2 = createFakeDb(tables)

    const retrievedOnInstance2 = await getContactLanguage(dbInstance2 as any, accountId, 'c-serverless')
    expect(retrievedOnInstance2).toBe('hinglish')
  })

  // Test 62: Invalid or unauthorized callback
  it('62. Security: invalid or unauthorized callback does not corrupt language or flow state', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-unauth', account_id: accountId, preferred_language: 'en' }],
      conversations: [{ id: 'conv-unauth', account_id: accountId }],
    })

    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-unauth',
      contactId: 'c-unauth',
      inboundText: 'random query',
      interactiveReplyId: 'UNAUTHORIZED_CALLBACK_ID',
    })

    expect(res.consumed).toBe(false)
    const saved = await getContactLanguage(db as any, accountId, 'c-unauth')
    expect(saved).toBe('en')
  })

  // Test 63: Database failure resilience
  it('63. Database failure resilience: db error during tag update handles safely', async () => {
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockRejectedValue(new Error('DB Connection Timeout')),
            })),
          })),
        })),
        insert: vi.fn().mockRejectedValue(new Error('DB Insert Failure')),
        update: vi.fn().mockRejectedValue(new Error('DB Update Failure')),
      })),
    }

    // Should not throw an unhandled exception
    await expect(setContactLanguage(db as any, accountId, 'c-fail', 'hinglish', userId)).resolves.not.toThrow()
  })

  // Test 64: Repeated callback idempotency
  it('64. Idempotency: repeated switch callbacks do not create duplicate tags', async () => {
    const tables: any = {
      contacts: [{ id: 'c-idempotent', account_id: accountId, preferred_language: 'en' }],
      conversations: [{ id: 'conv-idempotent', account_id: accountId }],
      tags: [],
      contact_tags: [],
    }
    const db = createFakeDb(tables)

    // First switch
    await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-idempotent',
      contactId: 'c-idempotent',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })

    // Repeated switch
    await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-idempotent',
      contactId: 'c-idempotent',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })

    const hinglishTags = tables.tags.filter((t: any) => t.name === 'Language: Hinglish')
    expect(hinglishTags.length).toBe(1)
  })

  // Test 65: Tenant isolation
  it('65. Tenant Isolation: switching language in Tenant A does not alter Tenant B contacts', async () => {
    const db = createFakeDb({
      contacts: [
        { id: 'c-tenant-a', account_id: 'acc-tenant-a', preferred_language: 'en' },
        { id: 'c-tenant-b', account_id: 'acc-tenant-b', preferred_language: 'en' },
      ],
      conversations: [
        { id: 'conv-tenant-a', account_id: 'acc-tenant-a' },
        { id: 'conv-tenant-b', account_id: 'acc-tenant-b' },
      ],
      tags: [],
      contact_tags: [],
    })

    await handleWelcomeFlowInbound({
      db: db as any,
      accountId: 'acc-tenant-a',
      userId,
      conversationId: 'conv-tenant-a',
      contactId: 'c-tenant-a',
      inboundText: 'Switch to Hinglish',
      interactiveReplyId: WELCOME_CALLBACKS.SWITCH_TO_HINGLISH,
    })

    const langA = await getContactLanguage(db as any, 'acc-tenant-a', 'c-tenant-a')
    const langB = await getContactLanguage(db as any, 'acc-tenant-b', 'c-tenant-b')
    expect(langA).toBe('hinglish')
    expect(langB).toBe('en') // Completely untouched
  })

  // Test 66: Existing six-option menu remains intact
  it('66. Main Menu Integrity: Section 0 has exactly 6 business options, Section 1 has language switch', async () => {
    const db = createFakeDb({
      contacts: [{ id: 'c-menu-intact', account_id: accountId, preferred_language: 'en' }],
      conversations: [{ id: 'conv-menu-intact', account_id: accountId }],
    })

    await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-menu-intact',
      contactId: 'c-menu-intact',
      inboundText: 'Hi',
    })

    expect(sentLists.length).toBe(1)
    const list = sentLists[0]
    expect(list.sections.length).toBe(2)
    expect(list.sections[0].rows.length).toBe(6)
    expect(list.sections[0].rows.map((r: any) => r.id)).toEqual([
      WELCOME_CALLBACKS.MENU_FIND_PART,
      WELCOME_CALLBACKS.MENU_PRODUCT_PRICE,
      WELCOME_CALLBACKS.MENU_SEARCH_BIKE,
      WELCOME_CALLBACKS.MENU_ORDER_DELIVERY,
      WELCOME_CALLBACKS.MENU_SHOP_LOCATION,
      WELCOME_CALLBACKS.MENU_TALK_HUMAN,
    ])
    expect(list.sections[1].rows.length).toBe(1)
    expect(list.sections[1].rows[0].id).toBe(WELCOME_CALLBACKS.SWITCH_TO_HINGLISH)

    // Verify Meta Cloud API limits compliance
    const valid = validateInteractivePayload({
      kind: 'list',
      header: list.headerText,
      body: list.bodyText,
      footer: list.footerText,
      button_label: list.buttonLabel,
      sections: list.sections,
    })
    expect(valid.ok).toBe(true)
  })

  // Test 67: Second number handoff recovery
  it('67. Second Number Handoff Auto-Reset: conversation locked in human handoff resumes bot on greeting', async () => {
    const tables: any = {
      contacts: [{ id: 'c-saud-khan', account_id: accountId, preferred_language: 'hinglish', phone: '919634224004' }],
      conversations: [
        {
          id: 'conv-saud-khan',
          account_id: accountId,
          contact_id: 'c-saud-khan',
          status: 'open',
          ai_autoreply_disabled: true,
          assigned_agent_id: 'agent-human-123',
          ai_handoff_summary: 'Customer requested human support from WhatsApp menu',
        },
      ],
      tags: [{ id: 'tag-hi-saud', account_id: accountId, name: 'Language: Hinglish' }],
      contact_tags: [{ id: 'ct-saud', contact_id: 'c-saud-khan', tag_id: 'tag-hi-saud' }],
    }
    const db = createFakeDb(tables)

    // Inbound "Hi" from previously locked contact
    const res = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId: 'conv-saud-khan',
      contactId: 'c-saud-khan',
      inboundText: 'Hi',
    })

    expect(res.consumed).toBe(true)
    // Verify conversation row was unblocked in DB
    const convRow = tables.conversations.find((c: any) => c.id === 'conv-saud-khan')
    expect(convRow.ai_autoreply_disabled).toBe(false)
    expect(convRow.assigned_agent_id).toBeNull()
    expect(convRow.ai_handoff_summary).toBeNull()

    // Verify returning customer greeting and main menu were sent
    expect(sentLists.length).toBe(1)
    expect(sentLists[0].bodyText).toContain('Welcome back')
    expect(sentLists[0].bodyText).toContain('Bajaj, Hero, or Honda')
  })

  // Test 68: Gratitude acknowledgment
  it('68. Gratitude acknowledgment: warms customers and never triggers fallback on thanks/shukriya/ok', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    const resOk = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'shukriya',
    })

    expect(resOk.consumed).toBe(true)
    expect(sentTexts.length).toBe(1)
    expect(sentTexts[0].text).toContain('Shukriya ji!')
    expect(sentTexts[0].text).toContain('Bajaj, Hero ya Honda')
  })

  // Test 69: Unsupported vehicle brand refusal
  it('69. Unsupported brand refusal: polite standard refusal for TVS, Yamaha, Royal Enfield or car inquiries', async () => {
    const db = createFakeDb({
      contacts: [{ id: contactId, account_id: accountId, preferred_language: 'hinglish' }],
    })

    const resTvs = await handleWelcomeFlowInbound({
      db: db as any,
      accountId,
      userId,
      conversationId,
      contactId,
      inboundText: 'TVS Apache brake shoe chahiye',
    })

    expect(resTvs.consumed).toBe(true)
    expect(sentTexts.length).toBe(1)
    expect(sentTexts[0].text).toContain('exclusively in *Bajaj, Hero, and Honda*')
  })
})
