import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCatalogOrderInbound } from './catalog-order-handler';
import { createRazorpayPaymentLink } from '@/lib/payments/razorpay';

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ success: true, messageId: 'wamid.msg123' }),
  engineSendInteractiveCtaUrl: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.msg123' }),
  engineSendInteractiveButtons: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.msg123' }),
}));

vi.mock('@/lib/inventory/stock-deduction', () => ({
  deductStockForSale: vi.fn().mockResolvedValue({
    success: true,
    deductedCount: 1,
    totalQuantityDeducted: 2,
    details: [
      {
        partId: 'p1',
        partName: 'Hero Splendor Brake Shoe',
        sku: 'SKU-HER-001',
        quantityDeducted: 2,
        prevStock: 10,
        newStock: 8,
      },
    ],
  }),
}));

vi.mock('@/lib/catalog/meta-sync', () => ({
  triggerCatalogSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/payments/razorpay', () => ({
  createRazorpayPaymentLink: vi.fn().mockResolvedValue({
    success: true,
    paymentLink: 'https://rzp.io/i/testOrderLink',
    shortUrl: 'https://rzp.io/i/testOrderLink',
    paymentLinkId: 'plink_order123',
    merchantTransactionId: 'ORD-CAT-123',
    orderId: 'ORD-CAT-123',
    amount: 170,
  }),
}));

describe('handleCatalogOrderInbound', () => {
  const fakeAccountId = 'acc_123';
  const fakeUserId = 'usr_123';
  const fakeConvId = 'conv_123';
  const fakeContactId = 'cont_123';
  const fakePhone = '919876543210';
  const fakeWamid = 'wamid.HBgLM...';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles existing order idempotently without duplicate insert or deduction', async () => {
    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'ORD-CAT-999999', total_amount: 170 },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const result = await handleCatalogOrderInbound({
      db: mockDb,
      accountId: fakeAccountId,
      userId: fakeUserId,
      conversationId: fakeConvId,
      contactId: fakeContactId,
      senderPhone: fakePhone,
      customerName: 'Adnan Khan',
      wamid: fakeWamid,
      order: {
        product_items: [
          {
            product_retailer_id: 'SKU-HER-001',
            quantity: 2,
            item_price: 85,
            currency: 'INR',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.orderId).toBe('ORD-CAT-999999');
    expect(result.totalAmount).toBe(170);
  });

  it('matches catalog SKU, records PENDING/UNPAID order & payment link, leaves stock untouched, and sends direct Pay Now CTA button', async () => {
    const insertedOrders: any[] = [];
    const insertedPaymentLinks: any[] = [];
    const { engineSendInteractiveCtaUrl } = await import('@/lib/flows/meta-send');
    const { deductStockForSale } = await import('@/lib/inventory/stock-deduction');

    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn((payload) => {
              insertedOrders.push(payload);
              return Promise.resolve({ data: payload, error: null });
            }),
          };
        }
        if (table === 'parts_catalog') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'p1',
                    sku: 'SKU-HER-001',
                    part_name: 'Hero Splendor Brake Shoe',
                    brand: 'Hero Genuine',
                    selling_price: 85,
                    quantity_in_stock: 10,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'payment_links') {
          return {
            insert: vi.fn((payload) => {
              insertedPaymentLinks.push(payload);
              return Promise.resolve({ data: payload, error: null });
            }),
          };
        }
        return {};
      }),
    };

    const result = await handleCatalogOrderInbound({
      db: mockDb,
      accountId: fakeAccountId,
      userId: fakeUserId,
      conversationId: fakeConvId,
      contactId: fakeContactId,
      senderPhone: fakePhone,
      customerName: 'Mohd Rashid',
      wamid: 'wamid.order.unique.456',
      order: {
        text: 'Please pack in genuine box',
        product_items: [
          {
            product_retailer_id: 'SKU-HER-001',
            quantity: 2,
            item_price: 85,
            currency: 'INR',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.totalAmount).toBe(170);

    // Verify order inserted with pending status
    expect(insertedOrders.length).toBe(1);
    expect(insertedOrders[0].catalog_order_id).toBe('wamid.order.unique.456');
    expect(insertedOrders[0].total_amount).toBe(170);
    expect(insertedOrders[0].quantity).toBe(2);
    expect(insertedOrders[0].order_status).toBe('pending');
    expect(insertedOrders[0].payment_status).toBe('UNPAID');

    // Verify Razorpay payment link created
    expect(createRazorpayPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: expect.stringMatching(/^ORD-CAT-/),
        amount: 170,
        customerName: 'Mohd Rashid',
        customerPhone: fakePhone,
        accountId: fakeAccountId,
      })
    );

    // Verify stock is NOT deducted on order creation (stock deducts ONLY when payment succeeds)
    expect(deductStockForSale).not.toHaveBeenCalled();

    // Verify WhatsApp reply sent with direct "💳 Pay Now" CTA URL button
    expect(engineSendInteractiveCtaUrl).toHaveBeenCalledTimes(1);
    const ctaCall = (engineSendInteractiveCtaUrl as any).mock.calls[0][0];
    expect(ctaCall.buttonText).toBe('💳 Pay Now');
    expect(ctaCall.url).toBe('https://rzp.io/i/testOrderLink');
    expect(ctaCall.bodyText).toContain('Mohd Rashid');
    expect(ctaCall.bodyText).toContain('Hero Splendor Brake Shoe');
    expect(ctaCall.bodyText).toContain('₹170.00');
    expect(ctaCall.bodyText).toContain('+91 96347 22174');
    // Ensure no vercel.app link is exposed
    expect(ctaCall.bodyText).not.toContain('best-auto-parts-one.vercel.app');
  });

  it('falls back to engineSendText if engineSendInteractiveCtaUrl throws', async () => {
    const { engineSendInteractiveCtaUrl, engineSendText } = await import('@/lib/flows/meta-send');
    (engineSendInteractiveCtaUrl as any).mockRejectedValueOnce(new Error('Meta API network error'));

    const mockDb: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const result = await handleCatalogOrderInbound({
      db: mockDb,
      accountId: fakeAccountId,
      userId: fakeUserId,
      conversationId: fakeConvId,
      contactId: fakeContactId,
      senderPhone: fakePhone,
      customerName: 'Aman Sharma',
      wamid: 'wamid.order.unique.fallback',
      order: {
        product_items: [
          {
            product_retailer_id: 'SKU-001',
            quantity: 1,
            item_price: 150,
            currency: 'INR',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(engineSendText).toHaveBeenCalledTimes(1);
    const sent = (engineSendText as any).mock.calls[0][0].text;
    expect(sent).toContain('Aman Sharma');
    expect(sent).toContain('₹150.00');
    expect(sent).not.toContain('best-auto-parts-one.vercel.app');
  });
});
