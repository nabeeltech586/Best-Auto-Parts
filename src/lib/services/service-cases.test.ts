import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getServiceCases,
  createServiceCase,
  updateServiceCase,
  deleteServiceCase,
  hasOpenServiceCaseForPhone,
  autoCreateServiceCaseFromWhatsApp,
  extractVehicleOrRef,
  buildOnlineServiceHandoverReply,
  syncServiceCaseFromChat,
  handleOnlineServiceFollowUp,
  buildServiceCaseWhatsAppMessage,
  formatDisplayDate,
  getKolkataTodayDateString,
} from './service-cases';

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.text123' }),
}));

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

    // Second call for same phone and same service should return null (suppressed duplicate)
    const duplicate = await autoCreateServiceCaseFromWhatsApp({
      phone: testPhone,
      customerName: 'Saud Khan',
      serviceType: 'ITR',
      inboundText: 'Need ITR quote again',
    });
    expect(duplicate).toBeNull();

    // But customer CAN create a separate card for another service (e.g. Vehicle Insurance)
    const insuranceCase = await autoCreateServiceCaseFromWhatsApp({
      phone: testPhone,
      customerName: 'Saud Khan',
      serviceType: 'Vehicle Insurance',
      inboundText: 'Need bike insurance quote',
    });
    expect(insuranceCase).not.toBeNull();
    expect(insuranceCase?.service_type).toBe('Vehicle Insurance');
  });

  describe('extractVehicleOrRef', () => {
    it('extracts registration numbers from user text', () => {
      expect(extractVehicleOrRef('My bike is UP11BT4854').vehicle).toBe('UP11BT4854');
      expect(extractVehicleOrRef('Check DL 01 AB 1234 road tax').vehicle).toBe('DL01AB1234');
      expect(extractVehicleOrRef('HR-26-DQ-5555').vehicle).toBe('HR26DQ5555');
    });

    it('extracts PAN numbers from user text', () => {
      expect(extractVehicleOrRef('My PAN is ABCDE1234F').pan).toBe('ABCDE1234F');
    });

    it('returns undefined when no pattern is found', () => {
      const res = extractVehicleOrRef('Hello, please tell me the price');
      expect(res.vehicle).toBeUndefined();
      expect(res.pan).toBeUndefined();
    });
  });

  describe('buildOnlineServiceHandoverReply', () => {
    it('builds Vehicle Insurance reply requesting RC photo and handover to Saud Khan', () => {
      const reply = buildOnlineServiceHandoverReply({
        serviceType: 'Vehicle Insurance',
        vehicleOrRef: 'UP11BT4854',
      });
      expect(reply).toContain('Vehicle Insurance Details Saved!');
      expect(reply).toContain('UP11BT4854');
      expect(reply).toContain('RC ki photo');
      expect(reply).toContain('Saud Khan (+91 96347 22174)');
    });

    it('builds ITR reply requesting occupation and PAN with handover to Saud Khan', () => {
      const reply = buildOnlineServiceHandoverReply({
        serviceType: 'ITR',
        vehicleOrRef: 'ABCDE1234F',
      });
      expect(reply).toContain('Annual ITR Filing Details Saved!');
      expect(reply).toContain('ABCDE1234F');
      expect(reply).toContain('Occupation Type: Service / Salaried ya Self-Employed / Business');
      expect(reply).toContain('Saud Khan (+91 96347 22174)');
    });

    it('builds RTO Road Tax reply requesting RC photo and handover to Saud Khan', () => {
      const reply = buildOnlineServiceHandoverReply({
        serviceType: 'RTO Road Tax',
        vehicleOrRef: 'UP11BT4854',
      });
      expect(reply).toContain('RTO Road Tax Details Saved!');
      expect(reply).toContain('UP11BT4854');
      expect(reply).toContain('RC ki photo');
      expect(reply).toContain('Saud Khan (+91 96347 22174)');
    });

    it('builds E-Challan reply requesting chassis/engine number or RC photo', () => {
      const reply = buildOnlineServiceHandoverReply({
        serviceType: 'E-Challan',
        vehicleOrRef: 'UP11BT4854',
      });
      expect(reply).toContain('E-Challan Settlement Details Saved!');
      expect(reply).toContain('RC ki photo');
      expect(reply).toContain('Saud Khan (+91 96347 22174)');
    });

    it('builds RC photo acknowledgment when isImage is true', () => {
      const reply = buildOnlineServiceHandoverReply({
        serviceType: 'Vehicle Insurance',
        isImage: true,
      });
      expect(reply).toContain('RC Photo Received & Saved!');
      expect(reply).toContain('Saud Khan (+91 96347 22174)');
    });
  });

  describe('handleOnlineServiceFollowUp & syncServiceCaseFromChat', () => {
    it('transitions stage to PORTAL_CHECK and replies with Saud Khan handover on text detail', async () => {
      const phone = '9876543210';
      const res = await handleOnlineServiceFollowUp({
        db: null as any,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        phone,
        customerName: 'Imran Khan',
        inboundText: 'UP11BT4854',
        forcedServiceType: 'RTO Road Tax',
      });

      expect(res.handled).toBe(true);
      expect(res.replyText).toContain('RTO Road Tax Details Saved!');
      expect(res.replyText).toContain('Saud Khan (+91 96347 22174)');
      expect(res.replyText).toContain('UP11BT4854');

      const cases = await getServiceCases(null);
      const matched = cases.find((c) => c.phone.includes('9876543210') && c.service_type === 'RTO Road Tax');
      expect(matched).toBeDefined();
      expect(matched?.stage).toBe('PORTAL_CHECK');
      expect(matched?.vehicle_or_ref).toBe('UP11BT4854');
    });

    it('acknowledges RC photo upload and confirms transfer to Saud Khan on image', async () => {
      const phone = '9876543210';
      const res = await handleOnlineServiceFollowUp({
        db: null as any,
        accountId: 'acc-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        phone,
        inboundText: '[RC Photo]',
        isImage: true,
        forcedServiceType: 'Vehicle Insurance',
      });

      expect(res.handled).toBe(true);
      expect(res.replyText).toContain('RC Photo Received & Saved!');
      expect(res.replyText).toContain('Saud Khan (+91 96347 22174)');
    });
  });

  describe('Fee & Date structured storage and WhatsApp message', () => {
    it('saves govt_fee = 1000, service_charge = 50, and payment_date = "2026-11-28", never resulting in ₹0', async () => {
      const created = await createServiceCase({
        customer_name: 'Wasim Akram',
        phone: '9876543211',
        service_type: 'RTO Road Tax',
        vehicle_or_ref: 'UP11BY5555',
        govt_fee: 1000,
        service_charge: 50,
        payment_date: '2026-11-28',
        receipt_number: 'UPRTE26110003488',
        payment_status: 'PAID',
      });

      expect(created.govt_fee).toBe(1000);
      expect(created.service_charge).toBe(50);
      expect(created.fee_amount).toBe(1050); // total 1050, never 0!
      expect(created.payment_date).toBe('2026-11-28');
      expect(created.receipt_number).toBe('UPRTE26110003488');

      // Update case fee & date
      const updated = await updateServiceCase(created.id, {
        govt_fee: 1200,
        service_charge: 80,
        receipt_number: 'UPRTE26110003499',
      });

      expect(updated).not.toBeNull();
      expect(updated?.govt_fee).toBe(1200);
      expect(updated?.service_charge).toBe(80);
      expect(updated?.fee_amount).toBe(1280);
      expect(updated?.receipt_number).toBe('UPRTE26110003499');
    });

    it('builds WhatsApp status update message with complete fee breakdown and date', () => {
      const testCase = {
        id: 'test-1',
        customer_name: 'Aslam Khan',
        phone: '9634722174',
        service_type: 'Vehicle Insurance' as const,
        vehicle_or_ref: 'UP11AY1234',
        govt_fee: 1000,
        service_charge: 50,
        fee_amount: 1050,
        payment_status: 'PAID' as const,
        stage: 'PORTAL_CHECK' as const,
        payment_date: '2026-11-28',
        receipt_number: 'UPRTE26110003488',
        created_at: '2026-11-28T10:00:00Z',
        updated_at: '2026-11-28T10:00:00Z',
      };

      const msg = buildServiceCaseWhatsAppMessage(testCase);
      expect(msg).toContain('🏛️ *Govt / Portal Fee:* ₹1,000');
      expect(msg).toContain('💼 *Service Charge:* ₹50 (PAID)');
      expect(msg).toContain('💰 *Total Amount:* ₹1,050');
      expect(msg).toContain('📅 *Date:* 28 Nov 2026 (Receipt No: UPRTE26110003488)');
      expect(msg).toContain('Saud Khan (+91 96347 22174)');
    });
  });
});
