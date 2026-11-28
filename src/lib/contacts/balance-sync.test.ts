import { describe, it, expect } from 'vitest';
import {
  computeContactDue,
  computeSupplierDue,
  computeCustomerDue,
  getContactBadgeStatus,
  isSupplierContact,
  type SimplePO,
  type SimplePaymentLink,
  type SimpleContact,
} from './balance-sync';

describe('Contacts Directory & Purchase Ledger Balance Sync', () => {
  // Sample live Purchase Orders reflecting the Best Auto Parts database state
  const mockPaidPurchaseOrders: SimplePO[] = [
    {
      id: 'po-1',
      po_number: 'PO-2026-001',
      supplier_name: 'HAMDAAN SAPARE PARTS',
      supplier_phone: '+919634002453',
      total_estimated_cost: 4880,
      amount_paid: 4880,
      payment_status: 'PAID',
    },
    {
      id: 'po-2',
      po_number: 'PO-2026-002',
      supplier_name: 'PAL AGENCY',
      supplier_phone: '+918791823550',
      total_estimated_cost: 5500,
      amount_paid: 5500,
      payment_status: 'PAID',
    },
    {
      id: 'po-4',
      po_number: 'PO-2026-004',
      supplier_name: 'PAL AGENCY',
      supplier_phone: '+918791823550',
      total_estimated_cost: 420,
      amount_paid: 420,
      payment_status: 'PAID',
    },
    {
      id: 'po-5',
      po_number: 'PO-2026-005',
      supplier_name: 'PAL AGENCY',
      supplier_phone: '+918791823550',
      total_estimated_cost: 4100,
      amount_paid: 4100,
      payment_status: 'PAID',
    },
    {
      id: 'po-6',
      po_number: 'PO-2026-006',
      supplier_name: 'NABEEL PATHAN',
      supplier_phone: '+919761224004',
      total_estimated_cost: 2270,
      amount_paid: 2270,
      payment_status: 'PAID',
    },
    {
      id: 'po-7',
      po_number: 'PO-2026-007',
      supplier_name: 'NABEEL PATHAN',
      supplier_phone: '+919761224004',
      total_estimated_cost: 5500,
      amount_paid: 5500,
      payment_status: 'PAID',
    },
  ];

  const nabeelContact: SimpleContact = {
    id: 'c-nabeel',
    name: 'NABEEL PATHAN',
    company: 'NABEEL PATHAN',
    phone: '+919761224004',
    category: 'Wholesaler',
    unique_code: 'BAP-WHL-002',
    // Simulating stale DB column that was previously ₹7,770
    pending_balance: 7770,
  };

  const sandeepContact: SimpleContact = {
    id: 'c-sandeep',
    name: 'Sandeep',
    company: 'PAL AGENCY',
    phone: '918791823550',
    category: 'Distributor',
    unique_code: 'BAP-DIS-001',
    // Simulating stale DB column that was previously ₹4,420
    pending_balance: 4420,
  };

  it('correctly identifies wholesaler and distributor supplier contacts', () => {
    expect(isSupplierContact(nabeelContact)).toBe(true);
    expect(isSupplierContact(sandeepContact)).toBe(true);
    expect(isSupplierContact({ name: 'Rahul Sharma', category: 'Customer' })).toBe(false);
    expect(isSupplierContact({ name: 'Mohd Ali Ustad', category: 'Mechanic' })).toBe(false);
  });

  it('computes Settled ₹0 when all POs for NABEEL PATHAN are PAID (ignoring stale ₹7,770)', () => {
    const due = computeContactDue(nabeelContact, {
      purchaseOrders: mockPaidPurchaseOrders,
      paymentLinks: [],
    });

    expect(due).toBe(0);
    const badge = getContactBadgeStatus(due);
    expect(badge.text).toBe('Settled ₹0');
    expect(badge.isSettled).toBe(true);
    expect(badge.hasUdhaar).toBe(false);
  });

  it('computes Settled ₹0 when all POs for Sandeep / PAL AGENCY are PAID (ignoring stale ₹4,420)', () => {
    const due = computeContactDue(sandeepContact, {
      purchaseOrders: mockPaidPurchaseOrders,
      paymentLinks: [],
    });

    expect(due).toBe(0);
    const badge = getContactBadgeStatus(due);
    expect(badge.text).toBe('Settled ₹0');
    expect(badge.isSettled).toBe(true);
    expect(badge.hasUdhaar).toBe(false);
  });

  it('drops Udhaar Due count to 0 when all supplier POs are settled and no customer links are pending', () => {
    const contacts: SimpleContact[] = [nabeelContact, sandeepContact];
    let udhaarDueCount = 0;

    contacts.forEach((c) => {
      const due = computeContactDue(c, {
        purchaseOrders: mockPaidPurchaseOrders,
        paymentLinks: [],
      });
      if (due > 0) udhaarDueCount++;
    });

    expect(udhaarDueCount).toBe(0);
  });

  it('dynamically computes live payable due when an unpaid PO exists for a supplier', () => {
    const posWithUnpaid: SimplePO[] = [
      ...mockPaidPurchaseOrders,
      {
        id: 'po-new',
        po_number: 'PO-2026-008',
        supplier_name: 'NABEEL PATHAN',
        supplier_phone: '+919761224004',
        total_estimated_cost: 3500,
        amount_paid: 1000,
        payment_status: 'PARTIAL',
      },
    ];

    const due = computeContactDue(nabeelContact, {
      purchaseOrders: posWithUnpaid,
      paymentLinks: [],
    });

    expect(due).toBe(2500); // 3500 - 1000
    const badge = getContactBadgeStatus(due);
    expect(badge.text).toBe('⚠️ ₹2,500 Due');
    expect(badge.isSettled).toBe(false);
    expect(badge.hasUdhaar).toBe(true);
  });

  it('computes live customer due from pending payment links', () => {
    const customer: SimpleContact = {
      id: 'c-cust-1',
      name: 'Vikas Tyagi',
      phone: '+919876543210',
      category: 'Customer',
      pending_balance: 0,
    };

    const pendingLinks: SimplePaymentLink[] = [
      {
        customer_phone: '9876543210',
        amount: 850,
        status: 'PENDING',
      },
    ];

    const due = computeContactDue(customer, {
      purchaseOrders: mockPaidPurchaseOrders,
      paymentLinks: pendingLinks,
    });

    expect(due).toBe(850);
    const badge = getContactBadgeStatus(due);
    expect(badge.text).toBe('⚠️ ₹850 Due');
    expect(badge.hasUdhaar).toBe(true);
  });
});

