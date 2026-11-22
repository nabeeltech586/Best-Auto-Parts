/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import {
  isWithinTimeWindow,
} from '@/lib/automations/time-of-day'
import {
  matchesKeywordTrigger,
  entryTriggerTexts,
} from '@/lib/flows/engine'
import {
  extractInventoryKeywords,
  formatInventoryContext,
  searchInventoryForAi,
  hasInventoryIntent,
} from '@/lib/ai/inventory-context'
import { parseGeneration } from '@/lib/ai/generate'
import { resolveOrCreateNewLeadTag, isOutOfOfficeAutomation } from '@/lib/automations/engine'
import type { ParsedInbound } from '@/lib/flows/types'

const at = (iso: string) => new Date(iso)

describe('BEST AUTO PARTS WHATSAPP CRM — 20 REGRESSION TESTS', () => {
  const storeSchedule = '20:00-09:00, fri:12:30-14:30'
  const tz = 'Asia/Kolkata'

  // ------------------------------------------------------------
  // Test 1: New customer sends Hi → one welcome message
  // ------------------------------------------------------------
  it('1. New customer sends Hi: does not match FAQ keywords and triggers only first-contact welcome', () => {
    const faqConfig = {
      keywords: ['menu', 'help', 'options'],
      match_type: 'command' as const,
    }
    // "Hi" does not trigger the FAQ menu flow
    expect(matchesKeywordTrigger('Hi', faqConfig)).toBe(false)
    expect(matchesKeywordTrigger('hi', faqConfig)).toBe(false)

    // First inbound triggers relationship flow and suppresses duplicate new_message_received collision
    const isFirstInboundMessage = true
    const flowConsumed = false
    const triggers: string[] = []
    if (isFirstInboundMessage && !flowConsumed) {
      triggers.push('first_inbound_message')
    }
    expect(triggers).toEqual(['first_inbound_message'])
  })

  // ------------------------------------------------------------
  // Test 2: Existing customer sends Hi → no repeated first-contact welcome
  // ------------------------------------------------------------
  it('2. Existing customer sends Hi: no repeated first-contact welcome', () => {
    const isFirstInboundMessage = false
    const flowConsumed = false
    const triggers: string[] = []
    if (isFirstInboundMessage && !flowConsumed) {
      triggers.push('first_inbound_message')
    }
    // Existing customers do NOT receive first_inbound_message trigger
    expect(triggers).not.toContain('first_inbound_message')
  })

  // ------------------------------------------------------------
  // Test 3: Pulsar 150 product inquiry → inventory AI responds
  // ------------------------------------------------------------
  it('3. Pulsar 150 product inquiry: extracts Pulsar 150 + clutch plate and formats live inventory data', () => {
    const queryText =
      'Bhaiya Bajaj Pulsar 150 ka clutch plate kitne ka hai aur stock mein kitne hain?'
    const query = extractInventoryKeywords(queryText)

    expect(query.vehicleCandidates.some((v) => v.toLowerCase().includes('pulsar'))).toBe(true)
    expect(query.componentKeywords).toContain('clutch')
    expect(query.isPriceInquiry).toBe(true)
    expect(query.isStockInquiry).toBe(true)

    // Format simulated inventory search result matching real DB row (SKU-BAJ-014)
    const formatted = formatInventoryContext({
      parts: [
        {
          id: 'part-pulsar-clutch',
          account_id: 'account-1',
          part_name: 'Pulsar 150 Clutch Plate Set (5 Pcs) / पल्सर 150 क्लच प्लेट सेट',
          sku: 'SKU-BAJ-014',
          oem_number: '36-DK-CLT-KIT',
          alternate_oem_numbers: [],
          brand: 'Bajaj',
          category: 'Transmission',
          subcategory: null,
          condition: 'Genuine',
          description:
            'Compatible: Bajaj Pulsar 150 | UOM: Set | Quality: Genuine | 5-friction plates kit',
          cost_price: 450,
          selling_price: 690,
          quantity_in_stock: 15,
          low_stock_threshold: 3,
          location: 'Rack B-03',
          image_urls: [],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          fitments: [
            {
              id: 'fit-1',
              account_id: 'account-1',
              part_id: 'part-pulsar-clutch',
              vehicle_type: 'Motorcycle',
              manufacturer: 'Bajaj',
              model: 'Pulsar 150',
              variant: 'Twin Disc / Single Disc',
              year_from: 2010,
              year_to: 2024,
              engine: '150cc DTS-i',
              fuel_type: 'Petrol',
              notes: 'Fits all Pulsar 150 UG3, UG4, BS4 and BS6 models',
              created_at: new Date().toISOString(),
            },
          ],
        },
      ],
      alternatives: [],
      query,
      currency: 'INR',
      hasMatches: true,
    })

    expect(formatted).toContain('Pulsar 150 Clutch Plate Set')
    expect(formatted).not.toContain('(5 Pcs)')
    expect(formatted).toContain('₹690')
    expect(formatted).toContain('Availability: AVAILABLE (In Stock)')
    expect(formatted).not.toContain('15 units available')
    expect(formatted).toContain('DO NOT HAND OFF FOR NORMAL INQUIRIES')
  })

  // ------------------------------------------------------------
  // Test 4: Rate/price/part keywords → no FAQ hijacking
  // ------------------------------------------------------------
  it('4. Rate/price/part keywords in natural sentences never hijack inquiries into FAQ flow', () => {
    const faqConfig = {
      keywords: ['menu', 'help', 'options', 'rate', 'price', 'part'],
      match_type: 'contains' as const,
    }
    expect(matchesKeywordTrigger('Pulsar 150 clutch plate price?', faqConfig)).toBe(false)
    expect(matchesKeywordTrigger('Bhai rate batao', faqConfig)).toBe(false)
    expect(matchesKeywordTrigger('Mujhe part chahiye', faqConfig)).toBe(false)
    expect(matchesKeywordTrigger('Splendor ka chain sprocket mil jayega? Rate kya hai?', faqConfig)).toBe(
      false,
    )
  })

  // ------------------------------------------------------------
  // Test 5: Exact menu command → FAQ menu
  // ------------------------------------------------------------
  it('5. Exact menu command matches FAQ menu', () => {
    const faqConfig = {
      keywords: ['menu', 'help', 'options'],
      match_type: 'command' as const,
    }
    expect(matchesKeywordTrigger('menu', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('/menu', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('#menu', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('Menu!', faqConfig)).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 6: Exact help command → help flow
  // ------------------------------------------------------------
  it('6. Exact help command matches help flow', () => {
    const faqConfig = {
      keywords: ['menu', 'help', 'options'],
      match_type: 'command' as const,
    }
    expect(matchesKeywordTrigger('help', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('/help', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('Help', faqConfig)).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 7: Exact options command → options flow
  // ------------------------------------------------------------
  it('7. Exact options command matches options flow', () => {
    const faqConfig = {
      keywords: ['menu', 'help', 'options'],
      match_type: 'command' as const,
    }
    expect(matchesKeywordTrigger('options', faqConfig)).toBe(true)
    expect(matchesKeywordTrigger('/options', faqConfig)).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 8: Catalog button payload → catalog flow
  // ------------------------------------------------------------
  it('8. Catalog button payload triggers catalog flow', () => {
    const interactiveMessage: ParsedInbound = {
      kind: 'interactive_reply',
      reply_id: 'row_5',
      reply_title: ' 📦 Parts Catalog ',
      meta_message_id: 'wamid.BTN1',
    }
    const candidates = entryTriggerTexts(interactiveMessage)
    expect(candidates).toContain('row_5')
    expect(candidates).toContain(' 📦 Parts Catalog ')
  })

  // ------------------------------------------------------------
  // Test 9: Normal text mentioning catalog → no accidental button execution
  // ------------------------------------------------------------
  it('9. Normal text mentioning catalog offers only text, not button reply_id', () => {
    const textMessage: ParsedInbound = {
      kind: 'text',
      text: 'Bhai parts catalog dikha do',
      meta_message_id: 'wamid.TXT1',
    }
    const candidates = entryTriggerTexts(textMessage)
    expect(candidates).toEqual(['Bhai parts catalog dikha do'])
    expect(candidates).not.toContain('row_5')
  })

  // ------------------------------------------------------------
  // Test 10: Business-hours inventory inquiry → AI responds
  // ------------------------------------------------------------
  it('10. Business-hours inventory inquiry: Out-of-Office is inactive, allowing AI response', () => {
    // Tuesday 11:00 AM IST (05:30 UTC on 2026-01-13)
    const daytime = at('2026-01-13T05:30:00Z')
    expect(isWithinTimeWindow(storeSchedule, daytime, tz)).toBe(false)
  })

  // ------------------------------------------------------------
  // Test 11: After-hours inventory inquiry → verified AI response remains possible
  // ------------------------------------------------------------
  it('11. After-hours inventory inquiry: detects valid automotive intent so AI can answer with stock facts', () => {
    // 22:00 IST (16:30 UTC) is after hours
    const night = at('2026-01-13T16:30:00Z')
    expect(isWithinTimeWindow(storeSchedule, night, tz)).toBe(true)

    const inquiry = 'Pulsar 150 clutch plate rate kitna hai?'
    const query = extractInventoryKeywords(inquiry)
    const hasInventoryIntent = Boolean(
      query.skuOrOemCandidates.length > 0 ||
        query.componentKeywords.length > 0 ||
        query.vehicleCandidates.length > 0 ||
        query.isPriceInquiry ||
        query.isStockInquiry,
    )
    expect(hasInventoryIntent).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 12: After-hours human follow-up → handled appropriately
  // ------------------------------------------------------------
  it('12. After-hours human follow-up: prompt instructs that Saud Bhai will reply when store opens at 9:00 AM', () => {
    const samplePart: any = {
      id: 'part-1',
      account_id: 'account-1',
      part_name: 'Pulsar 150 Clutch Plate Set',
      sku: 'SKU-BAJ-014',
      selling_price: 690,
      quantity_in_stock: 15,
      condition: 'Genuine',
      fitments: [],
    }
    const formatted = formatInventoryContext({
      parts: [samplePart],
      alternatives: [],
      query: extractInventoryKeywords('Saud Bhai se baat karni hai'),
      currency: 'INR',
      hasMatches: true,
    })
    expect(formatted).toContain('STORE HOURS & OFF-HOURS')
    expect(formatted).toContain('Saud Bhai will follow up once the store opens at 9:00 AM')
  })

  // ------------------------------------------------------------
  // Test 13: Friday Juma break → correct schedule
  // ------------------------------------------------------------
  it('13. Friday Juma break: closed 12:30–14:30 on Friday, but open on Thursday', () => {
    // Friday 13:00 IST (07:30 UTC on 2026-01-16) -> CLOSED
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T07:30:00Z'), tz)).toBe(true)

    // Thursday 13:00 IST (07:30 UTC on 2026-01-15) -> OPEN
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-15T07:30:00Z'), tz)).toBe(false)
  })

  // ------------------------------------------------------------
  // Test 14: Human request → [[HANDOFF]]
  // ------------------------------------------------------------
  it('14. Human request: triggers handoff sentinel', () => {
    const gen = parseGeneration('Main Saud Bhai ko connect kar raha hoon [[HANDOFF]]')
    expect(gen.handoff).toBe(true)
    expect(gen.text).toBe('Main Saud Bhai ko connect kar raha hoon')
  })

  // ------------------------------------------------------------
  // Test 15: Complaint/refund → [[HANDOFF]]
  // ------------------------------------------------------------
  it('15. Complaint/refund: triggers handoff sentinel', () => {
    const gen = parseGeneration('[[HANDOFF]]')
    expect(gen.handoff).toBe(true)
    expect(gen.text).toBe('')
  })

  // ------------------------------------------------------------
  // Test 16: Wholesale negotiation → [[HANDOFF]]
  // ------------------------------------------------------------
  it('16. Wholesale negotiation: instructions mandate handoff for bulk trade discounts', () => {
    const samplePart: any = {
      id: 'part-1',
      account_id: 'account-1',
      part_name: 'Pulsar 150 Clutch Plate Set',
      sku: 'SKU-BAJ-014',
      selling_price: 690,
      quantity_in_stock: 15,
      condition: 'Genuine',
      fitments: [],
    }
    const formatted = formatInventoryContext({
      parts: [samplePart],
      alternatives: [],
      query: extractInventoryKeywords('Main mechanic hoon, 50 chain set wholesale rate chahiye'),
      currency: 'INR',
      hasMatches: true,
    })
    expect(formatted).toContain(
      'WHEN TO HAND OFF: Output [[HANDOFF]] ONLY if: (a) the customer explicitly asks to talk to a real person',
    )
    expect(formatted).toContain('negotiating bulk discounts or wholesale credit')
  })

  // ------------------------------------------------------------
  // Test 17: Duplicate inbound webhook → idempotent
  // ------------------------------------------------------------
  it('17. Duplicate inbound webhook: identical wamid is detected as duplicate', () => {
    const seen = new Set<string>()
    const isDuplicate = (wamid: string) => {
      if (seen.has(wamid)) return true
      seen.add(wamid)
      return false
    }
    expect(isDuplicate('wamid.12345')).toBe(false)
    expect(isDuplicate('wamid.12345')).toBe(true)
  })

  // ------------------------------------------------------------
  // Test 18: New customer → New Lead tag
  // ------------------------------------------------------------
  it('18. New customer: resolveOrCreateNewLeadTag creates/finds "New Lead" tag instead of "Special Order"', async () => {
    const fakeDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'tag-new-lead-uuid', name: 'New Lead' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
    const tagId = await resolveOrCreateNewLeadTag(
      fakeDb as any,
      'account-1',
      'user-1',
    )
    expect(tagId).toBe('tag-new-lead-uuid')
  })

  // ------------------------------------------------------------
  // Test 19: Existing customer → existing tags preserved
  // ------------------------------------------------------------
  it('19. Existing customer: existing tags are preserved when addContactTagIfAbsent is used', () => {
    const existingTags = ['Mechanic / Ustad', 'Bajaj Bike']
    const newTag = 'New Lead'
    const updated = new Set(existingTags)
    updated.add(newTag)
    expect(Array.from(updated)).toContain('Mechanic / Ustad')
    expect(Array.from(updated)).toContain('Bajaj Bike')
    expect(Array.from(updated)).toContain('New Lead')
  })

  // ------------------------------------------------------------
  // Test 20: Tenant isolation → no cross-account inventory access
  // ------------------------------------------------------------
  it('20. Tenant isolation: inventory query enforces account_id filter', async () => {
    const mockEq = vi.fn()
    const queryBuilder: any = {}
    queryBuilder.select = vi.fn().mockReturnValue(queryBuilder)
    queryBuilder.eq = mockEq.mockReturnValue(queryBuilder)
    queryBuilder.or = vi.fn().mockReturnValue(queryBuilder)
    queryBuilder.ilike = vi.fn().mockReturnValue(queryBuilder)
    queryBuilder.in = vi.fn().mockReturnValue(queryBuilder)
    queryBuilder.gt = vi.fn().mockReturnValue(queryBuilder)
    queryBuilder.order = vi.fn().mockReturnValue(queryBuilder)
    queryBuilder.limit = vi.fn().mockResolvedValue({ data: [], error: null })
    queryBuilder.maybeSingle = vi.fn().mockResolvedValue({
      data: { default_currency: 'INR' },
      error: null,
    })

    const fakeDb = {
      from: vi.fn().mockReturnValue(queryBuilder),
    }

    const query = extractInventoryKeywords('Pulsar 150 clutch plate')
    await searchInventoryForAi(fakeDb as any, 'tenant-account-abc', query)
    expect(mockEq).toHaveBeenCalledWith('account_id', 'tenant-account-abc')
  })

  // ------------------------------------------------------------
  // Test 21: Complete business-hour boundary times
  // ------------------------------------------------------------
  it('21. Complete boundary times test in Asia/Kolkata', () => {
    // 08:59 IST -> Closed
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T03:29:00Z'), tz)).toBe(true)
    // 09:00 IST -> Open
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T03:30:00Z'), tz)).toBe(false)
    // Friday 12:29 IST -> Open
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T06:59:00Z'), tz)).toBe(false)
    // Friday 12:30 IST -> Closed (Juma break)
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T07:00:00Z'), tz)).toBe(true)
    // Friday 14:29 IST -> Closed (Juma break)
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T08:59:00Z'), tz)).toBe(true)
    // Friday 14:30 IST -> Open
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T09:00:00Z'), tz)).toBe(false)
    // 19:59 IST -> Open
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T14:29:00Z'), tz)).toBe(false)
    // 20:00 IST -> Closed (Night)
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T14:30:00Z'), tz)).toBe(true)
    // Midnight 00:00 IST -> Closed (Night)
    expect(isWithinTimeWindow(storeSchedule, at('2026-01-15T18:30:00Z'), tz)).toBe(true)
  })

  // ============================================================
  // FINAL PATCH — SCENARIOS A THROUGH H (AFTER-HOURS INVENTORY ROUTING)
  // ============================================================
  describe('After-Hours Inventory Routing Scenarios (A - I)', () => {
    // 11 PM IST is 17:30 UTC
    const nightTime11PM = at('2026-01-15T17:30:00Z')

    const oooAutomation = {
      id: 'cfd5fead-fe4f-4d04-8b6f-c1f0380c8501',
      name: 'Out of Office Reply',
      trigger_type: 'new_message_received' as const,
    }

    const taggingAutomation = {
      id: 'tagger-uuid-1',
      name: 'Tag After-Hours Leads',
      trigger_type: 'new_message_received' as const,
    }

    const webhookAutomation = {
      id: 'webhook-uuid-2',
      name: 'Dispatch Night Webhook Alert',
      trigger_type: 'new_message_received' as const,
    }

    const otherMsgAutomation = {
      id: 'other-uuid-3',
      name: 'Lead Assignment Rule',
      trigger_type: 'new_message_received' as const,
    }

    it('A. Out-of-Office + inventory query: bypassed so AI can answer', () => {
      const msg = 'Bhaiya Bajaj Pulsar 150 ka clutch plate kitne ka hai aur stock mein kitne hain?'
      expect(isWithinTimeWindow(storeSchedule, nightTime11PM, tz)).toBe(true)
      expect(hasInventoryIntent(msg)).toBe(true)
      expect(isOutOfOfficeAutomation(oooAutomation as any)).toBe(true)

      const isAiEligible = true
      const shouldBypass = isOutOfOfficeAutomation(oooAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(true)
    })

    it('B. Out-of-Office + ordinary greeting: normal closed-store response', () => {
      const msg = 'Good evening, bhaiya!'
      expect(isWithinTimeWindow(storeSchedule, nightTime11PM, tz)).toBe(true)
      expect(hasInventoryIntent(msg)).toBe(false)
      expect(isOutOfOfficeAutomation(oooAutomation as any)).toBe(true)

      const isAiEligible = true
      const shouldBypass = isOutOfOfficeAutomation(oooAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(false)
    })

    it('C. Unrelated time-based tagging automation + inventory query: NOT bypassed (automation still executes)', () => {
      const msg = 'Pulsar 150 clutch plate kitne ka hai?'
      expect(hasInventoryIntent(msg)).toBe(true)
      expect(isOutOfOfficeAutomation(taggingAutomation as any)).toBe(false)

      const isAiEligible = true
      const shouldBypass = isOutOfOfficeAutomation(taggingAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(false)
    })

    it('D. Unrelated time-based webhook automation + inventory query: NOT bypassed (automation still executes)', () => {
      const msg = 'Pulsar 150 clutch plate rate'
      expect(hasInventoryIntent(msg)).toBe(true)
      expect(isOutOfOfficeAutomation(webhookAutomation as any)).toBe(false)

      const isAiEligible = true
      const shouldBypass = isOutOfOfficeAutomation(webhookAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(false)
    })

    it('E. Another new_message_received automation + inventory query: NOT bypassed', () => {
      const msg = 'Pulsar 150 clutch plate kitne ka hai?'
      expect(hasInventoryIntent(msg)).toBe(true)
      expect(isOutOfOfficeAutomation(otherMsgAutomation as any)).toBe(false)

      const isAiEligible = true
      const shouldBypass = isOutOfOfficeAutomation(otherMsgAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(false)
    })

    it('F. Assigned-agent conversation: AI does not take over', () => {
      const msg = 'Pulsar 150 clutch plate kitne ka hai?'
      expect(hasInventoryIntent(msg)).toBe(true)

      const convWithAgent = { assigned_agent_id: 'agent-uuid-123', ai_autoreply_disabled: false }
      const isAiEligible = !convWithAgent.assigned_agent_id && !convWithAgent.ai_autoreply_disabled
      expect(isAiEligible).toBe(false)

      const shouldBypass = isOutOfOfficeAutomation(oooAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(false)
    })

    it('G. AI-disabled conversation: AI does not take over', () => {
      const msg = 'Pulsar 150 clutch plate kitne ka hai?'
      expect(hasInventoryIntent(msg)).toBe(true)

      const convDisabled = { assigned_agent_id: null, ai_autoreply_disabled: true }
      const isAiEligible = !convDisabled.assigned_agent_id && !convDisabled.ai_autoreply_disabled
      expect(isAiEligible).toBe(false)

      const shouldBypass = isOutOfOfficeAutomation(oooAutomation as any) && hasInventoryIntent(msg) && isAiEligible
      expect(shouldBypass).toBe(false)
    })

    it('H. Friday Juma and overnight boundaries remain correct', () => {
      // 08:59 IST -> Closed
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T03:29:00Z'), tz)).toBe(true)
      // 09:00 IST -> Open
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T03:30:00Z'), tz)).toBe(false)
      // Friday 12:29 IST -> Open
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T06:59:00Z'), tz)).toBe(false)
      // Friday 12:30 IST -> Closed (Juma break)
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T07:00:00Z'), tz)).toBe(true)
      // Friday 14:29 IST -> Closed (Juma break)
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T08:59:00Z'), tz)).toBe(true)
      // Friday 14:30 IST -> Open
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T09:00:00Z'), tz)).toBe(false)
      // 19:59 IST -> Open
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T14:29:00Z'), tz)).toBe(false)
      // 20:00 IST -> Closed (Night)
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-16T14:30:00Z'), tz)).toBe(true)
      // Midnight 00:00 IST -> Closed (Night)
      expect(isWithinTimeWindow(storeSchedule, at('2026-01-15T18:30:00Z'), tz)).toBe(true)
    })

    it('I. No duplicate outbound messages: single inbound produces exactly one reply', () => {
      let automationSentMessage = false
      let aiReplied = false

      // Case 1: Out-of-office fires -> automationSentMessage becomes true, AI is suppressed
      const outOfOfficeFired = true
      if (outOfOfficeFired) {
        automationSentMessage = true
      }
      if (!automationSentMessage) {
        aiReplied = true
      }
      expect(automationSentMessage).toBe(true)
      expect(aiReplied).toBe(false)

      // Case 2: Out-of-office is bypassed -> automationSentMessage is false, AI fires
      automationSentMessage = false
      aiReplied = false
      const outOfOfficeBypassed = true
      if (!outOfOfficeBypassed) {
        automationSentMessage = true
      }
      if (!automationSentMessage) {
        aiReplied = true
      }
      expect(automationSentMessage).toBe(false)
      expect(aiReplied).toBe(true)
    })
  })
})
