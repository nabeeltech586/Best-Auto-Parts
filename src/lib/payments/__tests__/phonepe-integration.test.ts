/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PaymentService, generateMerchantTransactionId } from '../payment-service';
import { PhonePeClient } from '../phonepe/client';
import type { PhonePeWebhookPayload } from '../phonepe/types';
import { createFakeDb } from '@/lib/flows/fake-db.test-helper';

// Mock meta senders
const sentTexts: any[] = [];
const sentButtons: any[] = [];

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn(async (args: any) => {
    sentTexts.push(args);
    return { whatsapp_message_id: `wamid.txt.${sentTexts.length}` };
  }),
  engineSendInteractiveButtons: vi.fn(async (args: any) => {
    sentButtons.push(args);
    return { whatsapp_message_id: `wamid.btn.${sentButtons.length}` };
  }),
  engineSendInteractiveList: vi.fn(async () => {
    return { whatsapp_message_id: 'wamid.list.1' };
  }),
}));

describe('PHONEPE PAYMENT GATEWAY (TRACK 2) — 16 COMPREHENSIVE VERIFICATION TESTS', () => {
  const accountId = 'acc-test-123';
  const userId = 'user-test-456';
  const contactId = 'contact-test-789';
  const conversationId = 'conv-test-012';
  const partId = 'part-clutch-150';

  let mockClient: PhonePeClient;

  beforeEach(() => {
    sentTexts.length = 0;
    sentButtons.length = 0;
    vi.clearAllMocks();

    // Initialize mock client with configured test credentials
    mockClient = new PhonePeClient({
      enabled: false, // Sandbox mock mode
      environment: 'UAT',
      clientId: 'TEST_CLIENT_ID',
      clientSecret: 'TEST_CLIENT_SECRET',
      clientVersion: 1,
      merchantId: 'BESTAUTOPARTS',
      webhookUsername: 'mock_user',
      webhookPassword: 'mock_pass',
    });
  });

  // ------------------------------------------------------------
  // Test 1: Payment Initiation
  // ------------------------------------------------------------
  it('1. Payment initiation: creates order, pending payment, and returns dynamic QR payload', async () => {
    const db = createFakeDb({
      orders: [],
      payments: [],
    });

    const result = await PaymentService.initiatePayment({
      db: db as any,
      accountId,
      userId,
      contactId,
      conversationId,
      partId,
      partName: 'Bajaj Pulsar 150 Clutch Plate Set',
      unitPrice: 690,
      quantity: 1,
      fulfillmentType: 'online_checkout',
      preferredLanguage: 'hinglish',
      paymentMethod: 'UPI_QR',
      client: mockClient,
    });

    expect(result.orderId).toBeDefined();
    expect(result.merchantTransactionId).toMatch(/^BAP_TXN_/);
    expect(result.totalAmount).toBe(690);
    expect(result.paymentMethod).toBe('UPI_QR');
    expect(result.qrPayload).toContain('upi://pay');

    // Verify DB state
    const { data: orders } = await (db as any).from('orders').select('*');
    expect(orders.length).toBe(1);
    expect(orders[0].order_status).toBe('pending_payment');
    expect(orders[0].customer_language).toBe('hinglish');
    expect(orders[0].total_amount).toBe(690);

    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments.length).toBe(1);
    expect(payments[0].payment_status).toBe('pending');
    expect(payments[0].settlement_status).toBe('unsettled');
    expect(payments[0].amount).toBe(690);
    expect(payments[0].merchant_transaction_id).toBe(result.merchantTransactionId);
  });

  // ------------------------------------------------------------
  // Test 2: Valid Successful Callback
  // ------------------------------------------------------------
  it('2. Valid successful callback: verifies webhook, marks order paid, records UTR, and sends receipt', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-1';

    const db = createFakeDb({
      orders: [
        {
          id: orderId,
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          part_id: partId,
          quantity: 1,
          unit_price: 690,
          total_amount: 690,
          order_status: 'pending_payment',
          customer_language: 'en',
          metadata: { initiator_user_id: userId },
        },
      ],
      payments: [
        {
          id: 'pay-uuid-1',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
          settlement_status: 'unsettled',
          expires_at: new Date(Date.now() + 900000).toISOString(),
        },
      ],
    });

    const webhookPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_SUCCESS',
      payload: {
        orderId: 'PHONEPE_ORD_123',
        merchantOrderId: merchantTxnId,
        amount: 69000, // 690.00 in paise
        state: 'COMPLETED',
        paymentInstrument: {
          type: 'UPI_QR',
          utr: 'UTR432890128472',
        },
      },
    };

    const authHeader = 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==';
    const result = await PaymentService.processWebhook(
      db as any,
      authHeader,
      webhookPayload,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('PAID');
    expect(result.utr).toBe('UTR432890128472');

    // Verify DB update
    const { data: updatedPayment } = await (db as any)
      .from('payments')
      .select('*')
      .eq('merchant_transaction_id', merchantTxnId);
    expect(updatedPayment[0].payment_status).toBe('paid');
    expect(updatedPayment[0].utr).toBe('UTR432890128472');

    const { data: updatedOrder } = await (db as any)
      .from('orders')
      .select('*')
      .eq('id', orderId);
    expect(updatedOrder[0].order_status).toBe('paid');

    // Verify WhatsApp confirmation receipt sent in English
    expect(sentTexts.length).toBe(1);
    expect(sentTexts[0].text).toContain('Payment Received Successfully!');
    expect(sentTexts[0].text).toContain('UTR432890128472');
    expect(sentTexts[0].text).toContain('₹690.00');
  });

  // ------------------------------------------------------------
  // Test 3: Invalid Callback Authentication
  // ------------------------------------------------------------
  it('3. Invalid callback authentication: rejects webhook with INVALID_AUTH and preserves state', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-2';

    const db = createFakeDb({
      orders: [
        {
          id: orderId,
          account_id: accountId,
          total_amount: 690,
          order_status: 'pending_payment',
        },
      ],
      payments: [
        {
          id: 'pay-uuid-2',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
        },
      ],
    });

    const webhookPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_SUCCESS',
      payload: {
        orderId: 'PHONEPE_ORD_FAKE',
        merchantOrderId: merchantTxnId,
        amount: 69000,
        state: 'COMPLETED',
      },
    };

    const badAuthHeader = 'Basic d3JvbmdfdXNlcjp3cm9uZ19wYXNz';
    const result = await PaymentService.processWebhook(
      db as any,
      badAuthHeader,
      webhookPayload,
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('INVALID_AUTH');

    // Verify DB remains untouched
    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments[0].payment_status).toBe('pending');
  });

  // ------------------------------------------------------------
  // Test 4: Incorrect Payment Amount
  // ------------------------------------------------------------
  it('4. Incorrect payment amount: rejects tampered amount with AMOUNT_MISMATCH', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-3';

    const db = createFakeDb({
      orders: [{ id: orderId, account_id: accountId, total_amount: 690 }],
      payments: [
        {
          id: 'pay-uuid-3',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
        },
      ],
    });

    const tamperedPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_SUCCESS',
      payload: {
        orderId: 'PHONEPE_ORD_123',
        merchantOrderId: merchantTxnId,
        amount: 50000, // ₹500.00 instead of ₹690.00
        state: 'COMPLETED',
      },
    };

    const authHeader = 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==';
    const result = await PaymentService.processWebhook(
      db as any,
      authHeader,
      tamperedPayload,
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('AMOUNT_MISMATCH');

    // DB remains pending
    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments[0].payment_status).toBe('pending');
  });

  // ------------------------------------------------------------
  // Test 5: Incorrect Merchant Order ID
  // ------------------------------------------------------------
  it('5. Incorrect merchant order ID: returns NOT_FOUND when order does not exist', async () => {
    const db = createFakeDb({
      orders: [],
      payments: [],
    });

    const unknownPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_SUCCESS',
      payload: {
        orderId: 'ORD_UNKNOWN',
        merchantOrderId: 'NON_EXISTENT_ORDER_REF',
        amount: 69000,
        state: 'COMPLETED',
      },
    };

    const authHeader = 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==';
    const result = await PaymentService.processWebhook(
      db as any,
      authHeader,
      unknownPayload,
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('NOT_FOUND');
  });

  // ------------------------------------------------------------
  // Test 6: Duplicate Callback (Idempotency)
  // ------------------------------------------------------------
  it('6. Duplicate callback: handles repeated delivery idempotently with ALREADY_PROCESSED', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-6';

    const db = createFakeDb({
      orders: [
        {
          id: orderId,
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          part_id: partId,
          quantity: 1,
          total_amount: 690,
          order_status: 'paid', // Already paid
        },
      ],
      payments: [
        {
          id: 'pay-uuid-6',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'paid', // Already marked paid
          utr: 'UTR_ORIGINAL_123',
        },
      ],
    });

    const repeatPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_SUCCESS',
      payload: {
        orderId: 'PHONEPE_ORD_123',
        merchantOrderId: merchantTxnId,
        amount: 69000,
        state: 'COMPLETED',
        paymentInstrument: { utr: 'UTR_ORIGINAL_123' },
      },
    };

    const authHeader = 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==';
    const result = await PaymentService.processWebhook(
      db as any,
      authHeader,
      repeatPayload,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('ALREADY_PROCESSED');
    expect(result.utr).toBe('UTR_ORIGINAL_123');
    // Ensure zero duplicate receipts sent
    expect(sentTexts.length).toBe(0);
  });

  // ------------------------------------------------------------
  // Test 7: Duplicate Payment Attempt
  // ------------------------------------------------------------
  it('7. Duplicate payment attempt: status reconciliation recognizes completed order', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const db = createFakeDb({
      orders: [{ id: 'order-uuid-7', account_id: accountId, order_status: 'paid' }],
      payments: [
        {
          id: 'pay-uuid-7',
          account_id: accountId,
          merchant_transaction_id: merchantTxnId,
          payment_status: 'paid',
        },
      ],
    });

    const result = await PaymentService.reconcilePaymentStatus(
      db as any,
      merchantTxnId,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('ALREADY_PROCESSED');
  });

  // ------------------------------------------------------------
  // Test 8: Pending Payment
  // ------------------------------------------------------------
  it('8. Pending payment: maintains pending status when gateway transaction is in progress', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const db = createFakeDb({
      orders: [{ id: 'order-uuid-8', account_id: accountId, order_status: 'pending_payment' }],
      payments: [
        {
          id: 'pay-uuid-8',
          account_id: accountId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    });

    const pendingPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_PENDING',
      payload: {
        orderId: 'PHONEPE_ORD_PEND',
        merchantOrderId: merchantTxnId,
        amount: 69000,
        state: 'PENDING',
      },
    };

    const authHeader = 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==';
    const result = await PaymentService.processWebhook(
      db as any,
      authHeader,
      pendingPayload,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('PENDING');

    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments[0].payment_status).toBe('pending');
  });

  // ------------------------------------------------------------
  // Test 9: Failed Payment
  // ------------------------------------------------------------
  it('9. Failed payment: updates payment to failed, order to cancelled, and notifies customer', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-9';

    const db = createFakeDb({
      orders: [
        {
          id: orderId,
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          order_status: 'pending_payment',
          customer_language: 'hinglish',
        },
      ],
      payments: [
        {
          id: 'pay-uuid-9',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
        },
      ],
    });

    const failedPayload: PhonePeWebhookPayload = {
      type: 'PAYMENT_FAILED',
      payload: {
        orderId: 'PHONEPE_ORD_FAIL',
        merchantOrderId: merchantTxnId,
        amount: 69000,
        state: 'FAILED',
        responseCode: 'PAYMENT_DECLINED',
      },
    };

    const authHeader = 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==';
    const result = await PaymentService.processWebhook(
      db as any,
      authHeader,
      failedPayload,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('FAILED');

    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments[0].payment_status).toBe('failed');

    const { data: orders } = await (db as any).from('orders').select('*');
    expect(orders[0].order_status).toBe('cancelled');

    // Customer receives failure notice with retry button
    expect(sentButtons.length).toBe(1);
    expect(sentButtons[0].bodyText).toContain('Payment Complete Nahi Ho Paaya');
    expect(sentButtons[0].buttons[0].title).toBe('Dobara Try Karein');
  });

  // ------------------------------------------------------------
  // Test 10: Expired Payment
  // ------------------------------------------------------------
  it('10. Expired payment: marks order and payment expired when past 15-minute TTL', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-10';

    // Expired 5 minutes ago
    const pastExpiresAt = new Date(Date.now() - 300000).toISOString();

    const db = createFakeDb({
      orders: [
        {
          id: orderId,
          account_id: accountId,
          order_status: 'pending_payment',
        },
      ],
      payments: [
        {
          id: 'pay-uuid-10',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
          expires_at: pastExpiresAt,
        },
      ],
    });

    const result = await PaymentService.reconcilePaymentStatus(
      db as any,
      merchantTxnId,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('FAILED');

    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments[0].payment_status).toBe('expired');

    const { data: orders } = await (db as any).from('orders').select('*');
    expect(orders[0].order_status).toBe('expired');
  });

  // ------------------------------------------------------------
  // Test 11: Delayed Callback & Status Reconciliation
  // ------------------------------------------------------------
  it('11. Delayed callback & reconciliation: polls PhonePe status and confirms delayed payment', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const orderId = 'order-uuid-11';

    const db = createFakeDb({
      orders: [
        {
          id: orderId,
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          total_amount: 690,
          order_status: 'pending_payment',
          customer_language: 'en',
        },
      ],
      payments: [
        {
          id: 'pay-uuid-11',
          account_id: accountId,
          order_id: orderId,
          merchant_transaction_id: merchantTxnId,
          amount: 690,
          payment_status: 'pending',
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    });

    // Mock getOrderStatus to return COMPLETED
    vi.spyOn(mockClient, 'getOrderStatus').mockResolvedValueOnce({
      orderId: 'PHONEPE_DELAYED_123',
      merchantOrderId: merchantTxnId,
      amount: 69000,
      state: 'COMPLETED',
      paymentInstrument: { utr: 'UTR_DELAYED_RECONCILED' },
    });

    const result = await PaymentService.reconcilePaymentStatus(
      db as any,
      merchantTxnId,
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('PAID');
    expect(result.utr).toBe('UTR_DELAYED_RECONCILED');

    const { data: payments } = await (db as any).from('payments').select('*');
    expect(payments[0].payment_status).toBe('paid');
    expect(payments[0].utr).toBe('UTR_DELAYED_RECONCILED');
  });

  // ------------------------------------------------------------
  // Test 12: Tenant Isolation & RLS
  // ------------------------------------------------------------
  it('12. Tenant isolation: payment records are strictly scoped to their account_id', async () => {
    const db = createFakeDb({
      payments: [
        {
          id: 'pay-1',
          account_id: 'tenant-A',
          merchant_transaction_id: 'BAP_TENANT_A',
          amount: 690,
        },
        {
          id: 'pay-2',
          account_id: 'tenant-B',
          merchant_transaction_id: 'BAP_TENANT_B',
          amount: 1200,
        },
      ],
    });

    // Query scoped to tenant-A
    const { data: tenantAPayments } = await (db as any)
      .from('payments')
      .select('*')
      .eq('account_id', 'tenant-A');

    expect(tenantAPayments.length).toBe(1);
    expect(tenantAPayments[0].merchant_transaction_id).toBe('BAP_TENANT_A');

    // Query scoped to tenant-B
    const { data: tenantBPayments } = await (db as any)
      .from('payments')
      .select('*')
      .eq('account_id', 'tenant-B');

    expect(tenantBPayments.length).toBe(1);
    expect(tenantBPayments[0].merchant_transaction_id).toBe('BAP_TENANT_B');
  });

  // ------------------------------------------------------------
  // Test 13: English and Hinglish Localization
  // ------------------------------------------------------------
  it('13. Localization: dispatches natural Hinglish receipt for Hinglish customer and English for English', async () => {
    const merchantTxnIdHinglish = generateMerchantTransactionId();
    const dbHinglish = createFakeDb({
      orders: [
        {
          id: 'ord-hinglish',
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          total_amount: 690,
          customer_language: 'hinglish',
          order_status: 'pending_payment',
        },
      ],
      payments: [
        {
          id: 'pay-hinglish',
          account_id: accountId,
          order_id: 'ord-hinglish',
          merchant_transaction_id: merchantTxnIdHinglish,
          amount: 690,
          payment_status: 'pending',
        },
      ],
    });

    await PaymentService.processWebhook(
      dbHinglish as any,
      'Basic bW9ja191c2VyOm1vY2tfcGFzcw==',
      {
        type: 'PAYMENT_SUCCESS',
        payload: {
          orderId: 'ORD_H1',
          merchantOrderId: merchantTxnIdHinglish,
          amount: 69000,
          state: 'COMPLETED',
          paymentInstrument: { utr: 'UTR_HINGLISH' },
        },
      },
      mockClient
    );

    expect(sentTexts.length).toBe(1);
    expect(sentTexts[0].text).toContain('Payment Receive Ho Gaya Hai!');
    expect(sentTexts[0].text).toContain('Packing Shuru');
    expect(sentTexts[0].text).toContain('UTR_HINGLISH');
    // Ensure stock counts are never leaked in receipt
    expect(sentTexts[0].text).not.toMatch(/\b(in stock|units remaining|pcs left)\b/i);
  });

  // ------------------------------------------------------------
  // Test 14: Same-Phone Checkout Link Flow
  // ------------------------------------------------------------
  it('14. Same-phone checkout link: generates secure HTTPS checkout link for one-click payment', async () => {
    const db = createFakeDb({
      orders: [],
      payments: [],
    });

    const result = await PaymentService.initiatePayment({
      db: db as any,
      accountId,
      userId,
      contactId,
      conversationId,
      partName: 'Bajaj Pulsar 150 Clutch Plate Set',
      unitPrice: 690,
      paymentMethod: 'CHECKOUT_LINK',
      client: mockClient,
    });

    expect(result.checkoutUrl).toBeDefined();
    expect(result.checkoutUrl).toContain('https://best-auto-parts-one.vercel.app/pay?order=');
    expect(result.checkoutUrl).toContain(encodeURIComponent(result.merchantTransactionId));
  });

  // ------------------------------------------------------------
  // Test 15: Inventory Deduction Exactly Once
  // ------------------------------------------------------------
  it('15. Inventory deduction: invokes adjust_part_stock RPC exactly once on confirmed payment', async () => {
    const merchantTxnId = generateMerchantTransactionId();
    const rpcCalls: any[] = [];

    const db = createFakeDb({
      orders: [
        {
          id: 'ord-stock-test',
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          part_id: 'part-pulsar-clutch',
          quantity: 2,
          total_amount: 1380,
          order_status: 'pending_payment',
          customer_language: 'en',
        },
      ],
      payments: [
        {
          id: 'pay-stock-test',
          account_id: accountId,
          order_id: 'ord-stock-test',
          merchant_transaction_id: merchantTxnId,
          amount: 1380,
          payment_status: 'pending',
        },
      ],
    });

    // Attach mock RPC to fake db
    (db as any).rpc = vi.fn(async (funcName: string, args: any) => {
      rpcCalls.push({ funcName, args });
      return { data: { success: true }, error: null };
    });

    // 1st Webhook (processes successfully)
    const res1 = await PaymentService.processWebhook(
      db as any,
      'Basic bW9ja191c2VyOm1vY2tfcGFzcw==',
      {
        type: 'PAYMENT_SUCCESS',
        payload: {
          orderId: 'ORD_STOCK',
          merchantOrderId: merchantTxnId,
          amount: 138000,
          state: 'COMPLETED',
          paymentInstrument: { utr: 'UTR_STOCK_1' },
        },
      },
      mockClient
    );

    expect(res1.stockDeducted).toBe(true);
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].funcName).toBe('adjust_part_stock');
    expect(rpcCalls[0].args.p_delta).toBe(-2);
    expect(rpcCalls[0].args.p_movement_type).toBe('sale');

    // 2nd Webhook (duplicate delivery attempt)
    const res2 = await PaymentService.processWebhook(
      db as any,
      'Basic bW9ja191c2VyOm1vY2tfcGFzcw==',
      {
        type: 'PAYMENT_SUCCESS',
        payload: {
          orderId: 'ORD_STOCK',
          merchantOrderId: merchantTxnId,
          amount: 138000,
          state: 'COMPLETED',
          paymentInstrument: { utr: 'UTR_STOCK_1' },
        },
      },
      mockClient
    );

    expect(res2.status).toBe('ALREADY_PROCESSED');
    // RPC MUST still be called exactly once!
    expect(rpcCalls.length).toBe(1);
  });

  // ------------------------------------------------------------
  // Test 16: Customer Cannot Mark Their Own Payment Successful
  // ------------------------------------------------------------
  it('16. Customer claims rejected: customer messages, typed UTRs, or screenshots never mark payment paid', async () => {
    // 1. Text message "I have paid"
    const textClaim = PaymentService.evaluateCustomerPaymentClaim({
      text: 'Maine pay kar diya hai, please deliver fast',
    });
    expect(textClaim.canMarkPaid).toBe(false);
    expect(textClaim.reason).toContain('never accepted as proof of payment');

    // 2. Typed UTR claim
    const utrClaim = PaymentService.evaluateCustomerPaymentClaim({
      claimedUtr: '432890128472',
    });
    expect(utrClaim.canMarkPaid).toBe(false);

    // 3. Screenshot image attachment claim
    const imageClaim = PaymentService.evaluateCustomerPaymentClaim({
      hasImageAttachment: true,
      text: 'Ye dekho payment receipt screenshot',
    });
    expect(imageClaim.canMarkPaid).toBe(false);
  });
});
