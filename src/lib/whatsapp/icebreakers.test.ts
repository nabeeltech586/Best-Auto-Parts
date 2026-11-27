import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchIcebreaker,
  isGreetingMessage,
  executeIcebreaker,
  sendGreetingMenu,
  META_ICEBREAKERS,
} from './icebreakers';

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.123' }),
  engineSendInteractiveButtons: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.btn123' }),
}));

vi.mock('@/lib/contacts/tag-write', () => ({
  addContactTagIfAbsent: vi.fn().mockResolvedValue(true),
}));

describe('Icebreakers & Slash Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGreetingMessage', () => {
    it('matches common generic greetings', () => {
      expect(isGreetingMessage('hi')).toBe(true);
      expect(isGreetingMessage('Hello!')).toBe(true);
      expect(isGreetingMessage('Salam')).toBe(true);
      expect(isGreetingMessage('Assalamu Alaikum')).toBe(true);
      expect(isGreetingMessage('menu')).toBe(true);
      expect(isGreetingMessage('Namaste')).toBe(true);
    });

    it('does not match non-greeting queries', () => {
      expect(isGreetingMessage('Need Pulsar 150 brake shoes')).toBe(false);
      expect(isGreetingMessage('/parts')).toBe(false);
      expect(isGreetingMessage('/itr')).toBe(false);
    });
  });

  describe('matchIcebreaker & Slash Commands', () => {
    it('matches /parts and rate check keywords', () => {
      const match1 = matchIcebreaker('/parts');
      expect(match1?.id).toBe(META_ICEBREAKERS.rate_check.id);
      expect(match1?.responseTemplate).toContain('Best Auto Parts');
      expect(match1?.responseTemplate).toContain('Bike Brand & Model');

      const matchBtn = matchIcebreaker('', 'btn_spare_parts');
      expect(matchBtn?.id).toBe(META_ICEBREAKERS.rate_check.id);
    });

    it('matches /itr and ITR/insurance keywords', () => {
      const match1 = matchIcebreaker('/itr');
      expect(match1?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
      expect(match1?.responseTemplate).toContain('Vehicle Insurance');
      expect(match1?.responseTemplate).toContain('Saud Khan (+91 96347 22174)');

      const matchBtn = matchIcebreaker('', 'btn_itr_insurance');
      expect(matchBtn?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
    });

    it('matches /rto and road tax / challan keywords', () => {
      const match1 = matchIcebreaker('/rto');
      expect(match1?.id).toBe(META_ICEBREAKERS.rto_tax.id);
      expect(match1?.responseTemplate).toContain('RTO Road Tax, E-Challan');
      expect(match1?.responseTemplate).toContain('Saud Khan (+91 96347 22174)');

      const matchBtn = matchIcebreaker('', 'btn_rto_tax');
      expect(matchBtn?.id).toBe(META_ICEBREAKERS.rto_tax.id);
    });

    it('matches /mechanic and mechanic desk keywords', () => {
      const match1 = matchIcebreaker('/mechanic');
      expect(match1?.id).toBe(META_ICEBREAKERS.mechanic_desk.id);
      expect(match1?.responseTemplate).toContain('Mechanic Partner Desk');
      expect(match1?.responseTemplate).toContain('Kailashpur, Dehradun Road');
    });

    it('matches /location and store location keywords', () => {
      const match1 = matchIcebreaker('/location');
      expect(match1?.id).toBe(META_ICEBREAKERS.location.id);
      expect(match1?.responseTemplate).toContain('Store Location & Timings');
      expect(match1?.responseTemplate).toContain('Uttar Pradesh 247001');
    });

    it('matches /catalog and digital catalog keywords', () => {
      const match1 = matchIcebreaker('/catalog');
      expect(match1?.id).toBe(META_ICEBREAKERS.catalog.id);
      expect(match1?.responseTemplate).toContain('WhatsApp Digital Catalog');
      expect(match1?.responseTemplate).toContain('wa.me/c/919634722174');
    });
  });

  describe('executeIcebreaker', () => {
    const mockDb = {
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'tag-1' } }),
      })),
    } as any;

    it('dispatches 3-button greeting menu on generic greeting', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: 'Hello',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe('greeting_menu');
      expect(res.whatsappMessageId).toBe('wamid.btn123');
    });

    it('dispatches deterministic response for /parts', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '/parts',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe('icebreaker_1_rate_check');
      expect(res.responseSent).toContain('Best Auto Parts');
      expect(res.whatsappMessageId).toBe('wamid.123');
    });
  });
});
