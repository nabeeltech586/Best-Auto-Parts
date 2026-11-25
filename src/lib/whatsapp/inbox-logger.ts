import type { SupabaseClient } from '@supabase/supabase-js';
import { generateNextUniqueCode } from '@/lib/contacts/unique-code';

/**
 * Normalizes phone numbers to standard 10-digit Indian mobile format
 * by stripping all non-digits and taking the trailing 10 digits.
 */
export function normalizePhone10(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Normalizes phone number to 91XXXXXXXXXX format required by Meta WhatsApp API.
 */
export function normalizePhone91(phone: string | null | undefined): string {
  const p10 = normalizePhone10(phone);
  return p10 ? `91${p10}` : '';
}

/**
 * Normalizes phone number to E.164 (+91XXXXXXXXXX) format.
 */
export function normalizePhoneE164(phone: string | null | undefined): string {
  const p10 = normalizePhone10(phone);
  return p10 ? `+91${p10}` : '';
}

export interface ResolveContactAndConversationParams {
  accountId?: string | null;
  phone: string;
  name?: string | null;
  category?: 'Distributor' | 'Wholesaler' | 'Mechanic' | 'Customer' | string;
  company?: string | null;
}

export interface ResolveContactAndConversationResult {
  success: boolean;
  contactId?: string;
  conversationId?: string;
  phone10?: string;
  normalizedPhone?: string;
  e164Phone?: string;
  isNewContact?: boolean;
  error?: string;
}

/**
 * Resolves or creates matching contact and conversation records in Supabase.
 * Ensures consistent phone lookup across 91..., +91..., and 10-digit variants
 * so messages for the same person/wholesaler map to the exact same thread.
 */
export async function findOrCreateContactAndConversation(
  supabase: SupabaseClient,
  params: {
    accountId?: string | null;
    phone: string;
    name?: string | null;
    category?: 'Distributor' | 'Wholesaler' | 'Mechanic' | 'Customer' | string;
    company?: string | null;
  }
): Promise<ResolveContactAndConversationResult> {
  const { phone, name, category, company } = params;

  const phone10 = normalizePhone10(phone);
  if (!phone10 || phone10.length !== 10) {
    return {
      success: false,
      error: 'Valid 10-digit mobile number required',
    };
  }

  const normalized91 = `91${phone10}`;
  const e164 = `+91${phone10}`;

  // 1. Resolve Account ID
  let accountId = params.accountId || null;
  if (!accountId) {
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('account_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    accountId = config?.account_id || null;
  }

  if (!accountId) {
    const { data: acc } = await supabase
      .from('accounts')
      .select('id')
      .limit(1)
      .maybeSingle();
    accountId = acc?.id || null;
  }

  // 2. Lookup existing contact across phone number variants
  let contactQuery = supabase
    .from('contacts')
    .select('id, name, company, category, user_id, phone, phone_normalized')
    .or(
      `phone.eq.${normalized91},phone.eq.${e164},phone_normalized.eq.${normalized91},phone_normalized.eq.${phone10},phone.ilike.%${phone10}%`
    );

  if (accountId) {
    contactQuery = contactQuery.eq('account_id', accountId);
  }

  const { data: existingContacts, error: contactLookupErr } = await contactQuery.limit(2);

  if (contactLookupErr) {
    console.warn('[inbox-logger] Contact lookup warning:', contactLookupErr.message);
  }

  let contact = existingContacts?.[0] || null;
  let isNewContact = false;

  // 3. If contact found, enrich missing company/category if provided
  if (contact) {
    const updates: Record<string, unknown> = {};
    if (company && !contact.company) {
      updates.company = company;
    }
    if (
      category &&
      (!contact.category || contact.category === 'Customer') &&
      category !== 'Customer'
    ) {
      updates.category = category;
    }
    if (name && (!contact.name || contact.name === phone10 || contact.name.startsWith('Contact '))) {
      updates.name = name;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await supabase.from('contacts').update(updates).eq('id', contact.id);
    }
  } else {
    // 4. Contact does not exist: create new contact row
    isNewContact = true;

    // Resolve an audit user_id for NOT NULL constraint
    let userId: string | null = null;
    if (accountId) {
      const { data: sampleContact } = await supabase
        .from('contacts')
        .select('user_id')
        .eq('account_id', accountId)
        .not('user_id', 'is', null)
        .limit(1)
        .maybeSingle();
      userId = sampleContact?.user_id || null;

      if (!userId) {
        const { data: cfg } = await supabase
          .from('whatsapp_config')
          .select('user_id')
          .eq('account_id', accountId)
          .maybeSingle();
        userId = cfg?.user_id || null;
      }

      if (!userId) {
        const { data: acc } = await supabase
          .from('accounts')
          .select('owner_user_id')
          .eq('id', accountId)
          .maybeSingle();
        userId = acc?.owner_user_id || null;
      }
    }

    const uniqueCode = accountId
      ? await generateNextUniqueCode(supabase, accountId, category)
      : undefined;

    const insertPayload: Record<string, unknown> = {
      phone: e164,
      name: (name || company || `Contact ${phone10}`).trim(),
      category: category || 'Customer',
    };

    if (accountId) insertPayload.account_id = accountId;
    if (userId) insertPayload.user_id = userId;
    if (company) insertPayload.company = company.trim();
    if (uniqueCode) insertPayload.unique_code = uniqueCode;

    const { data: createdContact, error: createErr } = await supabase
      .from('contacts')
      .insert(insertPayload)
      .select('id, name, company, category, user_id, phone, phone_normalized')
      .single();

    if (createErr || !createdContact) {
      // Handle unique violation race condition (SQLSTATE 23505)
      const isUniqueViol =
        createErr &&
        typeof createErr === 'object' &&
        'code' in createErr &&
        createErr.code === '23505';

      if (isUniqueViol) {
        const { data: racedContacts } = await contactQuery.limit(1);
        contact = racedContacts?.[0] || null;
        isNewContact = false;
      } else {
        console.error('[inbox-logger] Failed to insert contact:', createErr);
        return {
          success: false,
          error: createErr?.message || 'Failed to create contact record',
        };
      }
    } else {
      contact = createdContact;
    }
  }

  if (!contact || !contact.id) {
    return {
      success: false,
      error: 'Unable to resolve or create contact row',
    };
  }

  // 5. Find or create Conversation row
  let convQuery = supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', contact.id);

  if (accountId) {
    convQuery = convQuery.eq('account_id', accountId);
  }

  const { data: existingConvs, error: convLookupErr } = await convQuery
    .order('created_at', { ascending: true })
    .limit(1);

  if (convLookupErr) {
    console.warn('[inbox-logger] Conversation lookup warning:', convLookupErr.message);
  }

  let conversationId = existingConvs?.[0]?.id || null;

  if (!conversationId) {
    const convPayload: Record<string, unknown> = {
      contact_id: contact.id,
      status: 'open',
    };
    if (accountId) convPayload.account_id = accountId;
    if (contact.user_id) convPayload.user_id = contact.user_id;

    const { data: newConv, error: createConvErr } = await supabase
      .from('conversations')
      .insert(convPayload)
      .select('id')
      .single();

    if (createConvErr || !newConv) {
      // In case of unique violation or concurrent insert race
      const { data: racedConvs } = await convQuery.limit(1);
      conversationId = racedConvs?.[0]?.id || null;
      if (!conversationId) {
        console.error('[inbox-logger] Failed to create conversation:', createConvErr);
        return {
          success: false,
          error: createConvErr?.message || 'Failed to create conversation record',
        };
      }
    } else {
      conversationId = newConv.id;
    }
  }

  return {
    success: true,
    contactId: contact.id,
    conversationId,
    phone10,
    normalizedPhone: normalized91,
    e164Phone: e164,
    isNewContact,
  };
}

export interface LogOutboundMessageParams {
  conversationId: string;
  contentText: string;
  previewTitle?: string;
  contentType?: 'text' | 'template';
  templateName?: string | null;
  messageId?: string | null;
  status?: 'sent' | 'delivered' | 'failed';
}

/**
 * Inserts an outbound message into `messages` and updates `conversations`
 * with `last_message_text`, `last_message_at`, and `last_reply_at`.
 */
export async function logOutboundMessageToInbox(
  supabase: SupabaseClient,
  params: LogOutboundMessageParams
): Promise<{ success: boolean; messageRowId?: string; error?: string }> {
  const {
    conversationId,
    contentText,
    previewTitle,
    contentType = 'text',
    templateName = null,
    messageId = null,
    status = 'sent',
  } = params;

  const nowIso = new Date().toISOString();
  const metaMessageId = messageId || `wamid_${Date.now()}`;
  const snippet = (previewTitle || contentText).slice(0, 150).trim();

  try {
    const { data: msgRow, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: contentType,
        content_text: contentText,
        template_name: templateName,
        message_id: metaMessageId,
        status,
        created_at: nowIso,
      })
      .select('id')
      .maybeSingle();

    if (msgErr) {
      console.warn('[inbox-logger] Error inserting message:', msgErr.message);
    }

    await supabase
      .from('conversations')
      .update({
        last_message_text: snippet,
        last_message_at: nowIso,
        last_reply_at: nowIso,
        status: 'open',
      })
      .eq('id', conversationId);

    return {
      success: true,
      messageRowId: msgRow?.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[inbox-logger] Unexpected error logging to inbox:', msg);
    return {
      success: false,
      error: msg,
    };
  }
}
