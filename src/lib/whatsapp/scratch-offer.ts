import type { SupabaseClient } from '@supabase/supabase-js'
import { engineSendText, engineSendInteractiveButtons } from '@/lib/flows/meta-send'
import { addContactTagIfAbsent } from '@/lib/contacts/tag-write'

export const SCRATCH_PRIZES = [
  '🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda)',
  '🔑 Free Premium Bike Keychain',
  '🔋 Free Winter Starting Checkup + ₹50 OFF on Spark Plug / Battery',
]

export const SHOP_METADATA = {
  name: 'Best Auto Parts',
  address: 'Kailashpur, Saharanpur, UP 247001',
  customerCare: '9634722174',
  phone: '+91 96347 22174',
  owner: 'Saud Khan',
  upi: '9761224004-2@ybl',
  hours: '9:00 AM – 9:00 PM IST',
  fridayBreak: '12:30 PM – 2:30 PM IST',
  supportedBrands: 'Bajaj, Hero, Honda',
}

/**
 * Normalizes phone number to digits, ensuring Indian country code 91 prefix.
 * e.g., "+91 96347 22174" -> "919634722174", "9634722174" -> "919634722174"
 */
export function normalizePhone91(phone?: string | null): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}

/**
 * Returns Indian Standard Time (IST, UTC+5:30) date components.
 */
export function getISTDetails(): {
  year: number
  monthNum: string
  yearMonth: string
  monthCode: string
  monthLong: string
  monthShort: string
} {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)

  const yearStr = parts.find((p) => p.type === 'year')?.value || String(now.getFullYear())
  const monthNumStr =
    parts.find((p) => p.type === 'month')?.value || String(now.getMonth() + 1).padStart(2, '0')
  const monthIndex = Math.max(0, Math.min(11, parseInt(monthNumStr, 10) - 1))

  const shortMonths = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ]
  const longMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  const monthShort = shortMonths[monthIndex] || 'NOV'
  const monthLong = longMonths[monthIndex] || 'November'
  const yearShort = yearStr.slice(-2)
  const monthCode = `${monthShort}${yearShort}`
  const yearMonth = `${yearStr}-${monthNumStr}`

  return {
    year: parseInt(yearStr, 10),
    monthNum: monthNumStr,
    yearMonth,
    monthCode,
    monthLong,
    monthShort,
  }
}

/**
 * Returns formatted IST timestamp string, e.g., "25 Nov 2026, 07:55 AM IST".
 */
export function getISTFormattedDateTime(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date()) + ' IST'
}

/**
 * Detects if an inbound message or interactive button reply is triggering
 * the Monthly Scratch & Win Offer or BestAI Desk.
 * Supported triggers:
 * - "🎁 Scratch & Win Offer — Best Auto Parts"
 * - "/offer", "offer", "offers"
 * - "scratch", "lucky card", "scratch card"
 * - interactive button replies: "scratch_claim_credit", "ask_bestai_desk"
 */
export function isScratchOfferTrigger(
  rawText: string,
  interactiveReplyId?: string | null
): boolean {
  const normId = (interactiveReplyId || '').trim().toLowerCase()
  const normText = (rawText || '').trim().toLowerCase()

  // 1. Direct interactive button replies
  if (normId === 'scratch_claim_credit' || normId === 'ask_bestai_desk') {
    return true
  }
  if (normId && (normId.includes('scratch') || normId.includes('offer'))) {
    return true
  }

  // 2. Exact icebreaker or button title / slash command match
  if (
    normText === '/offer' ||
    normText === 'offer' ||
    normText === 'scratch' ||
    normText.includes('scratch & win') ||
    normText.includes('scratch and win') ||
    normText.includes('scratch & win offer') ||
    normText.includes('scratch card') ||
    normText.includes('lucky scratch') ||
    normText.includes('lucky card')
  ) {
    return true
  }

  // 3. Keyword boundary match for offer / scratch (/offer, offer, offers, scratch)
  if (/(^|\s|\/)(offer|offers|scratch|lucky\s*card|scratch\s*card)($|\s|[!?.,])/i.test(normText)) {
    return true
  }

  return false
}

export interface ScratchClaimStatus {
  claimed: boolean
  existingPrize: string
  existingCode: string
}

/**
 * Checks whether this contact (or phone number) has already claimed the Lucky Scratch Card
 * for the current IST month by checking tags, notes, and messages.
 */
