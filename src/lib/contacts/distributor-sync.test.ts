import { describe, it, expect, vi } from 'vitest';
import {
  normalize10Digits,
  syncDistributorsAndWholesalers,
  syncSupplierToContact,
  syncContactToSupplier,
} from './distributor-sync';

describe('Distributor & Wholesaler Auto-Sync Module', () => {
  describe('normalize10Digits', () => {
    it('normalizes various Indian phone formats to 10 digits', () => {
      expect(normalize10Digits('+919634002453')).toBe('9634002453');
      expect(normalize10Digits('919634002453')).toBe('9634002453');
      expect(normalize10Digits('+91 96340 02453')).toBe('9634002453');
      expect(normalize10Digits('09634002453')).toBe('9634002453');
      expect(normalize10Digits('9634002453')).toBe('9634002453');
      expect(normalize10Digits('')).toBe('');
      expect(normalize10Digits(null)).toBe('');
    });
  });

  describe('syncDistributorsAndWholesalers', () => {
    it('identifies and inserts missing distributors into contacts', async () => {
      const mockSuppliers = [
        {
          id: 'sup-1',
          account_id: 'acc-1',
          firm_name: 'HAMDAAN SAPARE PARTS',
          contact_person: 'HAFIZ NAWAZ KHAN',
          whatsapp_number: '+919634002453',
        },
      ];

      const mockPOs = [
        {
          supplier_name: 'PAL AGENCY',
          supplier_phone: '+918791823550',
          supplier_id: 'sup-2',
          account_id: 'acc-1',
        },
      ];

      const mockContacts = [
        {
          id: 'contact-1',
          name: 'Sandeep',
          phone: '918791823550',
          company: null,
          category: null,
          account_id: 'acc-1',
          user_id: 'user-1',
        },
      ];

      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const insertMock = vi.fn().mockResolvedValue({ error: null });

      const fakeSupabase = {
        from: (table: string) => {
          if (table === 'suppliers') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: mockSuppliers, error: null }),
              }),
            };
          }
          if (table === 'purchase_orders') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: mockPOs, error: null }),
              }),
            };
          }
          if (table === 'contacts') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: mockContacts, error: null }),
              }),
              update: (payload: unknown) => ({
                eq: updateMock,
              }),
              insert: insertMock,
            };
          }
          return {};
        },
      } as any;

      const result = await syncDistributorsAndWholesalers(fakeSupabase, 'acc-1');

      expect(result.synced).toBe(2);
      expect(result.updated).toBe(1); // Sandeep updated with PAL AGENCY
      expect(result.inserted).toBe(1); // HAMDAAN inserted
      expect(insertMock).toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalled();
    });
  });

  describe('syncContactToSupplier', () => {
    it('does nothing if contact category is Customer', async () => {
      const insertMock = vi.fn();
      const fakeSupabase = {
        from: () => ({ insert: insertMock }),
      } as any;

      await syncContactToSupplier(fakeSupabase, {
        name: 'Normal Customer',
        phone: '+919876543210',
        category: 'Customer',
        account_id: 'acc-1',
      });

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('upserts to suppliers if category is Distributor', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const fakeSupabase = {
        from: (table: string) => ({
          select: () => ({
            or: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null }),
              }),
            }),
          }),
          insert: insertMock,
        }),
      } as any;

      await syncContactToSupplier(fakeSupabase, {
        name: 'New Distributor',
        phone: '+919988776655',
        company: 'Auto Distributors Ltd',
        category: 'Distributor',
        account_id: 'acc-1',
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          firm_name: 'Auto Distributors Ltd',
          whatsapp_number: '+919988776655',
        })
      );
    });
  });
});
