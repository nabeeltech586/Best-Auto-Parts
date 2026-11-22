import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';
import { addContactTagIfAbsent } from '@/lib/contacts/tag-write';

export interface IcebreakerDef {
  id: string;
  name: string;
  buttonTitle: string;
  keywords: string[];
  responseTemplate: string;
}

export const META_ICEBREAKERS: Record<string, IcebreakerDef> = {
  rate_check: {
    id: 'icebreaker_1_rate_check',
    name: 'Genuine & Local Parts Rate Check',
    buttonTitle: 'Genuine & Local Parts Rate Check',
    keywords: [
      'genuine & local parts rate check',
      'rate check',
      'genuine & local parts',
      'genuine and local parts',
      'parts rate check',
      'rate',
      'price check',
      'bhav check',
      'rate list',
    ],
    responseTemplate:
      'Welcome to *Best Auto Parts*! 🏍️\n\n' +
      'Please share your motorcycle model (Bajaj, Hero, or Honda) along with the spare part name, OEM number, or a photo — our AI assistant will check live stock and send you the exact price (₹) right away.',
  },
  shop_location: {
    id: 'icebreaker_2_shop_location',
    name: 'Shop Location, & Timing Hours',
    buttonTitle: 'Shop Location, & Timing Hours',
    keywords: [
      'shop location, & timing hours',
      'shop location',
      'timing hours',
      'location',
      'address',
      'dukan kahan hai',
      'timing',
      'opening hours',
      'store hours',
    ],
    responseTemplate:
      '📍 *Store Location & Business Hours — Best Auto Parts* 🏍️\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '• *Store:* Best Auto Parts\n' +
      '• *Address:* Kailashpur, Saharanpur, Uttar Pradesh 247001, India\n' +
      '• *Business Hours:* Daily 9:00 AM – 9:00 PM\n' +
      '  _(Friday Prayer Break: 12:30 PM – 2:30 PM)_\n' +
      '• *Helpline / WhatsApp:* +91 96347 22174 (Saud Bhai)\n\n' +
      '🗺️ *Google Maps:* https://maps.google.com/?q=Best+Auto+Parts+Kailashpur+Saharanpur+Uttar+Pradesh+247001\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Visit our shop for genuine OEM and high-durability aftermarket two-wheeler spares!',
  },
  wholesale_rate: {
    id: 'icebreaker_3_wholesale_mechanic',
    name: 'Mechanic / Wholesale Rate',
    buttonTitle: 'Mechanic / Wholesale Rate',
    keywords: [
      'mechanic / wholesale rate',
      'mechanic',
      'wholesale',
      'bulk order',
      'wholesale rate',
      'mechanic rate',
      'bulk purchase',
      'retailer',
      'dealer rate',
    ],
    responseTemplate:
      'Welcome Partner! 🔧 Your account has been tagged under *Mechanic / Wholesale*.\n\n' +
      'Please send your bulk spare parts list (text or photo) — we will verify live stock and share our best wholesale quote (₹) along with a direct PhonePe payment link.',
  },
  saud_bhai_call: {
    id: 'icebreaker_4_saud_bhai_call',
    name: 'Saud Bhai se Direct Call / Baat Karein',
    buttonTitle: 'Saud Bhai se Direct Call / Baat Karein',
    keywords: [
      'saud bhai se direct call / baat karein',
      'saud bhai',
      'direct call',
      'baat karein',
      'call saud',
      'talk to saud',
      'human agent',
      'speak with owner',
      'call karein',
    ],
    responseTemplate:
      'Certainly! You are now being connected to *Saud Bhai* (+91 96347 22174) for a direct chat or call. ' +
      'Please share your query, motorcycle model, or part details right here in the chat so he can assist you immediately, or call +91 96347 22174 directly for urgent help.',
  },
};

/**
 * Normalizes input text and checks whether it matches any of the 4 Meta Icebreakers.
 */
export function matchIcebreaker(
  rawText: string,
  interactiveReplyId?: string | null
): IcebreakerDef | null {
  const normId = (interactiveReplyId || '').trim().toLowerCase();
  const normText = (rawText || '').trim().toLowerCase();

  for (const item of Object.values(META_ICEBREAKERS)) {
    // 1. Direct ID match (from button / interactive tap)
    if (normId && normId === item.id.toLowerCase()) {
      return item;
    }
    if (normId && item.keywords.some((kw) => normId.includes(kw))) {
      return item;
    }

    // 2. Exact or substring match against text body
    if (normText) {
      if (normText === item.buttonTitle.toLowerCase()) {
        return item;
      }
      for (const kw of item.keywords) {
        if (normText.includes(kw)) {
          return item;
        }
      }
    }
  }

  return null;
}

