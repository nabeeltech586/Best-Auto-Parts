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
    sentButtons.length = 0
    sentLists.length = 0
    sentTexts.length = 0
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
    expect(list.bodyText).toContain('You have selected English')
    expect(list.bodyText).toContain('Please choose an option from the menu below to get started:')
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
    expect(list.bodyText).toContain('Aapne Hinglish select kiya hai')
    expect(list.bodyText).toContain('Kripya shuru karne ke liye niche diye gaye menu se ek option chunein:')

    // Crucial rule: Button titles must remain in English
    const rowTitles = list.sections[0].rows.map((r: any) => r.title)
    expect(rowTitles).toContain('Find a Spare Part')
    expect(rowTitles).toContain('Product Info & Price')
    expect(rowTitles).toContain('Search by Bike Model')
    expect(rowTitles).toContain('Order & Delivery')
    expect(rowTitles).toContain('Shop Location & Timing')
    expect(rowTitles).toContain('Talk to Human')

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
    expect(sentLists[0].bodyText).toContain('Best Auto Parts mein aapka phir se swagat hai! 😊')
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
    expect(btnCall.bodyText).toContain('Bahut badhiya! 😊 Aapki pasand ke liye dhanyavaad!')
    expect(btnCall.buttons).toEqual([
      { id: 'BUY_PICKUP', title: 'Store Pickup' },
      { id: 'BUY_DELIVERY', title: 'Delivery Assistance' },
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
    expect(btnCall.bodyText).toContain('09:00 AM – 08:00 PM')
    expect(btnCall.bodyText).toContain('Juma Namaz Break: 12:30 PM – 02:30 PM')
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
    expect(sentLists[0].headerText).toBe('Best Auto Parts')
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
    expect(btnCall.bodyText).toContain('Koi baat nahi! 😊 Aap araam se products explore kijiye.')
    expect(btnCall.buttons).toEqual([
      { id: 'BUY_DETAILS', title: 'Product Details' },
      { id: 'BUY_ANOTHER', title: 'Find Another Part' },
      { id: 'MENU_TALK_HUMAN', title: 'Talk to Human' },
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
    expect(sentButtons[2].bodyText).toContain('09:00 AM – 08:00 PM')
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
    expect(verifyDeliveryArea('110001').status).toBe('available')
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
      'Bahut badhiya! 😊 Store timing: 09:00 AM – 08:00 PM (Friday Juma break: 12:30 PM – 02:30 PM).',
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
})
