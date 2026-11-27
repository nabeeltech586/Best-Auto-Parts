import { describe, it, expect, beforeEach } from 'vitest';
import {
  getServiceCases,
  createServiceCase,
  updateServiceCase,
  deleteServiceCase,
  hasOpenServiceCaseForPhone,
  autoCreateServiceCaseFromWhatsApp,
} from './service-cases';

describe('service-cases storage and operations', () => {
  it('starts fresh with zero initial cases or retrieves created cases', async () => {
    const list = await getServiceCases(null);
    expect(Array.isArray(list)).toBe(true);
  });

  it('creates a new service case with correct fields', async () => {
    const created = await createServiceCase({
      customer_name: 'Aslam Khan',
      phone: '+91 98765 43210',
      service_type: 'Vehicle Insurance',
      vehicle_or_ref: 'UP11AY9999',
      fee_amount: 850,
      payment_status: 'UNPAID',
      stage: 'NEW_INQUIRY',
      notes: 'Hero Splendor insurance renewal',
    });

    expect(created.id).toBeDefined();
    expect(created.customer_name).toBe('Aslam Khan');
    expect(created.phone).toBe('+91 98765 43210');
    expect(created.service_type).toBe('Vehicle Insurance');
    expect(created.vehicle_or_ref).toBe('UP11AY9999');
    expect(created.fee_amount).toBe(850);
    expect(created.payment_status).toBe('UNPAID');
    expect(created.stage).toBe('NEW_INQUIRY');

    // Verify it is returned in list
    const list = await getServiceCases(null);
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it('updates stage and payment status cleanly', async () => {
    const created = await createServiceCase({
      customer_name: 'Rashid Ali',
      phone: '9897001122',
      service_type: 'E-Challan',
      vehicle_or_ref: 'UP11X1001',
      fee_amount: 500,
    });

    const updated = await updateServiceCase(created.id, {
      stage: 'PORTAL_CHECK',
      payment_status: 'PAID',
    });

    expect(updated).not.toBeNull();
    expect(updated?.stage).toBe('PORTAL_CHECK');
    expect(updated?.payment_status).toBe('PAID');
  });

  it('deletes a service case', async () => {
    const created = await createServiceCase({
      customer_name: 'To Delete',
      phone: '9999999999',
      service_type: 'ITR',
    });

    const deleted = await deleteServiceCase(created.id);
    expect(deleted).toBe(true);

    const list = await getServiceCases(null);
    expect(list.some((c) => c.id === created.id)).toBe(false);
  });

  it('detects open service cases for phone and prevents duplicates', async () => {
    const testPhone = '9634722174';

    const case1 = await autoCreateServiceCaseFromWhatsApp({
      phone: testPhone,
      customerName: 'Saud Khan',
      serviceType: 'ITR',
      inboundText: '/itr need filing assistance',
    });

    expect(case1).not.toBeNull();
    expect(case1?.service_type).toBe('ITR');
    expect(case1?.stage).toBe('NEW_INQUIRY');

    // Check open case existence
    const hasOpen = await hasOpenServiceCaseForPhone(testPhone);
    expect(hasOpen).toBe(true);

    // Second call for same phone should return null (suppressed duplicate)
    const duplicate = await autoCreateServiceCaseFromWhatsApp({
      phone: testPhone,
      customerName: 'Saud Khan',
      serviceType: 'ITR',
      inboundText: 'Need ITR quote again',
    });
    expect(duplicate).toBeNull();
  });
});
