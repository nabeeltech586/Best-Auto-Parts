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
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { triggerMatches } from '@/lib/automations/engine'
import { isWithinTimeWindow } from '@/lib/automations/time-of-day'
import type { Automation, ConditionStepConfig } from '@/types'

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
      'CRITICAL: All customer-facing WhatsApp messages, quotes, and receipts must be in clean, professional English, regardless of whether the customer asked in English, Hindi, or Hinglish. ' +
      'When quoting a verified spare part from the catalog, state the exact Part Name, Brand (Genuine OEM or Aftermarket), OEM Number, Live Selling Price (formatted with ₹), and In-Stock status (In Stock ✅). ' +
      'Never disclose internal numerical stock quantities, warehouse bin locations, or cost prices. Offer a direct PhonePe payment link if they would like to place an order.'

    const effectiveUserPrompt = [config.systemPrompt, languageInstruction]
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