export interface HandleIcebreakerInput {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  inboundText: string;
  interactiveReplyId?: string | null;
}

export interface HandleIcebreakerResult {
  handled: boolean;
  icebreakerId?: string;
  responseSent?: string;
  whatsappMessageId?: string;
}

/**
 * Executes the tailored actions for the matched Meta WhatsApp Icebreaker.
 */
export async function executeIcebreaker(
  input: HandleIcebreakerInput
): Promise<HandleIcebreakerResult> {
  const { db, accountId, userId, conversationId, contactId, inboundText, interactiveReplyId } =
    input;

  const matched = matchIcebreaker(inboundText, interactiveReplyId);
  if (!matched) {
    return { handled: false };
  }

  // 1. Icebreaker 1: Genuine & Local Parts Rate Check
  if (matched.id === META_ICEBREAKERS.rate_check.id) {
    // Re-enable AI agent and reset human handoff
    try {
      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: false,
          assigned_agent_id: null,
          ai_handoff_summary: null,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);

      // Set preferred language to English
      await db
        .from('contacts')
        .update({ preferred_language: 'en' })
        .eq('id', contactId)
        .eq('account_id', accountId);
    } catch {
      // best-effort
    }

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: matched.responseTemplate,
    });

    return {
      handled: true,
      icebreakerId: matched.id,
      responseSent: matched.responseTemplate,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  }

  // 2. Icebreaker 2: Shop Location & Timing Hours
  if (matched.id === META_ICEBREAKERS.shop_location.id) {
    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: matched.responseTemplate,
    });

    return {
      handled: true,
      icebreakerId: matched.id,
      responseSent: matched.responseTemplate,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  }

  // 3. Icebreaker 3: Mechanic / Wholesale Rate
  if (matched.id === META_ICEBREAKERS.wholesale_rate.id) {
    // Auto-tag contact as "Wholesale / Mechanic"
    try {
      let { data: tag } = await db
        .from('tags')
        .select('id')
        .eq('account_id', accountId)
        .ilike('name', 'Wholesale / Mechanic')
        .maybeSingle();

      if (!tag) {
        const { data: newTag } = await db
          .from('tags')
          .insert({
            account_id: accountId,
            name: 'Wholesale / Mechanic',
            color: '#10B981',
          })
          .select('id')
          .single();
        tag = newTag;
      }

      if (tag?.id) {
        await addContactTagIfAbsent(db, {
          accountId,
          contactId,
          tagId: tag.id,
        });
      }

      // Ensure AI agent is enabled for bulk order list parsing
      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: false,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);
    } catch (err) {
      console.warn('[icebreaker] wholesale tagging notice:', err);
    }

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: matched.responseTemplate,
    });

    return {
      handled: true,
      icebreakerId: matched.id,
      responseSent: matched.responseTemplate,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  }

  // 4. Icebreaker 4: Saud Bhai se Direct Call / Baat Karein
  if (matched.id === META_ICEBREAKERS.saud_bhai_call.id) {
    // Pause AI auto-reply (human takeover)
    try {
      await db
        .from('conversations')
        .update({
          ai_autoreply_disabled: true,
          ai_handoff_summary: 'Customer requested direct call/chat with Saud Bhai.',
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);

      // Create an alert notification for the store owner / agents
      const { data: ownerUser } = await db
        .from('accounts')
        .select('owner_user_id')
        .eq('id', accountId)
        .maybeSingle();

      const notifyUserId = ownerUser?.owner_user_id || userId;
      if (notifyUserId) {
        await db.from('notifications').insert({
          account_id: accountId,
          user_id: notifyUserId,
          type: 'conversation_assigned',
          conversation_id: conversationId,
          contact_id: contactId,
          title: '🚨 Urgent: Direct Call Request (Saud Bhai)',
          body: 'A customer tapped "Saud Bhai se Direct Call / Baat Karein" and is waiting for direct assistance.',
        });
      }
    } catch (err) {
      console.warn('[icebreaker] human handoff update notice:', err);
    }

    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: matched.responseTemplate,
    });

    return {
      handled: true,
      icebreakerId: matched.id,
      responseSent: matched.responseTemplate,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  }

  return { handled: false };
}
