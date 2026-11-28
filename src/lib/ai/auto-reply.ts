import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import {
  retrieveInventoryContext,
  hasInventoryIntent,
} from './inventory-context'
import { sanitizeCustomerStockPrivacy } from './stock-privacy'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import {
  engineSendText,
  engineSendInteractiveButtons,
  loadAccountMetaCredentials,
} from '@/lib/flows/meta-send'
import { getContactLanguage } from '@/lib/whatsapp/welcome-flow'
import {
  isClosingOrGratitudeMessage,
  isHinglishClosing,
  CLOSING_REPLY_ENGLISH,
  CLOSING_REPLY_HINGLISH,
} from '@/lib/whatsapp/closing-replies'
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { triggerMatches } from '@/lib/automations/engine'
import { isWithinTimeWindow } from '@/lib/automations/time-of-day'
import type { Automation, ConditionStepConfig } from '@/types'
import type { ServiceType } from '@/types/services'
import { syncServiceCaseFromChat } from '@/lib/services/service-cases'

/**
 * Detects whether the customer recently selected a sub-service button or inquiry topic,
 * locking the AI assistant strictly onto that sub-service.
 */
export function detectLockedSubService(
  messages: { role: string; content: string }[]
): { service: string; guideline: string } | null {
  const recent = messages.slice(-10).reverse();

  for (const m of recent) {
    const text = (m.content || '').toLowerCase();

    // 1. Bajaj Spare Parts
    if (
      text.includes('btn_brand_bajaj') ||
      text.includes('bajaj spare parts') ||
      text.includes('selected: *bajaj spare parts*')
    ) {
      return {
        service: 'Bajaj Spare Parts',
        guideline:
          'LOCKED ON BAJAJ SPARE PARTS: The customer is inquiring about Bajaj motorcycle spare parts (e.g., Pulsar, Platina, CT100, Avenger). Keep live inventory search active. Quote exact part name, genuine OEM vs aftermarket pricing, and stock status. If part name or bike model is missing, ask for it concisely.',
      };
    }

    // 2. Hero Spare Parts
    if (
      text.includes('btn_brand_hero') ||
      text.includes('hero spare parts') ||
      text.includes('selected: *hero spare parts*')
    ) {
      return {
        service: 'Hero Spare Parts',
        guideline:
          'LOCKED ON HERO SPARE PARTS: The customer is inquiring about Hero motorcycle/scooter spare parts (e.g., Splendor, HF Deluxe, Glamour, Passion, Pleasure, Maestro). Keep live inventory search active. Quote exact part name, genuine OEM vs aftermarket pricing, and stock status. If part name or bike model is missing, ask for it concisely.',
      };
    }

    // 3. Honda Spare Parts
    if (
      text.includes('btn_brand_honda') ||
      text.includes('honda spare parts') ||
      text.includes('selected: *honda spare parts*')
    ) {
      return {
        service: 'Honda Spare Parts',
        guideline:
          'LOCKED ON HONDA SPARE PARTS: The customer is inquiring about Honda motorcycle/scooter spare parts (e.g., Activa, Shine, SP 125, Unicorn, Dio). Keep live inventory search active. Quote exact part name, genuine OEM vs aftermarket pricing, and stock status. If part name or bike model is missing, ask for it concisely.',
      };
    }

    // 4. Vehicle Insurance
    if (
      text.includes('btn_service_insurance') ||
      text.includes('vehicle insurance desk') ||
      (text.includes('vehicle insurance') && !text.includes('itr'))
    ) {
      return {
        service: 'Vehicle Insurance',
        guideline:
          'LOCKED ON VEHICLE INSURANCE: The customer is inquiring about Vehicle Insurance. Focus exclusively on insurance guidance. When the customer has not shared these short essential details yet (or has not submitted the /apply form), politely ask for them at the end of your guidance:\n1️⃣ Vehicle Type (Two-Wheeler / Car / Commercial)\n2️⃣ Policy Type (Third-Party vs. Comprehensive)\n3️⃣ RC Valid Upto Date (or Vehicle Registration Number / clear RC photo)\n4️⃣ Previous Insurance Expiry Date\nNever guess insurance premiums. Inform the customer that Saud Khan (+91 96347 22174) will check all portal discounts and share the best quote.',
      };
    }

    // 5. Annual ITR Filing
    if (
      text.includes('btn_service_itr') ||
      text.includes('annual income tax return') ||
      text.includes('annual itr filing') ||
      (text.includes('itr') && !text.includes('insurance'))
    ) {
      return {
        service: 'Annual ITR Filing',
        guideline:
          'LOCKED ON ANNUAL ITR FILING: The customer is inquiring about Income Tax Return filing. Focus exclusively on ITR guidance. When the customer has not shared these short essential details yet (or has not submitted the /apply form), politely ask for them at the end of your guidance:\n1️⃣ Service (Salaried) vs. Self-Employed / Business\n2️⃣ Approx Annual Income / Turnover\n3️⃣ Full Name / PAN\nNever fabricate government tax calculations or refunds. Inform the customer that Saud Khan (+91 96347 22174) will review their details and prepare their ITR filing.',
      };
    }

    // 6. RTO Road Tax
    if (
      text.includes('btn_service_road_tax') ||
      text.includes('rto road tax service') ||
      (text.includes('road tax') && !text.includes('challan') && !text.includes('border'))
    ) {
      return {
        service: 'RTO Road Tax',
        guideline:
          'LOCKED ON RTO ROAD TAX: The customer is inquiring about RTO Road Tax. Focus exclusively on Road Tax guidance. When the customer has not shared these short essential details yet (or has not submitted the /apply form), politely ask for them at the end of your guidance:\n1️⃣ Vehicle Number (e.g., UP11...)\n2️⃣ RC Valid Upto Date\n3️⃣ Tax Period (Quarterly / Annual / One-Time)\nNever invent road tax amounts. Inform the customer that Saud Khan (+91 96347 22174) will check the official Vahan portal and share the exact dues.',
      };
    }

    // 7. E-Challan Service
    if (
      text.includes('btn_service_echallan') ||
      text.includes('e-challan settlement') ||
      text.includes('e-challan service') ||
      text.includes('echallan') ||
      text.includes('challan')
    ) {
      return {
        service: 'E-Challan Service',
        guideline:
          'LOCKED ON E-CHALLAN SETTLEMENT: The customer is inquiring about Traffic E-Challans. Focus exclusively on Challan verification & settlement: (1) Vehicle Registration Number, and (2) Last 5 digits of Chassis/Engine number. Never guess fine amounts. Note that Saud Khan (+91 96347 22174) will check the Parivahan portal and assist in settlement.',
      };
    }

    // 8. State Border Tax
    if (
      text.includes('btn_service_border_tax') ||
      text.includes('state border tax entry') ||
      text.includes('border tax')
    ) {
      return {
        service: 'State Border Tax',
        guideline:
          'LOCKED ON STATE BORDER TAX: The customer is inquiring about State Border Entry Tax. Focus exclusively on Border Tax guidance. When the customer has not shared these short essential details yet (or has not submitted the /apply form), politely ask for them at the end of your guidance:\n1️⃣ Vehicle Number (e.g., UP11...)\n2️⃣ Entry State (e.g., Uttarakhand, Haryana, Delhi, HP, Rajasthan)\n3️⃣ RC Valid Upto Date\n4️⃣ Entry Date & Duration (Days / Monthly Pass)\nNever invent border tax amounts. Inform the customer that Saud Khan (+91 96347 22174) will generate the official state border entry pass.',
      };
    }

    // 9. Mechanic Partner
    if (
      text.includes('btn_mechanic_partner') ||
      text.includes('mechanic partner program') ||
      text.includes('mechanic partner')
    ) {
      return {
        service: 'Mechanic Partner',
        guideline:
          'LOCKED ON MECHANIC PARTNER PROGRAM: The customer is a local two-wheeler mechanic. Highlight priority packing, dedicated Mechanic Khata ledger tracking, and special loyalty gifts. Strictly NEVER mention or offer wholesale rates. Invite them to send their bike parts list or photo.',
      };
    }
  }

  return null;
}

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
  /** Meta's wamid of the customer message we're replying to. When set,
   *  a typing indicator (which also marks it read) is shown while the
   *  reply is generated. Optional so older callers keep working. */
  inboundMessageId?: string
  /** Whether a message-level automation already sent an outbound message for this turn */
  automationReplied?: boolean
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
  } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    // If an automation already replied to this inbound, stand down to avoid double-texting
    if (args.automationReplied) return

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0) return

    // Deterministic, user-configured responders win over the LLM.
    // Query active message-level automations.
    const { data: autoResponders } = await db
      .from('automations')
      .select('id, name, trigger_type, trigger_config')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(10)

    if (autoResponders && autoResponders.length > 0) {
      const latestText = latestUserMessage(messages).toLowerCase()
      for (const auto of autoResponders) {
        if (auto.trigger_type === 'keyword_match') {
          // If keywords match, this automation will fire, so AI stands down
          if (triggerMatches(auto as unknown as Automation, { message_text: latestText })) {
            return
          }
        } else if (auto.trigger_type === 'new_message_received') {
          // Check if this automation has a time_of_day condition (e.g. Out of Office)
          let steps: { step_type: string; step_config: unknown }[] | null = null
          try {
            const res = await db
              .from('automation_steps')
              .select('step_type, step_config')
              .eq('automation_id', auto.id)
            steps = (res as { data: { step_type: string; step_config: unknown }[] | null }).data
          } catch {
            steps = null
          }

          const timeCondition = steps?.find(
            (s) =>
              s.step_type === 'condition' &&
              (s.step_config as ConditionStepConfig)?.subject === 'time_of_day',
          )

          if (timeCondition) {
            const timeCfg = timeCondition.step_config as ConditionStepConfig
            const inWindow = isWithinTimeWindow(timeCfg.operand, new Date(), timeCfg.timezone)
            if (inWindow) {
              // Outside business hours. If customer is asking a verified inventory question,
              // allow AI to answer with inventory facts! Otherwise stand down for Out of Office.
              if (!hasInventoryIntent(latestText)) {
                return
              }
            }
            // During business hours (!inWindow), Out of Office is inactive and does NOT block AI!
          } else {
            // Unconditional auto-responder that fires on every message 24/7: stand down
            return
          }
        } else {
          // Default / unknown message-level auto-responder: stand down
          return
        }
      }
    }

    // Every gate has passed — check for courteous closing & gratitude acknowledgment
    // ("ok", "okay", "thanks", "thank you", "thx", "shukriya", "dhanyawad", "ji", "theek hai", "achha", "nice", "👍")
    // Never trigger a fallback error, never repeat the full store menu.
    const latestRawUserText = latestUserMessage(messages).trim()
    if (isClosingOrGratitudeMessage(latestRawUserText)) {
      const custLang = await getContactLanguage(db, accountId, contactId).catch(() => null)
      const isHinglish = isHinglishClosing(latestRawUserText, custLang)
      const replyText = isHinglish ? CLOSING_REPLY_HINGLISH : CLOSING_REPLY_ENGLISH

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: replyText,
        aiGenerated: true,
      })
      return
    }

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Every gate has passed — we're committed to attempting a reply, so
    // show the customer "typing…" (and mark their message read) while the
    // retrieval + LLM round trips run. Meta clears the indicator after
    // 25 s or when our reply lands, whichever is first, so there's
    // nothing to undo on the handoff / no-text path. Strictly
    // best-effort: a failed indicator must never cost us the reply.
    if (inboundMessageId) {
      await showTypingIndicator(db, accountId, inboundMessageId)
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages),
    )

    // Ground the reply in the account's live inventory catalog (best-effort).
    const inventoryContext = await retrieveInventoryContext(
      db,
      accountId,
      latestUserMessage(messages),
      messages,
    )

    const languageInstruction =
      'CRITICAL COMMUNICATION RULES — BEST AUTO PARTS (KAILASHPUR, SAHARANPUR):\n' +
      '1. Language & Tone: Reply in clear, polite, and professional English (or warm Romanized Hinglish if customer speaks Hindi). Use ₹0 session text.\n' +
      '2. Inventory Accuracy: Best Auto Parts deals exclusively in genuine & aftermarket two-wheeler spare parts for Bajaj, Hero, and Honda motorcycles and scooters. Keep live stock/price lookups and Genuine vs. Local matching active. Quote exact Part Name, Brand (Genuine OEM or Aftermarket), OEM Number, Live Selling Price (₹), and Availability (In Stock ✅ or Limited Stock ⚠️).\n' +
      '3. Strict Stock Privacy: Never disclose internal numerical stock counts, units remaining, warehouse bin locations, or cost prices.\n' +
      '4. ONLINE SERVICES RULES (ITR, INSURANCE, RTO ROAD TAX, BORDER TAX, E-CHALLAN):\n' +
      '   For free-form customer questions on online services, NEVER guess, fabricate, or invent government tax amounts, challan fines, or insurance premiums under any circumstances.\n' +
      '   When a customer is in an active online service chat and has not shared these short details yet (or has not submitted the /apply form), politely ask for them at the end of your guidance:\n' +
      '   - Annual ITR Filing: Ask for (1) Service (Salaried) vs. Self-Employed / Business, (2) Approx Annual Income / Turnover, and (3) Full Name / PAN.\n' +
      '   - Vehicle Insurance: Ask for (1) Vehicle Type (Two-Wheeler / Car / Commercial), (2) Policy Type (Third-Party vs. Comprehensive), (3) RC Valid Upto Date, and (4) Previous Insurance Expiry Date.\n' +
      '   - RTO Road Tax: Ask for (1) Vehicle Number, (2) RC Valid Upto Date, and (3) Tax Period (Quarterly / Annual / One-Time).\n' +
      '   - State Border Tax: Ask for (1) Vehicle Number, (2) Entry State, (3) RC Valid Upto Date, and (4) Entry Date & Duration.\n' +
      '   - E-Challan: Ask for (1) Vehicle Number, and (2) Last 5 digits of Chassis/Engine number.\n' +
      '   Always keep guidance locked to the active service and route final quotes to Saud Khan (+91 96347 22174).\n' +
      '5. Mechanic Partner Desk: Highlight priority packing, dedicated Mechanic Khata ledger tracking, loyalty benefits, and occasional gifts. Strictly NEVER mention or offer wholesale rates.\n' +
      '6. Selective Customer Care: Append "📞 Call Customer Care: *9634722174*" (Saud Bhai) ONLY for online services quotes, out-of-stock/special orders, location cards, or after-hours notices; never append to routine price/stock replies.\n' +
      '7. Closing Courtesy: When a customer sends a closing or gratitude message (such as ok, okay, thanks, thank you, thx, shukriya, dhanyawad, ji, theek hai, achha, nice, done, or 👍), NEVER trigger a fallback or handoff error, never output or repeat a store menu, and reply warmly and concisely with: ' +
      'For English: "You\'re most welcome! 😊 Please feel free to message anytime if you need help with Spare Parts, ITR, Insurance, or RTO Tax/Challan. — *Best Auto Parts* (+91 96347 22174)" ' +
      'For Hinglish: "Aapka bahut-bahut shukriya! 😊 Spare Parts, ITR, Insurance ya RTO Tax/Challan me koi bhi madad chahiye ho toh aap jab chahein message kar sakte hain. — *Best Auto Parts* (+91 96347 22174)"';

    const lockedContext = detectLockedSubService(messages);
    if (lockedContext) {
      const serviceMapping: Record<string, ServiceType> = {
        'Annual ITR Filing': 'ITR',
        'Vehicle Insurance': 'Vehicle Insurance',
        'RTO Road Tax': 'RTO Road Tax',
        'State Border Tax': 'State Border Tax',
        'E-Challan Service': 'E-Challan',
      };
      const st = serviceMapping[lockedContext.service];
      if (st) {
        try {
          const { data: contact } = await db
            .from('contacts')
            .select('name, phone, phone_normalized')
            .eq('id', contactId)
            .maybeSingle();

          const phone = contact?.phone || contact?.phone_normalized;
          if (phone) {
            await syncServiceCaseFromChat({
              phone,
              customerName: contact?.name,
              serviceType: st,
              messageText: latestRawUserText,
              accountId,
              db,
            });
          }
        } catch (syncErr) {
          console.warn('[ai auto-reply] sync service case notice:', syncErr);
        }
      }
    }
    const lockedInstruction = lockedContext
      ? `\n\n8. ACTIVE LOCKED SUB-SERVICE:\n${lockedContext.guideline}\nDo not mix services or switch to other unrelated categories unless the customer explicitly asks to change.`
      : '';

    const effectiveUserPrompt = [
      config.systemPrompt,
      languageInstruction + lockedInstruction,
    ]
      .filter(Boolean)
      .join('\n\n')

    const systemPrompt = buildSystemPrompt({
      userPrompt: effectiveUserPrompt,
      mode: 'auto_reply',
      knowledge,
      inventoryContext,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      await db
        .from('conversations')
        .update({ ai_autoreply_disabled: true, ai_handoff_summary: summary })
        .eq('id', conversationId)
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId) {
        await db
          .from('conversations')
          .update({ assigned_agent_id: config.handoffAgentId })
          .eq('id', conversationId)
          .is('assigned_agent_id', null)
      }
      return
    }

    if (
      inboundMessageId &&
      (await hasNewerInbound(db, conversationId, inboundMessageId))
    ) {
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return

    const isInventoryInquiry =
      typeof hasInventoryIntent === 'function' &&
      hasInventoryIntent(latestUserMessage(messages))

    if (isInventoryInquiry && typeof engineSendInteractiveButtons === 'function') {
      try {
        const custLang = await getContactLanguage(db, accountId, contactId).catch(() => null)
        const isHinglish = custLang === 'hinglish'
        await engineSendInteractiveButtons({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          bodyText: sanitizeCustomerStockPrivacy(text),
          buttons: isHinglish
            ? [
                { id: 'BUY_NOW', title: 'Kharidna Hai' },
                { id: 'BUY_EXPLORING', title: 'Abhi Dekh Raha Hoon' },
              ]
            : [
                { id: 'BUY_NOW', title: 'Buy Now' },
                { id: 'BUY_EXPLORING', title: 'Just Exploring' },
              ],
        })
        return
      } catch (btnErr) {
        console.warn(
          '[ai auto-reply] failed sending interactive buttons, falling back to text:',
          btnErr,
        )
      }
    }

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: sanitizeCustomerStockPrivacy(text),
      aiGenerated: true,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

async function hasNewerInbound(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
  inboundMessageId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('messages')
    .select('message_id')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return false
  return data[0].message_id !== inboundMessageId
}

/**
 * Best-effort "typing…" for the inbound we're about to answer. Swallows
 * every failure (no WhatsApp config, bad token, Meta 4xx) with a warning
 * — the indicator is cosmetic, the reply is not.
 */
async function showTypingIndicator(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = await loadAccountMetaCredentials(
      db,
      accountId,
    )
    await sendTypingIndicator({
      phoneNumberId,
      accessToken,
      messageId: inboundMessageId,
    })
  } catch (err) {
    console.warn('[ai auto-reply] typing indicator failed (continuing):', err)
  }
}