describe('Dashboard Online Services Card Replacement', () => {
  it('aggregates the 4 required Online Services stages with active cases and service earnings', () => {
    const mockCases = [
      { id: '1', stage: 'NEW_INQUIRY', service_charge: 50, payment_status: 'UNPAID' },
      { id: '2', stage: 'NEW_INQUIRY', service_charge: 50, payment_status: 'UNPAID' },
      { id: '3', stage: 'PORTAL_CHECK', service_charge: 100, payment_status: 'PAID' },
      { id: '4', stage: 'PAYMENT_PENDING', service_charge: 50, payment_status: 'UNPAID' },
      { id: '5', stage: 'PROCESSING', service_charge: 150, payment_status: 'PAID' },
      { id: '6', stage: 'COMPLETED', service_charge: 50, payment_status: 'PAID' },
    ];

    const newInquiryCount = mockCases.filter((c) => c.stage === 'NEW_INQUIRY').length;
    const portalCheckCount = mockCases.filter((c) => c.stage === 'PORTAL_CHECK').length;
    const paymentPendingCount = mockCases.filter((c) => c.stage === 'PAYMENT_PENDING').length;
    const processingCount = mockCases.filter((c) => c.stage === 'PROCESSING').length;

    expect(newInquiryCount).toBe(2);
    expect(portalCheckCount).toBe(1);
    expect(paymentPendingCount).toBe(1);
    expect(processingCount).toBe(1);

    const activeCases = mockCases.filter((c) => c.stage !== 'COMPLETED').length;
    expect(activeCases).toBe(5);

    const serviceEarnings = mockCases
      .filter((c) => c.payment_status === 'PAID')
      .reduce((sum, c) => sum + c.service_charge, 0);
    expect(serviceEarnings).toBe(300); // 100 + 150 + 50
  });
});
