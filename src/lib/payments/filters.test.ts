import { describe, it, expect } from 'vitest';
import {
  isRazorpayOnlinePayment,
  isRazorpayTransaction,
  getIstDateString,
  getTodayIstDateString,
  getYesterdayIstDateString,
  formatIstDisplayDate,
  filterPayments,
  PaymentItemLike,
} from './filters';

describe('Payment Filters & IST Date Utilities', () => {
  describe('isRazorpayOnlinePayment', () => {
    it('returns true when razorpay_payment_id is present', () => {
      const item: PaymentItemLike = {
        order_id: 'ORD-1',
        merchant_transaction_id: 'TXN-1',
        amount: 500,
        status: 'PAID',
        razorpay_payment_id: 'pay_ABC123',
      };
      expect(isRazorpayOnlinePayment(item)).toBe(true);
      expect(isRazorpayTransaction(item)).toBe(true);
    });

    it('returns true when razorpay_payment_link_id or payment_link_id is present', () => {
      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-2',
          merchant_transaction_id: 'TXN-2',
          amount: 250,
          status: 'PENDING',
          razorpay_payment_link_id: 'plink_XYZ789',
        })
      ).toBe(true);

      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-2B',
          merchant_transaction_id: 'TXN-2B',
          amount: 250,
          status: 'PENDING',
          payment_link_id: 'plink_112233',
        })
      ).toBe(true);
    });

    it('returns true when razorpay_order_id is present', () => {
      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-RO-1',
          merchant_transaction_id: 'TXN-RO-1',
          amount: 400,
          status: 'PAID',
          razorpay_order_id: 'order_RZP99999',
        })
      ).toBe(true);
    });

    it('returns true when order_code starts with ORD-MWY or ORD-RZP', () => {
      expect(
        isRazorpayOnlinePayment({
          order_id: '12345',
          order_code: 'ORD-MWY-888',
          merchant_transaction_id: 'TXN-MWY-888',
          amount: 340,
          status: 'PAID',
        })
      ).toBe(true);

      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-RZP-555',
          merchant_transaction_id: 'TXN-RZP-555',
          amount: 200,
          status: 'PAID',
        })
      ).toBe(true);
    });

    it('returns true when gateway is razorpay (case insensitive)', () => {
      const item: PaymentItemLike = {
        order_id: 'ORD-3',
        merchant_transaction_id: 'TXN-3',
        amount: 1000,
        status: 'PAID',
        gateway: 'Razorpay',
      };
      expect(isRazorpayOnlinePayment(item)).toBe(true);
    });

    it('returns true when payment_mode contains RAZORPAY, ONLINE, or PAYMENT_LINK', () => {
      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-4',
          merchant_transaction_id: 'TXN-4',
          amount: 100,
          status: 'PAID',
          payment_mode: 'RAZORPAY_GATEWAY',
        })
      ).toBe(true);

      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-5',
          merchant_transaction_id: 'TXN-5',
          amount: 100,
          status: 'PAID',
          payment_mode: 'ONLINE_UPI',
        })
      ).toBe(true);

      expect(
        isRazorpayOnlinePayment({
          order_id: 'ORD-6',
          merchant_transaction_id: 'TXN-6',
          amount: 100,
          status: 'PENDING',
          payment_mode: 'PAYMENT_LINK',
        })
      ).toBe(true);
    });

    it('returns true when part_details contains encoded RAZORPAY or PLINK_', () => {
      const item: PaymentItemLike = {
        order_id: 'ORD-7',
        merchant_transaction_id: 'TXN-7',
        amount: 300,
        status: 'PAID',
        part_details: 'Chain Sprocket (Razorpay Online)',
      };
      expect(isRazorpayOnlinePayment(item)).toBe(true);
    });

    it('returns false for cash or shop UPI transactions without Razorpay identifiers', () => {
      const item: PaymentItemLike = {
        order_id: 'ORD-8',
        merchant_transaction_id: 'TXN-8',
        amount: 450,
        status: 'PAID',
        payment_mode: 'CASH',
        gateway: 'MANUAL',
      };
      expect(isRazorpayOnlinePayment(item)).toBe(false);
    });

    it('returns false safely for null/undefined input', () => {
      expect(isRazorpayOnlinePayment(null as unknown as PaymentItemLike)).toBe(false);
      expect(isRazorpayOnlinePayment(undefined as unknown as PaymentItemLike)).toBe(false);
    });
  });

  describe('getIstDateString', () => {
    it('converts UTC ISO strings to correct IST YYYY-MM-DD date', () => {
      // 2026-11-27 19:00:00 UTC is 2026-11-28 00:30:00 IST (+5:30)
      const dateUtcNight = '2026-11-27T19:00:00.000Z';
      expect(getIstDateString(dateUtcNight)).toBe('2026-11-28');

      // 2026-11-27 05:00:00 UTC is 2026-11-27 10:30:00 IST (+5:30)
      const dateUtcDay = '2026-11-27T05:00:00.000Z';
      expect(getIstDateString(dateUtcDay)).toBe('2026-11-27');
    });

    it('handles empty or invalid inputs gracefully', () => {
      expect(getIstDateString(null)).toBe('');
      expect(getIstDateString('')).toBe('');
      expect(getIstDateString('invalid-date-string')).toBe('');
    });
  });

  describe('getTodayIstDateString and getYesterdayIstDateString', () => {
    it('returns valid YYYY-MM-DD formatted strings', () => {
      const today = getTodayIstDateString();
      const yesterday = getYesterdayIstDateString();

      const regex = /^\d{4}-\d{2}-\d{2}$/;
      expect(today).toMatch(regex);
      expect(yesterday).toMatch(regex);
      expect(today).not.toBe(yesterday);
    });
  });

  describe('formatIstDisplayDate', () => {
    it('formats YYYY-MM-DD into a localized date label', () => {
      const formatted = formatIstDisplayDate('2026-11-27');
      expect(formatted).toContain('2026');
      expect(formatted).toMatch(/Nov|11/);
    });

    it('returns the original input if empty or invalid', () => {
      expect(formatIstDisplayDate('')).toBe('');
      expect(formatIstDisplayDate('invalid')).toBe('invalid');
    });
  });

  describe('filterPayments', () => {
    const sampleItems: PaymentItemLike[] = [
      {
        order_id: 'ORD-101',
        merchant_transaction_id: 'TXN-101',
        customer_name: 'Saud Khan',
        customer_phone: '9634722174',
        amount: 1500,
        status: 'PAID',
        contact_category: 'Customer',
        razorpay_payment_id: 'pay_RZP001',
        paid_at: '2026-11-27T10:00:00.000Z',
      },
      {
        order_id: 'ORD-102',
        merchant_transaction_id: 'TXN-102',
        customer_name: 'Rahul Mechanic',
        customer_phone: '9876543210',
        amount: 800,
        status: 'PENDING',
        contact_category: 'Mechanic',
        created_at: '2026-11-27T11:00:00.000Z',
      },
      {
        order_id: 'ORD-103',
        merchant_transaction_id: 'TXN-103',
        customer_name: 'Amit Kumar',
        customer_phone: '9123456780',
        amount: 500,
        status: 'PAID',
        contact_category: 'Customer',
        payment_mode: 'CASH',
        paid_at: '2026-11-26T10:00:00.000Z',
      },
      {
        order_id: 'ORD-104',
        merchant_transaction_id: 'TXN-104',
        customer_name: 'Vikas Sharma',
        customer_phone: '9555123456',
        amount: 2200,
        status: 'FAILED',
        gateway: 'razorpay',
        created_at: '2026-11-27T12:00:00.000Z',
      },
    ];

    it('filters by RAZORPAY tab', () => {
      const result = filterPayments(sampleItems, { activeTab: 'RAZORPAY' });
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.order_id)).toEqual(['ORD-101', 'ORD-104']);
    });

    it('filters by PAID tab', () => {
      const result = filterPayments(sampleItems, { activeTab: 'PAID' });
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.order_id)).toEqual(['ORD-101', 'ORD-103']);
    });

    it('filters by PENDING tab', () => {
      const result = filterPayments(sampleItems, { activeTab: 'PENDING' });
      expect(result).toHaveLength(1);
      expect(result[0].order_id).toBe('ORD-102');
    });

    it('filters by MECHANIC and CUSTOMER categories', () => {
      const mechanics = filterPayments(sampleItems, { activeTab: 'MECHANIC' });
      expect(mechanics).toHaveLength(1);
      expect(mechanics[0].order_id).toBe('ORD-102');

      const customers = filterPayments(sampleItems, { activeTab: 'CUSTOMER' });
      expect(customers).toHaveLength(2);
      expect(customers.map((i) => i.order_id)).toEqual(['ORD-101', 'ORD-103']);
    });

    it('filters by selected IST date', () => {
      const result27 = filterPayments(sampleItems, { selectedDate: '2026-11-27' });
      expect(result27).toHaveLength(3);
      expect(result27.map((i) => i.order_id)).toEqual(['ORD-101', 'ORD-102', 'ORD-104']);

      const result26 = filterPayments(sampleItems, { selectedDate: '2026-11-26' });
      expect(result26).toHaveLength(1);
      expect(result26[0].order_id).toBe('ORD-103');
    });

    it('filters by search term across name, phone, or order ID', () => {
      const searchName = filterPayments(sampleItems, { search: 'Saud' });
      expect(searchName).toHaveLength(1);
      expect(searchName[0].customer_name).toBe('Saud Khan');

      const searchPhone = filterPayments(sampleItems, { search: '987654' });
      expect(searchPhone).toHaveLength(1);
      expect(searchPhone[0].order_id).toBe('ORD-102');

      const searchOrderId = filterPayments(sampleItems, { search: 'ORD-103' });
      expect(searchOrderId).toHaveLength(1);
      expect(searchOrderId[0].customer_name).toBe('Amit Kumar');
    });

    it('combines tab, date, and search filters together', () => {
      const result = filterPayments(sampleItems, {
        activeTab: 'RAZORPAY',
        selectedDate: '2026-11-27',
        search: 'Saud',
      });
      expect(result).toHaveLength(1);
      expect(result[0].order_id).toBe('ORD-101');
    });

    it('confirms the KPI count, total amount, and filtered table rows return the exact same records for Razorpay Online + All Dates', () => {
      // 3 realistic entries matching the ₹992.00 total
      const ledgerDataset: PaymentItemLike[] = [
        {
          order_id: '101',
          order_code: 'ORD-MWY-001',
          merchant_transaction_id: 'TXN-MWY-001',
          customer_name: 'Customer One',
          customer_phone: '9634722174',
          amount: 340,
          paid_amount: 340,
          status: 'PAID',
          gateway: 'razorpay',
          razorpay_payment_id: 'pay_MWY001',
        },
        {
          order_id: '102',
          order_code: 'ORD-RZP-002',
          merchant_transaction_id: 'TXN-RZP-002',
          customer_name: 'Customer Two',
          customer_phone: '9876543210',
          amount: 452,
          paid_amount: 452,
          status: 'PAID',
          payment_mode: 'ONLINE',
          razorpay_order_id: 'order_RZP002',
        },
        {
          order_id: '103',
          merchant_transaction_id: 'TXN-LINK-003',
          customer_name: 'Customer Three',
          customer_phone: '9123456789',
          amount: 200,
          paid_amount: 200,
          status: 'PAID',
          payment_link_id: 'plink_LINK003',
        },
        // Unrelated Cash and Shop UPI entries
        {
          order_id: '104',
          merchant_transaction_id: 'TXN-CASH-004',
          customer_name: 'Cash Customer',
          customer_phone: '9555112233',
          amount: 600,
          status: 'PAID',
          payment_mode: 'CASH',
        },
        {
          order_id: '105',
          merchant_transaction_id: 'TXN-UPI-005',
          customer_name: 'Shop UPI Customer',
          customer_phone: '9444556677',
          amount: 800,
          status: 'PAID',
          payment_mode: 'UPI',
        },
      ];

      // 1. Compute KPI card metrics using isRazorpayOnlinePayment
      let kpiCount = 0;
      let kpiTotal = 0;
      for (const item of ledgerDataset) {
        if (isRazorpayOnlinePayment(item)) {
          kpiCount++;
          kpiTotal += item.paid_amount || item.amount || 0;
        }
      }

      // Expected KPI card total: ₹992.00 (340 + 452 + 200) across 3 payments
      expect(kpiCount).toBe(3);
      expect(kpiTotal).toBe(992);

      // 2. Filter table rows when Razorpay Online tab + All Dates is active
      const filteredRows = filterPayments(ledgerDataset, {
        activeTab: 'RAZORPAY',
        selectedDate: '', // All Dates
      });

      // 3. Confirm table rows match KPI count and IDs exactly
      expect(filteredRows).toHaveLength(3);
      expect(filteredRows.length).toBe(kpiCount);
      expect(filteredRows.map((r) => r.merchant_transaction_id)).toEqual([
        'TXN-MWY-001',
        'TXN-RZP-002',
        'TXN-LINK-003',
      ]);

      const tableRowsTotal = filteredRows.reduce(
        (sum, r) => sum + (r.paid_amount || r.amount || 0),
        0
      );
      expect(tableRowsTotal).toBe(kpiTotal);
      expect(tableRowsTotal).toBe(992);
    });
  });
});
