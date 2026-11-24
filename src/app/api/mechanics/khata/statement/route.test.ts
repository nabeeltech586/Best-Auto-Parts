import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatAccountTier,
  generatePartnerStatementText,
  POST,
} from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  toErrorResponse: vi.fn((err) =>
    new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  ),
}));

import { getCurrentAccount } from '@/lib/auth/account';

describe('Partner Ledger Statement Module', () => {
  describe('formatAccountTier', () => {
    it('maps default Partner tier cleanly to ⭐ Pro Partner without duplicate text', () => {
      expect(formatAccountTier('Partner')).toBe('⭐ Pro Partner');
      expect(formatAccountTier(undefined)).toBe('⭐ Pro Partner');
      expect(formatAccountTier(null)).toBe('⭐ Pro Partner');
      expect(formatAccountTier('')).toBe('⭐ Pro Partner');
    });

    it('formats VIP, Gold, and Silver tiers properly', () => {
      expect(formatAccountTier('VIP')).toBe('⭐ VIP Partner');
      expect(formatAccountTier('Gold')).toBe('⭐ Gold Partner');
      expect(formatAccountTier('Silver')).toBe('⭐ Silver Partner');
    });

    it('deduplicates strings already ending in Partner', () => {
      expect(formatAccountTier('Pro Partner')).toBe('⭐ Pro Partner');
      expect(formatAccountTier('Authorized Partner')).toBe('⭐ Authorized Partner');
      expect(formatAccountTier('Trade Partner')).toBe('⭐ Trade Partner');
    });
  });

  describe('generatePartnerStatementText', () => {
    it('generates enterprise-grade statement matching exact specification with positive balance', () => {
      const text = generatePartnerStatementText({
        name: 'Aslam Auto Works',
        phone: '+919897123456',
        tier: 'Partner',
        monthlyVolume: 45000,
        balanceDue: 3200,
        formattedDate: '24 Nov 2026',
      });

      // 1. Header & divider
      expect(text).toContain('🏍️ *BEST AUTO PARTS — PARTNER LEDGER STATEMENT* 🔧');
      expect(text).toContain('━━━━━━━━━━━━━━━━━━━━');

      // 2. Structured Partner details
      expect(text).toContain('• *Partner / Workshop:* Aslam Auto Works');
      expect(text).toContain('• *Mobile:* +919897123456');
      expect(text).toContain('• *Account Tier:* ⭐ Pro Partner');
      expect(text).toContain('• *Monthly Billing:* ₹45,000.00');
      expect(text).toContain('• *Net Balance Due:* ₹3,200.00');
      expect(text).toContain('• *Statement Date:* 24 Nov 2026');

      // 3. Clear call to action and direct UPI URI (NO crm.example.com dummy link)
      expect(text).toContain('Kindly clear your outstanding ledger balance at your earliest convenience.');
      expect(text).toContain('👉 *Pay Online via PhonePe / UPI:*');
      expect(text).toContain('upi://pay?pa=9761224004-2@ybl&pn=Best%20Auto%20Parts&am=3200&cu=INR');
      expect(text).toContain('(UPI ID: 9761224004-2@ybl)');
      expect(text).not.toContain('crm.example.com');
      expect(text).not.toContain('Khata');
      expect(text).not.toContain('Partner Partner');
    });

    it('generates clean zero-balance clear statement when balanceDue is 0', () => {
      const text = generatePartnerStatementText({
        name: 'Rashid Bike Point',
        phone: '+919897000000',
        tier: 'Gold',
        monthlyVolume: 82000,
        balanceDue: 0,
        formattedDate: '24 Nov 2026',
      });

      expect(text).toContain('• *Account Tier:* ⭐ Gold Partner');
      expect(text).toContain('• *Net Balance Due:* ₹0.00');
      expect(text).toContain('Your running ledger account is 100% CLEAR!');
      expect(text).not.toContain('upi://pay');
      expect(text).not.toContain('Khata');
    });
  });

  describe('POST /api/mechanics/khata/statement', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns 400 when contact_id is missing', async () => {
      (getCurrentAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        supabase: {},
        accountId: 'acc-1',
      });

      const req = new Request('https://crm.local/api/mechanics/khata/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Contact ID is required');
    });

    it('returns 404 when contact is not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });
      const mockEq2 = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      (getCurrentAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        supabase: { from: mockFrom },
        accountId: 'acc-1',
      });

      const req = new Request('https://crm.local/api/mechanics/khata/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: 'non-existent' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Contact not found');
    });

    it('returns 200 with statementText and direct UPI paymentLink for valid contact', async () => {
      const contactData = {
        id: 'contact-1',
        name: 'Saleem Ustad',
        phone: '+919634722174',
        company: 'Saleem Motors',
        pending_balance: 1850,
        monthly_purchases: 32000,
        loyalty_tier: 'Partner',
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: contactData, error: null });
      const mockEq2 = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      (getCurrentAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        supabase: { from: mockFrom },
        accountId: 'acc-1',
      });

      const req = new Request('https://crm.local/api/mechanics/khata/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: 'contact-1' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.upiId).toBe('9761224004-2@ybl');
      expect(json.paymentLink).toBe(
        'upi://pay?pa=9761224004-2@ybl&pn=Best%20Auto%20Parts&am=1850&cu=INR'
      );
      expect(json.statementText).toContain('• *Partner / Workshop:* Saleem Ustad');
      expect(json.statementText).toContain('• *Account Tier:* ⭐ Pro Partner');
      expect(json.statementText).toContain('• *Net Balance Due:* ₹1,850.00');
      expect(json.statementText).toContain('upi://pay?pa=9761224004-2@ybl&pn=Best%20Auto%20Parts&am=1850&cu=INR');
    });
  });
});
