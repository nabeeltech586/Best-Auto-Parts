import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchIcebreaker,
  isGreetingMessage,
  executeIcebreaker,
  sendGreetingMenu,
  META_ICEBREAKERS,
  SUB_BUTTONS,
} from './icebreakers';
import { detectLockedSubService } from '@/lib/ai/auto-reply';

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.text123' }),
  engineSendInteractiveButtons: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.btn123' }),
}));

vi.mock('@/lib/contacts/tag-write', () => ({
  addContactTagIfAbsent: vi.fn().mockResolvedValue(true),
}));

describe('Icebreakers, Sub-Menus & Slash Commands', () => {
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
      expect(match1?.isSubMenu).toBe(true);

      const matchBtn = matchIcebreaker('', 'btn_spare_parts');
      expect(matchBtn?.id).toBe(META_ICEBREAKERS.rate_check.id);
    });

    it('matches /itr and ITR/insurance keywords', () => {
      const match1 = matchIcebreaker('/itr');
      expect(match1?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
      expect(match1?.isSubMenu).toBe(true);

      const matchBtn = matchIcebreaker('', 'btn_itr_insurance');
      expect(matchBtn?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
    });

    it('matches /rto and road tax / challan keywords', () => {
      const match1 = matchIcebreaker('/rto');
      expect(match1?.id).toBe(META_ICEBREAKERS.rto_tax.id);
      expect(match1?.isSubMenu).toBe(true);

      const matchBtn = matchIcebreaker('', 'btn_rto_tax');
      expect(matchBtn?.id).toBe(META_ICEBREAKERS.rto_tax.id);
    });

    it('matches /mechanic and mechanic desk keywords', () => {
      const match1 = matchIcebreaker('/mechanic');
      expect(match1?.id).toBe(META_ICEBREAKERS.mechanic_desk.id);
      expect(match1?.isSubMenu).toBe(true);
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

    it('matches sub-buttons by ID and keywords', () => {
      expect(matchIcebreaker('', 'btn_brand_bajaj')?.id).toBe(SUB_BUTTONS.brand_bajaj.id);
      expect(matchIcebreaker('', 'btn_brand_hero')?.id).toBe(SUB_BUTTONS.brand_hero.id);
      expect(matchIcebreaker('', 'btn_brand_honda')?.id).toBe(SUB_BUTTONS.brand_honda.id);
      expect(matchIcebreaker('', 'btn_service_insurance')?.id).toBe(SUB_BUTTONS.service_insurance.id);
      expect(matchIcebreaker('', 'btn_service_itr')?.id).toBe(SUB_BUTTONS.service_itr.id);
      expect(matchIcebreaker('', 'btn_service_road_tax')?.id).toBe(SUB_BUTTONS.service_road_tax.id);
      expect(matchIcebreaker('', 'btn_service_echallan')?.id).toBe(SUB_BUTTONS.service_echallan.id);
      expect(matchIcebreaker('', 'btn_service_border_tax')?.id).toBe(SUB_BUTTONS.service_border_tax.id);
      expect(matchIcebreaker('', 'btn_mechanic_partner')?.id).toBe(SUB_BUTTONS.mechanic_partner.id);
      expect(matchIcebreaker('', 'btn_shop_location')?.id).toBe(SUB_BUTTONS.shop_location.id);
    });

    it('prioritizes parent icebreakers over single sub-service buttons (legacy and updated)', () => {
      // Updated RTO parent
      const rtoUpdated = matchIcebreaker('🚔 RTO Tax & Challan');
      expect(rtoUpdated?.id).toBe(META_ICEBREAKERS.rto_tax.id);
      expect(rtoUpdated?.isSubMenu).toBe(true);

      // Legacy RTO parent (must NOT fall through to service_road_tax)
      const rtoLegacy = matchIcebreaker('RTO Road Tax, E-Challan & Border Tax Service');
      expect(rtoLegacy?.id).toBe(META_ICEBREAKERS.rto_tax.id);
      expect(rtoLegacy?.isSubMenu).toBe(true);

      // Whitespace and newlines normalization
      const rtoNewlines = matchIcebreaker('RTO Road Tax,\nE-Challan &\nBorder Tax Service');
      expect(rtoNewlines?.id).toBe(META_ICEBREAKERS.rto_tax.id);
      expect(rtoNewlines?.isSubMenu).toBe(true);

      // Updated ITR parent
      const itrUpdated = matchIcebreaker('📄 ITR & Insurance');
      expect(itrUpdated?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
      expect(itrUpdated?.isSubMenu).toBe(true);

      // Legacy ITR parent (must NOT fall through to service_insurance)
      const itrLegacy = matchIcebreaker('Vehicle Insurance & Annual ITR Filing Inquiry');
      expect(itrLegacy?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
      expect(itrLegacy?.isSubMenu).toBe(true);

      // Whitespace and newlines normalization
      const itrNewlines = matchIcebreaker('Vehicle Insurance &\nAnnual ITR Filing Inquiry');
      expect(itrNewlines?.id).toBe(META_ICEBREAKERS.itr_insurance.id);
      expect(itrNewlines?.isSubMenu).toBe(true);

      // Dedicated single sub-service queries still route to their respective sub-button
      expect(matchIcebreaker('Vehicle Insurance')?.id).toBe(SUB_BUTTONS.service_insurance.id);
      expect(matchIcebreaker('Annual ITR Filing')?.id).toBe(SUB_BUTTONS.service_itr.id);
      expect(matchIcebreaker('RTO Road Tax')?.id).toBe(SUB_BUTTONS.service_road_tax.id);
      expect(matchIcebreaker('E-Challan Service')?.id).toBe(SUB_BUTTONS.service_echallan.id);
      expect(matchIcebreaker('State Border Tax')?.id).toBe(SUB_BUTTONS.service_border_tax.id);
    });
  });

  describe('executeIcebreaker', () => {
    const mockDb = {
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { name: 'Nabeel Pathan', phone: '9634722174' },
        }),
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

    it('dispatches 3-button brand sub-menu for /parts', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '/parts',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe(META_ICEBREAKERS.rate_check.id);
      expect(res.responseSent).toContain('Please select your bike brand:');
      expect(res.whatsappMessageId).toBe('wamid.btn123');
    });

    it('dispatches 2-button sub-menu for /itr', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '/itr',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe(META_ICEBREAKERS.itr_insurance.id);
      expect(res.responseSent).toContain('select the service you need help with:');
      expect(res.whatsappMessageId).toBe('wamid.btn123');
    });

    it('dispatches 3-button sub-menu for /rto', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '/rto',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe(META_ICEBREAKERS.rto_tax.id);
      expect(res.responseSent).toContain('select the RTO / Tax service you require:');
      expect(res.whatsappMessageId).toBe('wamid.btn123');
    });

    it('dispatches 2-button sub-menu for /mechanic', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '/mechanic',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe(META_ICEBREAKERS.mechanic_desk.id);
      expect(res.responseSent).toContain('How can we assist you today?');
      expect(res.whatsappMessageId).toBe('wamid.btn123');
    });

    it('dispatches deterministic reply for brand sub-button tap (btn_brand_hero)', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '',
        interactiveReplyId: 'btn_brand_hero',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe('btn_brand_hero');
      expect(res.responseSent).toContain('Hero Spare Parts');
      expect(res.responseSent).toContain('Splendor Plus/Pro');
      expect(res.whatsappMessageId).toBe('wamid.text123');
    });

    it('dispatches deterministic reply and triggers case auto-create for btn_service_insurance', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: '',
        interactiveReplyId: 'btn_service_insurance',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe('btn_service_insurance');
      expect(res.responseSent).toContain('Vehicle Insurance Desk');
      expect(res.responseSent).toContain('Third-Party or Comprehensive');
      expect(res.whatsappMessageId).toBe('wamid.text123');
    });

    it('dispatches deterministic reply and triggers case auto-create for btn_service_echallan', async () => {
      const res = await executeIcebreaker({
        db: mockDb,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: 'UP11AY1234',
        interactiveReplyId: 'btn_service_echallan',
      });

      expect(res.handled).toBe(true);
      expect(res.icebreakerId).toBe('btn_service_echallan');
      expect(res.responseSent).toContain('E-Challan Settlement Service');
      expect(res.responseSent).toContain('Parivahan portal');
      expect(res.whatsappMessageId).toBe('wamid.text123');
    });

    it('dispatches short polite closing reply for acknowledgments (ok, thanks, ji, done) without menus', async () => {
      const closings = ['ok', 'thanks', 'thank you', 'ji', 'done', 'shukriya', 'theek hai'];

      for (const msg of closings) {
        const res = await executeIcebreaker({
          db: mockDb,
          accountId: 'acc-1',
          userId: 'user-1',
          conversationId: 'conv-1',
          contactId: 'contact-1',
          inboundText: msg,
        });

        expect(res.handled).toBe(true);
        expect(res.icebreakerId).toBe('closing_acknowledgment');
        expect(res.whatsappMessageId).toBe('wamid.text123');
        expect(res.responseSent).toContain('+91 96347 22174');
        expect(res.responseSent).toContain('Best Auto Parts');
      }
    });
  });

  describe('detectLockedSubService', () => {
    it('locks AI context onto Hero Spare Parts when customer tapped Hero button', () => {
      const messages = [
        { role: 'user', content: 'btn_brand_hero' },
        { role: 'assistant', content: 'Selected: *Hero Spare Parts*\nPlease share your Bike Model' },
        { role: 'user', content: 'Need clutch plate and chain set for Splendor Plus' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked?.service).toBe('Hero Spare Parts');
      expect(locked?.guideline).toContain('LOCKED ON HERO SPARE PARTS');
    });

    it('locks AI context onto Vehicle Insurance when customer tapped Insurance button', () => {
      const messages = [
        { role: 'user', content: 'btn_service_insurance' },
        { role: 'assistant', content: 'Vehicle Insurance Desk — Best Auto Parts' },
        { role: 'user', content: 'UP11AY4567 Pulsar 150 first party' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked?.service).toBe('Vehicle Insurance');
      expect(locked?.guideline).toContain('LOCKED ON VEHICLE INSURANCE');
      expect(locked?.guideline).toContain('Never guess insurance premiums');
    });

    it('locks AI context onto E-Challan Service when customer tapped Challan button', () => {
      const messages = [
        { role: 'user', content: 'btn_service_echallan' },
        { role: 'assistant', content: 'E-Challan Settlement Service' },
        { role: 'user', content: 'Check my challan for UP11BZ9988' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked?.service).toBe('E-Challan Service');
      expect(locked?.guideline).toContain('LOCKED ON E-CHALLAN SETTLEMENT');
    });

    it('locks AI context onto Annual ITR Filing with short essential details', () => {
      const messages = [
        { role: 'user', content: 'btn_service_itr' },
        { role: 'assistant', content: 'Annual Income Tax Return (ITR) Desk' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked?.service).toBe('Annual ITR Filing');
      expect(locked?.guideline).toContain('LOCKED ON ANNUAL ITR FILING');
      expect(locked?.guideline).toContain('Salaried');
      expect(locked?.guideline).toContain('PAN');
      expect(locked?.guideline).toContain('+91 96347 22174');
    });

    it('locks AI context onto RTO Road Tax with short essential details', () => {
      const messages = [
        { role: 'user', content: 'btn_service_road_tax' },
        { role: 'assistant', content: 'RTO Road Tax Service' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked?.service).toBe('RTO Road Tax');
      expect(locked?.guideline).toContain('LOCKED ON RTO ROAD TAX');
      expect(locked?.guideline).toContain('RC Valid Upto');
      expect(locked?.guideline).toContain('+91 96347 22174');
    });

    it('locks AI context onto State Border Tax with short essential details', () => {
      const messages = [
        { role: 'user', content: 'btn_service_border_tax' },
        { role: 'assistant', content: 'State Border Tax Entry Service' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked?.service).toBe('State Border Tax');
      expect(locked?.guideline).toContain('LOCKED ON STATE BORDER TAX');
      expect(locked?.guideline).toContain('Entry State');
      expect(locked?.guideline).toContain('+91 96347 22174');
    });

    it('returns null when no specific sub-service button was selected', () => {
      const messages = [
        { role: 'user', content: 'Hello, what are your shop hours?' },
      ];

      const locked = detectLockedSubService(messages);
      expect(locked).toBeNull();
    });
  });
});
