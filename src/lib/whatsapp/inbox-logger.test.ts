import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizePhone10,
  normalizePhone91,
  normalizePhoneE164,
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from './inbox-logger';

describe('inbox-logger phone normalization', () => {
  it('normalizes 10-digit Indian numbers from various input formats', () => {
    expect(normalizePhone10('9761224004')).toBe('9761224004');
    expect(normalizePhone10('+91 97612 24004')).toBe('9761224004');
    expect(normalizePhone10('+919761224004')).toBe('9761224004');
    expect(normalizePhone10('09761224004')).toBe('9761224004');
    expect(normalizePhone10('919761224004')).toBe('9761224004');
    expect(normalizePhone10('')).toBe('');
    expect(normalizePhone10(null)).toBe('');
  });

  it('generates 91XXXXXXXXXX Meta format correctly', () => {
    expect(normalizePhone91('+91 97612-24004')).toBe('919761224004');
    expect(normalizePhone91('9761224004')).toBe('919761224004');
    expect(normalizePhone91('+919634722174')).toBe('919634722174');
  });

  it('generates +91XXXXXXXXXX E.164 format correctly', () => {
    expect(normalizePhoneE164('9761224004')).toBe('+919761224004');
    expect(normalizePhoneE164('919761224004')).toBe('+919761224004');
  });
});

describe('findOrCreateContactAndConversation', () => {
  const fakeAccountId = '11111111-1111-4111-8111-111111111111';
  const fakeUserId = '22222222-2222-4222-8222-222222222222';
  const fakeContactId = '33333333-3333-4333-8333-333333333333';
  const fakeConvId = '44444444-4444-4444-8444-444444444444';

  it('returns existing contact and conversation without duplicates', async () => {
    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: fakeContactId,
                  name: 'NABEEL PATHAN',
                  company: 'NABEEL PATHAN',
                  category: 'Wholesaler',
                  user_id: fakeUserId,
                  phone: '+919761224004',
                  phone_normalized: '919761224004',
                },
              ],
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: fakeConvId }],
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    const res = await findOrCreateContactAndConversation(mockSupabase, {
      accountId: fakeAccountId,
      phone: '+919761224004',
      name: 'NABEEL PATHAN',
      category: 'Wholesaler',
      company: 'NABEEL PATHAN',
    });

    expect(res.success).toBe(true);
    expect(res.contactId).toBe(fakeContactId);
    expect(res.conversationId).toBe(fakeConvId);
    expect(res.phone10).toBe('9761224004');
    expect(res.normalizedPhone).toBe('919761224004');
    expect(res.isNewContact).toBe(false);
  });

  it('creates new contact and conversation when contact does not exist', async () => {
    let insertedContact: any = null;
    let insertedConv: any = null;

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'contacts') {
          return {
            select: vi.fn((cols: string) => {
              if (cols === 'user_id') {
                return {
                  eq: vi.fn().mockReturnThis(),
                  not: vi.fn().mockReturnThis(),
                  limit: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: fakeUserId } }),
                };
              }
              if (cols === 'unique_code') {
                return {
                  eq: vi.fn().mockReturnThis(),
                  ilike: vi.fn().mockResolvedValue({ data: [{ unique_code: 'BAP-DIS-001' }] }),
                };
              }
              return {
                or: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
            insert: vi.fn((payload) => {
              insertedContact = payload;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: fakeContactId,
                    name: payload.name,
                    category: payload.category,
                    user_id: payload.user_id,
                  },
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((payload) => {
              insertedConv = payload;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: { id: fakeConvId },
                  error: null,
                }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const res = await findOrCreateContactAndConversation(mockSupabase, {
      accountId: fakeAccountId,
      phone: '9897123456',
      name: 'PAL AGENCY',
      category: 'Distributor',
      company: 'PAL AGENCY',
    });

    expect(res.success).toBe(true);
    expect(res.contactId).toBe(fakeContactId);
    expect(res.conversationId).toBe(fakeConvId);
    expect(res.isNewContact).toBe(true);
    expect(insertedContact).not.toBeNull();
    expect(insertedContact.phone).toBe('+919897123456');
    expect(insertedConv).not.toBeNull();
    expect(insertedConv.contact_id).toBe(fakeContactId);
  });
});

describe('logOutboundMessageToInbox', () => {
  it('inserts into messages table and updates conversations with snippet and timestamp', async () => {
    let msgInsert: any = null;
    let convUpdate: any = null;
    const fakeConvId = '44444444-4444-4444-8444-444444444444';

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return {
            insert: vi.fn((payload) => {
              msgInsert = payload;
              return {
                select: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'msg-uuid-123' }, error: null }),
              };
            }),
          };
        }
        if (table === 'conversations') {
          return {
            update: vi.fn((payload) => {
              convUpdate = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const result = await logOutboundMessageToInbox(mockSupabase, {
      conversationId: fakeConvId,
      contentText: '📦 Purchase Order #PO-2026-006 dispatched to NABEEL PATHAN.',
      previewTitle: '📦 PO #PO-2026-006 (25 pcs) — NABEEL PATHAN',
      contentType: 'template',
      templateName: 'distributor_purchase_order',
      messageId: 'wamid.HBgMOTE5NzYxMjI0MDA0FQIAERgSRjQ1NkRGNkIwRUE2QkIyQUEzAA==',
      status: 'sent',
    });

    expect(result.success).toBe(true);
    expect(result.messageRowId).toBe('msg-uuid-123');
    expect(msgInsert.conversation_id).toBe(fakeConvId);
    expect(msgInsert.sender_type).toBe('agent');
    expect(msgInsert.content_type).toBe('template');
    expect(msgInsert.template_name).toBe('distributor_purchase_order');
    expect(msgInsert.status).toBe('sent');
    expect(convUpdate.status).toBe('open');
    expect(convUpdate.last_message_text).toBe('📦 PO #PO-2026-006 (25 pcs) — NABEEL PATHAN');
    expect(convUpdate.last_message_at).toBeDefined();
    expect(convUpdate.last_reply_at).toBeDefined();
  });
});
