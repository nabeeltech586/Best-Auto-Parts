import type { SupabaseClient } from '@supabase/supabase-js'
import { engineSendText, engineSendInteractiveButtons } from '@/lib/flows/meta-send'
import { addContactTagIfAbsent } from '@/lib/contacts/tag-write'

export const SCRATCH_PRIZES = [
  '🔑 Free Premium Bike Keychain',
  '🛢️ 25% OFF on 1 Litre Engine Oil (Bajaj / Hero / Honda)',
  '🔋 Free Winter Starting Checkup + ₹50 OFF on Spark Plug / Battery',
]

export const SHOP_METADATA = {
  name: 'Best Auto Parts',
  address: 'Kailashpur, Saharanpur, UP 247001',
  phone: '+91 96347 22174',
  upi: '9761224004-2@ybl',
  hours: '9:00 AM – 9:00 PM',
  fridayBreak: '12:30 PM – 2:30 PM',
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
 * Detects if an inbound message or interactive button reply is triggering
 * the Monthly Scratch & Win Offer or BestAI Desk.
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

  // 2. Icebreaker button / message title
  if (
    normText.includes('scratch & win') ||
    normText.includes('scratch and win') ||
    normText.includes('scratch & win offer') ||
    normText.includes('scratch card') ||
    normText.includes('lucky scratch') ||
    normText.includes('lucky card')
  ) {
    return true
  }

  // 3. Keywords: offer, offers, scratch
  if (/\b(offer|offers|scratch)\b/i.test(normText)) {
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
 * Checks whether this contact has already claimed the Lucky Scratch Card for the given IST month.
 */
export async function checkScratchClaimStatus(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  conversationId: string,
  yearMonth: string,
  monthCode: string
): Promise<ScratchClaimStatus> {
  const tagName = `SCRATCH_USED_${yearMonth}`

  // Check 1: contact_tags joined with tags
  try {
    const { data: tagRow } = await db
      .from('contact_tags')
      .select('tags!inner(id, name)')
      .eq('contact_id', contactId)
      .eq('tags.name', tagName)
      .maybeSingle()

    if (tagRow) {
      // Fetch note to retrieve exact prize and coupon code
      const { data: notes } = await db
        .from('contact_notes')
        .select('note_text')
        .eq('contact_id', contactId)
        .ilike('note_text', `%${tagName}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      const parsed = extractPrizeAndCode(notes?.[0]?.note_text, monthCode)
      return { claimed: true, existingPrize: parsed.prize, existingCode: parsed.code }
    }
  } catch (err) {
    console.warn('[scratch-offer] tag check notice:', err)
  }

  // Check 2: contact_notes
  try {
    const { data: notes } = await db
      .from('contact_notes')
      .select('note_text')
      .eq('contact_id', contactId)
      .ilike('note_text', `%${tagName}%`)
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
      .ilike('content_text', `%SCRATCH_USED_${yearMonth}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (msgs && msgs.length > 0) {
      const parsed = extractPrizeAndCode(msgs[0].content_text, monthCode)
      return { claimed: true, existingPrize: parsed.prize, existingCode: parsed.code }
    }
  } catch (err) {
    console.warn('[scratch-offer] message check notice:', err)
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
      prize: '🔑 Free Premium Bike Keychain',
      code: `BAP-${monthCode}-001`,
    }
  }

  let prize = '🔑 Free Premium Bike Keychain'
  let code = `BAP-${monthCode}-001`

  const prizeMatch =
    rawText.match(/Prize:\s*([^|\n]+)/i) ||
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

export interface HandleScratchOfferInput {
  db: SupabaseClient
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  inboundText: string
  interactiveReplyId?: string | null
}

export interface HandleScratchOfferResult {
  handled: boolean
  action?: 'claimed_already' | 'card_presented' | 'reward_awarded' | 'bestai_desk_opened'
  prize?: string
  couponCode?: string
  whatsappMessageId?: string
}

/**
 * Executes the WhatsApp Scratch & Win Offer and BestAI Desk flow.
 */
export async function handleScratchOfferFlow(
  input: HandleScratchOfferInput
): Promise<HandleScratchOfferResult> {
  const { db, accountId, userId, conversationId, contactId, inboundText, interactiveReplyId } =
    input

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
    ist.monthCode
  )

  // ============================================================
  // Action 1: Button "scratch_claim_credit" tapped (or text "claim" / "scratch now")
  // ============================================================
  if (
    normId === 'scratch_claim_credit' ||
    normText === 'claim' ||
    normText === 'credit' ||
    normText === 'scratch now' ||
    normText === 'scratch'
  ) {
    if (status.claimed) {
      // Already claimed this month
      const alreadyClaimedText =
        `⚠️ *Monthly Offer Already Claimed!*\n\n` +
        `You have already used your once-a-month Lucky Scratch Card at *Best Auto Parts*.\n\n` +
        `🎟️ *Your Active Prize:* ${status.existingPrize}\n` +
        `🔖 *Coupon Code:* *${status.existingCode}*\n` +
        `📍 Collect your prize from our counter in *Kailashpur, Saharanpur*. Your next Scratch Card unlocks on the *1st of next month*!\n\n` +
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

      // Ensure AI auto-reply is ready for follow-up part questions
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

    // Award random prize
    const randomPrize =
      SCRATCH_PRIZES[Math.floor(Math.random() * SCRATCH_PRIZES.length)]
    const randomDigits = Math.floor(100 + Math.random() * 900)
    const couponCode = `BAP-${ist.monthCode}-${randomDigits}`
    const tagName = `SCRATCH_USED_${ist.yearMonth}`

    // 1. Tag the contact
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
            color: '#F59E0B',
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
    } catch (tagErr) {
      console.warn('[scratch-offer] tagging warning:', tagErr)
    }

    // 2. Add contact note
    try {
      const noteText = `${tagName} | Prize: ${randomPrize} | Code: ${couponCode}`
      await db.from('contact_notes').insert({
        account_id: accountId,
        user_id: userId,
        contact_id: contactId,
        note_text: noteText,
      })
    } catch (noteErr) {
      console.warn('[scratch-offer] note insert warning:', noteErr)
    }

    // 3. Ensure AI assistant is enabled
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

    // 4. Send celebration voucher message
    const celebrationMessage =
      `🎉 *Congratulations! You Won:* ${randomPrize}!\n\n` +
      `🔖 *Coupon Code:* *${couponCode}*\n` +
      `📅 *Valid Till:* End of ${ist.monthLong} ${ist.year}\n` +
      `📍 *Redeem At:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
      `⏰ *Hours:* 9:00 AM – 9:00 PM (Friday Break: 12:30 PM – 2:30 PM)\n` +
      `📞 *Contact:* +91 96347 22174\n\n` +
      `Show this code at our counter during your next visit to claim your prize! 🏍️💨\n\n` +
      `---\n` +
      `🤖 *BestAI Desk is ready to assist you!* Type any *Bajaj, Hero, or Honda* part name to check price and availability.`

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
      prize: randomPrize,
      couponCode,
      whatsappMessageId: sendRes.whatsapp_message_id,
    }
  }

  // ============================================================
  // Action 2: Button "ask_bestai_desk" tapped
  // ============================================================
  if (normId === 'ask_bestai_desk' || normText === 'bestai' || normText === 'ask bestai') {
    // Scratch card remains saved (do NOT tag SCRATCH_USED)
    // Enable AI agent and reset any prior human handoff
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
  // Action 3: Initial Offer Trigger (Icebreaker, "offer", "scratch & win")
  // ============================================================
  if (status.claimed) {
    const alreadyClaimedText =
      `⚠️ *Monthly Offer Already Claimed!*\n\n` +
      `You have already used your once-a-month Lucky Scratch Card at *Best Auto Parts*.\n\n` +
      `🎟️ *Your Active Prize:* ${status.existingPrize}\n` +
      `🔖 *Coupon Code:* *${status.existingCode}*\n` +
      `📍 Collect your prize from our counter in *Kailashpur, Saharanpur*. Your next Scratch Card unlocks on the *1st of next month*!\n\n` +
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

  // Eligible: send interactive buttons
  const bodyText =
    `🎁 *Best Auto Parts — Monthly Lucky Scratch Card!* 🏍️✨\n\n` +
    `You have unlocked a special reward! Tap a button below to scratch your card or jump straight to our AI Desk:`

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
      `You have unlocked a special reward! Reply with an option:\n\n` +
      `1️⃣ Reply *1* to Scratch & Claim Prize 🎁\n` +
      `2️⃣ Reply *2* to Ask BestAI Desk 🤖\n\n` +
      `_📍 Kailashpur, Saharanpur • +91 96347 22174_`

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
