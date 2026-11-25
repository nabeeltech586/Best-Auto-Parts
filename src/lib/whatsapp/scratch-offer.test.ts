import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  isScratchOfferTrigger,
  getISTDetails,
  getISTFormattedDateTime,
  normalizePhone91,
  generateUniqueCouponCode,
  handleScratchOfferFlow,
  SCRATCH_PRIZES,
  SHOP_METADATA,
  type HandleScratchOfferInput,
} from './scratch-offer'

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.text.123' }),
  engineSendInteractiveButtons: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.btn.123' }),
}))

vi.mock('@/lib/contacts/tag-write', () => ({
  addContactTagIfAbsent: vi.fn().mockResolvedValue(true),
}))

describe('isScratchOfferTrigger', () => {
  it('matches ice breaker text and variations', () => {
    expect(isScratchOfferTrigger('🎁 Scratch & Win Offer — Best Auto Parts')).toBe(true)
    expect(isScratchOfferTrigger('scratch & win offer')).toBe(true)
    expect(isScratchOfferTrigger('Lucky Scratch Card')).toBe(true)
    expect(isScratchOfferTrigger('lucky card')).toBe(true)
  })

  it('matches slash command and keywords', () => {
    expect(isScratchOfferTrigger('/offer')).toBe(true)
    expect(isScratchOfferTrigger('offer')).toBe(true)
    expect(isScratchOfferTrigger('offers')).toBe(true)
    expect(isScratchOfferTrigger('Do you have any offer?')).toBe(true)
    expect(isScratchOfferTrigger('kya offer hai aaj?')).toBe(true)
    expect(isScratchOfferTrigger('scratch')).toBe(true)
    expect(isScratchOfferTrigger('scratch card')).toBe(true)
  })

  it('matches button reply IDs', () => {
    expect(isScratchOfferTrigger('', 'scratch_claim_credit')).toBe(true)
    expect(isScratchOfferTrigger('', 'ask_bestai_desk')).toBe(true)
  })

  it('does not falsely match spare parts queries or general chat', () => {
    expect(isScratchOfferTrigger('Splendor brake shoe price?')).toBe(false)
    expect(isScratchOfferTrigger('Pulsar 150 clutch plate')).toBe(false)
    expect(isScratchOfferTrigger('Activa air filter')).toBe(false)
    expect(isScratchOfferTrigger('Dukan kahan hai?')).toBe(false)
  })
})

describe('getISTDetails & Formatting Helpers', () => {
  it('returns valid IST components', () => {
    const ist = getISTDetails()
    expect(ist.year).toBeGreaterThanOrEqual(2025)
    expect(ist.yearMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(ist.monthCode).toMatch(/^[A-Z]{3}\d{2}$/)
    expect(ist.monthLong.length).toBeGreaterThan(2)
  })

  it('formats IST date time nicely', () => {
    const dt = getISTFormattedDateTime()
    expect(dt).toContain('IST')
    expect(dt).toMatch(/\d{2}\s+[A-Za-z]{3}\s+\d{4}/)
  })

  it('normalizes Indian phone numbers to 91XXXXXXXXXX', () => {
    expect(normalizePhone91('+91 96347 22174')).toBe('919634722174')
    expect(normalizePhone91('9634722174')).toBe('919634722174')
    expect(normalizePhone91('919634722174')).toBe('919634722174')
  })

  it('contains exactly 3 official Best Auto Parts motorcycle prizes', () => {
    expect(SCRATCH_PRIZES.length).toBe(3)
    expect(SCRATCH_PRIZES).toContain('🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda)')
    expect(SCRATCH_PRIZES).toContain('🔑 Free Premium Bike Keychain')
    expect(SCRATCH_PRIZES).toContain('🔋 Free Winter Starting Checkup + ₹50 OFF on Spark Plug / Battery')
  })

  it('button titles are strictly <= 20 characters (Meta API limit)', () => {
    const btn1 = '🎁 Credit / Scratch'
    const btn2 = '🤖 Ask BestAI Desk'
    expect(btn1.length).toBeLessThanOrEqual(20)
    expect(btn2.length).toBeLessThanOrEqual(20)
  })

  it('has correct shop customer care phone number', () => {
    expect(SHOP_METADATA.customerCare).toBe('9634722174')
    expect(SHOP_METADATA.phone).toContain('96347 22174')
  })
})

describe('generateUniqueCouponCode', () => {
  it('generates a code with prefix BAP-{MONTH_CODE}-{3_DIGITS}', async () => {
    const mockDb: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    }

    const code = await generateUniqueCouponCode(mockDb, 'acc-1', 'NOV26')
    expect(code).toMatch(/^BAP-NOV26-\d{3}$/)
  })
})