export async function checkScratchClaimStatus(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  conversationId: string,
  yearMonth: string,
  monthCode: string,
  senderPhone?: string | null
): Promise<ScratchClaimStatus> {
  const usedTagName = `SCRATCH_USED_${yearMonth}`
  const redeemedTagName = `REDEEMED_${yearMonth}`
  const statusActiveTagName = `STATUS_ACTIVE_${yearMonth}`

  // Check 1: contact_tags joined with tags for SCRATCH_USED / REDEEMED / STATUS_ACTIVE
  try {
    const { data: tagRows } = await db
      .from('contact_tags')
      .select('tags!inner(id, name)')
      .eq('contact_id', contactId)
      .in('tags.name', [usedTagName, redeemedTagName, statusActiveTagName])

    if (tagRows && tagRows.length > 0) {
      const { data: notes } = await db
        .from('contact_notes')
        .select('note_text')
        .eq('contact_id', contactId)
        .or(`note_text.ilike.%${usedTagName}%,note_text.ilike.%${yearMonth}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      const parsed = extractPrizeAndCode(notes?.[0]?.note_text, monthCode)
      return { claimed: true, existingPrize: parsed.prize, existingCode: parsed.code }
    }
  } catch (err) {
    console.warn('[scratch-offer] tag check notice:', err)
  }

  // Check 2: contact_notes for SCRATCH_USED / REDEEMED / [SCRATCH WON
  try {
    const { data: notes } = await db
      .from('contact_notes')
      .select('note_text')
      .eq('contact_id', contactId)
      .or(`note_text.ilike.%${usedTagName}%,note_text.ilike.%${redeemedTagName}%,note_text.ilike.%[SCRATCH WON%${yearMonth}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (notes && notes.length > 0) {
      const parsed = extractPrizeAndCode(notes[0].note_text, monthCode)
      return { claimed: true, existingPrize: parsed.prize, existingCode: parsed.code }
    }
  } catch (err) {
    console.warn('[scratch-offer] note check notice:', err)
  }

  // Check 3: conversation messages
  try {
    const { data: msgs } = await db
      .from('messages')
      .select('content_text')
      .eq('conversation_id', conversationId)
      .or(`content_text.ilike.%${usedTagName}%,content_text.ilike.%${redeemedTagName}%,content_text.ilike.%Scratch Card Claimed%${monthCode}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (msgs && msgs.length > 0) {
      const parsed = extractPrizeAndCode(msgs[0].content_text, monthCode)
      return { claimed: true, existingPrize: parsed.prize, existingCode: parsed.code }
    }
  } catch (err) {
    console.warn('[scratch-offer] message check notice:', err)
  }

  // Check 4: Cross-check by normalized phone number across contacts (anti-reclaim guard)
  const normPhone = normalizePhone91(senderPhone)
  if (normPhone) {
    try {
      const { data: matchingContacts } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .or(`phone.eq.${normPhone},phone.eq.+${normPhone},phone_normalized.eq.${normPhone}`)

      if (matchingContacts && matchingContacts.length > 0) {
        for (const c of matchingContacts) {
          if (c.id === contactId) continue
          const { data: otherTag } = await db
            .from('contact_tags')
            .select('tags!inner(id, name)')
            .eq('contact_id', c.id)
            .in('tags.name', [usedTagName, redeemedTagName])
            .maybeSingle()

          if (otherTag) {
            const { data: otherNotes } = await db
              .from('contact_notes')
              .select('note_text')
              .eq('contact_id', c.id)
              .or(`note_text.ilike.%${usedTagName}%,note_text.ilike.%${yearMonth}%`)
              .order('created_at', { ascending: false })
              .limit(1)

            const parsed = extractPrizeAndCode(otherNotes?.[0]?.note_text, monthCode)
            return { claimed: true, existingPrize: parsed.prize, existingCode: parsed.code }
          }
        }
      }
    } catch (phoneErr) {
      console.warn('[scratch-offer] cross-phone check notice:', phoneErr)
    }
  }

  return {
    claimed: false,
    existingPrize: '',
    existingCode: '',
  }
}

/**
 * Extracts prize description and coupon code from stored notes or message content.
 */
function extractPrizeAndCode(
  rawText?: string | null,
  monthCode: string = 'CLAIMED'
): { prize: string; code: string } {
  if (!rawText) {
    return {
      prize: '🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda)',
      code: `BAP-${monthCode}-001`,
    }
  }

  let prize = '🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda)'
  let code = `BAP-${monthCode}-001`

  const prizeMatch =
    rawText.match(/Prize:\s*([^|\n]+)/i) ||
    rawText.match(/Your Prize:\s*\*?([^\n!*]+)\*?!/i) ||
    rawText.match(/You Won:\s*\*?([^\n!*]+)\*?!/i) ||
    rawText.match(/Active Prize:\s*\*?([^\n*]+)\*?/i)
  if (prizeMatch && prizeMatch[1]) {
    prize = prizeMatch[1].trim()
  }

  const codeMatch =
    rawText.match(/Code:\s*\*?([A-Z0-9-]+)\*?/i) ||
    rawText.match(/\*(BAP-[A-Z0-9-]+)\*/i) ||
    rawText.match(/\b(BAP-[A-Z0-9-]+)\b/i)
  if (codeMatch && codeMatch[1]) {
    code = codeMatch[1].trim()
  }

  return { prize, code }
}

/**
 * Generates a globally unique coupon code per customer & per month:
 * BAP-{MMMYY}-{UNIQUE_CODE} (e.g., BAP-NOV26-184, BAP-NOV26-739, BAP-DEC26-412)
 * verifying against Supabase tags and notes so no two customers receive the same code.
 */
export async function generateUniqueCouponCode(
  db: SupabaseClient,
  accountId: string,
  monthCode: string
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomDigits = Math.floor(100 + Math.random() * 900)
    const candidate = `BAP-${monthCode}-${randomDigits}`
    const tagName = `COUPON_${candidate}`

    try {
      const { data: existingTag } = await db
        .from('tags')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', tagName)
        .maybeSingle()

      if (existingTag) continue

      const { data: noteMatch } = await db
        .from('contact_notes')
        .select('id')
        .eq('account_id', accountId)
        .ilike('note_text', `%${candidate}%`)
        .limit(1)

      if (noteMatch && noteMatch.length > 0) continue

      return candidate
    } catch {
      return candidate
    }
  }

  const fallbackDigits = Math.floor(100 + Math.random() * 900)
  return `BAP-${monthCode}-${fallbackDigits}`
}

export interface HandleScratchOfferInput {
  db: SupabaseClient
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  inboundText: string
  interactiveReplyId?: string | null
  senderName?: string | null
  senderPhone?: string | null
}

export interface HandleScratchOfferResult {
  handled: boolean
  action?: 'claimed_already' | 'card_presented' | 'reward_awarded' | 'bestai_desk_opened'
  prize?: string
  couponCode?: string
  whatsappMessageId?: string
}

/**
 * Helper to ensure a tag exists in the tags table and is linked to the contact.
 */
async function ensureTagOnContact(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  contactId: string,
  tagName: string,
  color: string = '#F59E0B'
): Promise<void> {
  try {
    let { data: tag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', tagName)
      .maybeSingle()

    if (!tag) {
      const { data: newTag } = await db
        .from('tags')
        .insert({
          account_id: accountId,
          user_id: userId,
          name: tagName,
          color,
        })
        .select('id')
        .single()
      tag = newTag
    }

    if (tag?.id) {
      await addContactTagIfAbsent(db, {
        accountId,
        contactId,
        tagId: tag.id,
      })
    }
  } catch (err) {
    console.warn(`[scratch-offer] failed tagging ${tagName}:`, err)
  }
}

/**
 * Executes the WhatsApp Scratch & Win Offer and BestAI Desk flow.
 */
export async function handleScratchOfferFlow(
  input: HandleScratchOfferInput
): Promise<HandleScratchOfferResult> {
  const {
    db,
    accountId,
    userId,
    conversationId,
    contactId,
    inboundText,
    interactiveReplyId,
    senderName,
    senderPhone,
  } = input

  if (!isScratchOfferTrigger(inboundText, interactiveReplyId)) {
    return { handled: false }
  }

  const ist = getISTDetails()
  const normId = (interactiveReplyId || '').trim().toLowerCase()
  const normText = (inboundText || '').trim().toLowerCase()

  const status = await checkScratchClaimStatus(
    db,
    accountId,
    contactId,
    conversationId,
    ist.yearMonth,
    ist.monthCode,
    senderPhone
  )

  // ============================================================
  // Action 1: Button "scratch_claim_credit" tapped (or text "claim" / "credit" / "scratch now")
  // ============================================================
  if (
    normId === 'scratch_claim_credit' ||
    normText === 'claim' ||
    normText === 'credit' ||
    normText === 'scratch now'
  ) {
    if (status.claimed) {
      // Strict Anti-Reclaim Lock: Already claimed this month
      const alreadyClaimedText =
        `⚠️ *Monthly Offer Already Claimed!*\n\n` +
        `You have already used your once-a-month Lucky Scratch Card at *Best Auto Parts*.\n\n` +
        `🎟️ *Your Active Prize:* ${status.existingPrize}\n` +
        `🔖 *Coupon Code:* *${status.existingCode}*\n` +
        `📍 Collect your prize from our counter in *Kailashpur, Saharanpur*. Your next Scratch Card unlocks on the *1st of next month*!\n` +
        `📞 *Customer Care:* *${SHOP_METADATA.customerCare}*\n\n` +
        `---\n` +
        `🤖 *How can BestAI Desk help you today?*\n` +
        `Type any *Bajaj, Hero, or Honda* spare part name below to check live rates & stock! 🏍️`

      const sendRes = await engineSendText({
        accountId,
        userId,
        conversationId,
        contactId,
        text: alreadyClaimedText,
      })

      // Ensure AI auto-reply is enabled for subsequent part queries
      try {
        await db
          .from('conversations')
          .update({
            ai_autoreply_disabled: false,
            assigned_agent_id: null,
            ai_handoff_summary: null,
          })
          .eq('id', conversationId)
          .eq('account_id', accountId)
      } catch {
        // best-effort
      }

      return {
        handled: true,
        action: 'claimed_already',
        prize: status.existingPrize,
        couponCode: status.existingCode,
        whatsappMessageId: sendRes.whatsapp_message_id,
      }
    }

    // Award random prize from official Best Auto Parts pool
    const selectedPrize =
      SCRATCH_PRIZES[Math.floor(Math.random() * SCRATCH_PRIZES.length)]
    // Generate globally unique coupon code (e.g. BAP-NOV26-184)
    const couponCode = await generateUniqueCouponCode(db, accountId, ist.monthCode)
    const istDateTime = getISTFormattedDateTime()

    // 1. Update contact name and normalized phone if available
    try {
      const contactUpdates: Record<string, string> = {}
      if (senderName && senderName.trim()) {
        contactUpdates.name = senderName.trim()
      }
      const normPhone = normalizePhone91(senderPhone)
      if (normPhone) {
        contactUpdates.phone_normalized = normPhone
      }
      if (Object.keys(contactUpdates).length > 0) {
        await db
          .from('contacts')
          .update(contactUpdates)
          .eq('id', contactId)
          .eq('account_id', accountId)
      }
    } catch (contactErr) {
      console.warn('[scratch-offer] contact update notice:', contactErr)
    }

    // 2. Add the 3 required tags: SCRATCH_USED_{YYYY-MM}, COUPON_{COUPON_CODE}, STATUS_ACTIVE_{YYYY-MM}
    await ensureTagOnContact(db, accountId, userId, contactId, `SCRATCH_USED_${ist.yearMonth}`, '#EF4444')
    await ensureTagOnContact(db, accountId, userId, contactId, `COUPON_${couponCode}`, '#10B981')
    await ensureTagOnContact(db, accountId, userId, contactId, `STATUS_ACTIVE_${ist.yearMonth}`, '#3B82F6')

    // 3. Append timestamped audit log to notes
    const auditNote = `[SCRATCH WON | ${istDateTime}] Code: ${couponCode} | Prize: ${selectedPrize} | Month: ${ist.yearMonth} | Status: ACTIVE (Unredeemed)`
    try {
      await db.from('contact_notes').insert({
        account_id: accountId,
        user_id: userId,
        contact_id: contactId,
        note_text: auditNote,
      })
    } catch (noteErr) {
      console.warn('[scratch-offer] note insert warning:', noteErr)
    }

    // 4. Insert system audit message in Supabase messages for Saud Bhai's /inbox
    try {
      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'bot',
        content_type: 'text',
        content_text: `🏆 Scratch Card Claimed: ${couponCode} — ${selectedPrize}`,
        status: 'read',
      })
    } catch (msgAuditErr) {
      console.warn('[scratch-offer] message audit warning:', msgAuditErr)
    }

    // 5. Ensure AI assistant is enabled and human handoff reset
    try {
      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: false,
          assigned_agent_id: null,
          ai_handoff_summary: null,
          last_message_text: `🏆 ${couponCode} — ${selectedPrize}`,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId)
    } catch {
      // best-effort
    }

    // 6. Send the First-Time Scratch Card Win Message
    const celebrationMessage =
      `🎉 *Congratulations! You Won a Lucky Scratch Card!* 🎉\n\n` +
      `Thank you for choosing *Best Auto Parts*! Here is your exclusive monthly reward:\n\n` +
      `🎟️ *Your Prize:* ${selectedPrize}\n` +
      `🔖 *Coupon Code:* *${couponCode}*\n` +
      `📍 Show this code at our counter in *Kailashpur, Saharanpur* to claim your discount.\n` +
      `⏳ *Valid till:* End of this month (Next Scratch Card unlocks on the *1st of next month*!)\n` +
      `📞 *Customer Care:* *${SHOP_METADATA.customerCare}*\n\n` +
      `---\n` +
      `🤖 *How can BestAI Desk help you today?*\n` +
      `Type any *Bajaj, Hero, or Honda* spare part name below to check live rates & stock! 🏍️`

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: celebrationMessage,
    })

    return {
      handled: true,
      action: 'reward_awarded',
      prize: selectedPrize,
      couponCode,
      whatsappMessageId: sendRes.whatsapp_message_id,
    }
  }

  // ============================================================
  // Action 2: Button "ask_bestai_desk" tapped
  // ============================================================
  if (normId === 'ask_bestai_desk' || normText === 'bestai' || normText === 'ask bestai') {
    // Keep user's monthly scratch card saved (do NOT mark SCRATCH_USED)
    try {
      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: false,
          assigned_agent_id: null,
          ai_handoff_summary: null,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId)
    } catch {
      // best-effort
    }

    const welcomeAiText =
      `🤖 *Welcome to BestAI Desk — Best Auto Parts!* 🏍️\n\n` +
      `How can I assist you today? Just type:\n` +
      `• *Bike Model & Spare Part Name* (e.g., _Splendor Brake Shoe_, _Pulsar 150 Clutch Plate_, _Activa Air Filter_) for *instant live prices & stock*\n` +
      `• Or ask for *Shop Location, Timings, or UPI Payment details*!\n\n` +
      `_(Your monthly Lucky Scratch Card is still saved — send *"Offer"* anytime to unlock your prize!)_`

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: welcomeAiText,
    })

    return {
      handled: true,
      action: 'bestai_desk_opened',
      whatsappMessageId: sendRes.whatsapp_message_id,
    }
  }

  // ============================================================
  // Action 3: Initial Offer Trigger (Icebreaker, "/offer", "offer", "scratch")
  // ============================================================
  if (status.claimed) {
    const alreadyClaimedText =
      `⚠️ *Monthly Offer Already Claimed!*\n\n` +
      `You have already used your once-a-month Lucky Scratch Card at *Best Auto Parts*.\n\n` +
      `🎟️ *Your Active Prize:* ${status.existingPrize}\n` +
      `🔖 *Coupon Code:* *${status.existingCode}*\n` +
      `📍 Collect your prize from our counter in *Kailashpur, Saharanpur*. Your next Scratch Card unlocks on the *1st of next month*!\n` +
      `📞 *Customer Care:* *${SHOP_METADATA.customerCare}*\n\n` +
      `---\n` +
      `🤖 *How can BestAI Desk help you today?*\n` +
      `Type any *Bajaj, Hero, or Honda* spare part name below to check live rates & stock! 🏍️`

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: alreadyClaimedText,
    })

    return {
      handled: true,
      action: 'claimed_already',
      prize: status.existingPrize,
      couponCode: status.existingCode,
      whatsappMessageId: sendRes.whatsapp_message_id,
    }
  }

  // Eligible: send interactive 2-button card
  const bodyText =
    `🎁 *Best Auto Parts — Monthly Lucky Scratch Card!* 🏍️✨\n\n` +
    `You have unlocked a special monthly reward! Tap a button below to scratch your card or jump straight to our AI Desk:`

  const buttons = [
    { id: 'scratch_claim_credit', title: '🎁 Credit / Scratch' },
    { id: 'ask_bestai_desk', title: '🤖 Ask BestAI Desk' },
  ]

  try {
    const btnRes = await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText,
      buttons,
      footerText: 'Best Auto Parts • Kailashpur, Saharanpur',
    })

    return {
      handled: true,
      action: 'card_presented',
      whatsappMessageId: btnRes.whatsapp_message_id,
    }
  } catch (btnErr) {
    console.warn('[scratch-offer] interactive buttons failed, falling back to text:', btnErr)
    const fallbackText =
      `🎁 *Best Auto Parts — Monthly Lucky Scratch Card!* 🏍️✨\n\n` +
      `You have unlocked a special monthly reward! Reply with an option:\n\n` +
      `1️⃣ Reply *1* to Scratch & Claim Prize 🎁\n` +
      `2️⃣ Reply *2* to Ask BestAI Desk 🤖\n\n` +
      `_📍 Kailashpur, Saharanpur • Customer Care: ${SHOP_METADATA.customerCare}_`

    const textRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: fallbackText,
    })

    return {
      handled: true,
      action: 'card_presented',
      whatsappMessageId: textRes.whatsapp_message_id,
    }
  }
}
