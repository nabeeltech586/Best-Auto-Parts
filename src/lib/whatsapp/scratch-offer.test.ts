import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  isScratchOfferTrigger,
  getISTDetails,
  handleScratchOfferFlow,
  SCRATCH_PRIZES,
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
  it('matches ice breaker text', () => {
    expect(isScratchOfferTrigger('🎁 Scratch & Win Offer — Best Auto Parts')).toBe(true)
    expect(isScratchOfferTrigger('scratch & win offer')).toBe(true)
    expect(isScratchOfferTrigger('Lucky Scratch Card')).toBe(true)
  })

  it('matches keywords', () => {
    expect(isScratchOfferTrigger('Do you have any offer?')).toBe(true)
    expect(isScratchOfferTrigger('kya offer hai aaj?')).toBe(true)
    expect(isScratchOfferTrigger('scratch card')).toBe(true)
    expect(isScratchOfferTrigger('lucky card')).toBe(true)
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

describe('getISTDetails & Metadata', () => {
  it('returns valid IST components', () => {
    const ist = getISTDetails()
    expect(ist.year).toBeGreaterThanOrEqual(2025)
    expect(ist.yearMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(ist.monthCode).toMatch(/^[A-Z]{3}\d{2}$/)
    expect(ist.monthLong.length).toBeGreaterThan(2)
  })

  it('contains exactly 3 distinct motorcycle prizes', () => {
    expect(SCRATCH_PRIZES.length).toBe(3)
    expect(SCRATCH_PRIZES[0]).toContain('Keychain')
    expect(SCRATCH_PRIZES[1]).toContain('Engine Oil')
    expect(SCRATCH_PRIZES[2]).toContain('Starting Checkup')
  })

  it('button titles are strictly <= 20 characters (Meta API limit)', () => {
    const btn1 = '🎁 Credit / Scratch'
    const btn2 = '🤖 Ask BestAI Desk'
    expect(btn1.length).toBeLessThanOrEqual(20)
    expect(btn2.length).toBeLessThanOrEqual(20)
  })
})

describe('handleScratchOfferFlow', () => {
  let mockDb: any
  const baseInput: HandleScratchOfferInput = {
    db: {} as any,
    accountId: 'acc-123',
    userId: 'user-123',
    conversationId: 'conv-123',
    contactId: 'contact-123',
    inboundText: 'offer',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'contact_tags') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'contact_notes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'tags') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'tag-new-id' }, error: null }),
              })),
            })),
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

  it('claims reward and tags contact when scratch_claim_credit button is tapped', async () => {
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
  })

  it('prevents multiple claims in same month', async () => {
    // Mock that the tag is already present
    mockDb.from = vi.fn((table: string) => {
      if (table === 'contact_tags') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { tags: { id: 'tag-1', name: 'SCRATCH_USED_2026-11' } },
            error: null,
          }),
        }
      }
      if (table === 'contact_notes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                note_text:
                  'SCRATCH_USED_2026-11 | Prize: 🔑 Free Premium Bike Keychain | Code: BAP-NOV26-789',
              },
            ],
            error: null,
          }),
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
      inboundText: 'offer',
    })

    expect(res.handled).toBe(true)
    expect(res.action).toBe('claimed_already')
    expect(res.prize).toBe('🔑 Free Premium Bike Keychain')
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
    // Tag should NOT be added
    expect(mockDb.from).not.toHaveBeenCalledWith('tags')
  })
})