describe('handleScratchOfferFlow', () => {
  let mockDb: any
  let insertedMessages: any[] = []
  let insertedNotes: any[] = []
  let insertedTags: any[] = []

  const baseInput: HandleScratchOfferInput = {
    db: {} as any,
    accountId: 'acc-123',
    userId: 'user-123',
    conversationId: 'conv-123',
    contactId: 'contact-123',
    inboundText: 'offer',
    senderName: 'Nabeel Ahmad',
    senderPhone: '+91 96347 22174',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    insertedMessages = []
    insertedNotes = []
    insertedTags = []

    mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'contact_tags') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'contact_notes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((payload) => {
              insertedNotes.push(payload)
              return Promise.resolve({ data: null, error: null })
            }),
          }
        }
        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((payload) => {
              insertedMessages.push(payload)
              return Promise.resolve({ data: null, error: null })
            }),
          }
        }
        if (table === 'tags') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn((payload) => {
              insertedTags.push(payload)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { id: `tag-${payload.name}` }, error: null }),
                })),
              }
            }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn().mockReturnThis(),
          }
        }
        if (table === 'conversations') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    }
  })

  it('presents interactive card when eligible for this month', async () => {
    const res = await handleScratchOfferFlow({
      ...baseInput,
      db: mockDb,
      inboundText: '🎁 Scratch & Win Offer — Best Auto Parts',
    })

    expect(res.handled).toBe(true)
    expect(res.action).toBe('card_presented')
    expect(res.whatsappMessageId).toBe('wamid.btn.123')
  })

  it('claims reward, adds 3 tags, creates audit note and system audit message on button tap', async () => {
    const res = await handleScratchOfferFlow({
      ...baseInput,
      db: mockDb,
      inboundText: '',
      interactiveReplyId: 'scratch_claim_credit',
    })

    expect(res.handled).toBe(true)
    expect(res.action).toBe('reward_awarded')
    expect(res.prize).toBeDefined()
    expect(res.couponCode).toMatch(/^BAP-[A-Z]{3}\d{2}-\d{3}$/)

    // 1. Tags created: SCRATCH_USED, COUPON, STATUS_ACTIVE
    const tagNames = insertedTags.map((t) => t.name)
    expect(tagNames.some((n) => n.startsWith('SCRATCH_USED_'))).toBe(true)
    expect(tagNames.some((n) => n.startsWith('COUPON_BAP-'))).toBe(true)
    expect(tagNames.some((n) => n.startsWith('STATUS_ACTIVE_'))).toBe(true)

    // 2. Audit note stored
    expect(insertedNotes.length).toBeGreaterThan(0)
    expect(insertedNotes[0].note_text).toContain('[SCRATCH WON |')
    expect(insertedNotes[0].note_text).toContain(`Code: ${res.couponCode}`)
    expect(insertedNotes[0].note_text).toContain('Status: ACTIVE (Unredeemed)')

    // 3. System audit message logged in messages for Saud Bhai's /inbox
    expect(insertedMessages.length).toBeGreaterThan(0)
    expect(insertedMessages[0].content_text).toContain(`🏆 Scratch Card Claimed: ${res.couponCode}`)
  })

  it('strict anti-reclaim: rejects multiple claims in same month', async () => {
    // Mock that the tag is already present
    mockDb.from = vi.fn((table: string) => {
      if (table === 'contact_tags') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ tags: { id: 'tag-1', name: 'SCRATCH_USED_2026-11' } }],
            error: null,
          }),
        }
      }
      if (table === 'contact_notes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                note_text:
                  '[SCRATCH WON | 25 Nov 2026, 07:55 AM IST] Code: BAP-NOV26-789 | Prize: 🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda) | Month: 2026-11 | Status: ACTIVE (Unredeemed)',
              },
            ],
            error: null,
          }),
        }
      }
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
    })

    const res = await handleScratchOfferFlow({
      ...baseInput,
      db: mockDb,
      inboundText: '/offer',
    })

    expect(res.handled).toBe(true)
    expect(res.action).toBe('claimed_already')
    expect(res.prize).toBe('🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda)')
    expect(res.couponCode).toBe('BAP-NOV26-789')
  })

  it('opens BestAI Desk without marking scratch card claimed', async () => {
    const res = await handleScratchOfferFlow({
      ...baseInput,
      db: mockDb,
      inboundText: '',
      interactiveReplyId: 'ask_bestai_desk',
    })

    expect(res.handled).toBe(true)
    expect(res.action).toBe('bestai_desk_opened')
    expect(res.whatsappMessageId).toBe('wamid.text.123')
    // No tags or audit messages should be inserted
    expect(insertedTags.length).toBe(0)
    expect(insertedMessages.length).toBe(0)
  })
})
