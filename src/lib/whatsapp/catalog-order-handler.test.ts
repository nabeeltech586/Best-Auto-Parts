import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCatalogOrderInbound } from './catalog-order-handler';

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ success: true, messageId: 'wamid.msg123' }),
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

  it('matches catalog SKU, records order & payment link, deducts stock, and sends confirmation with UPI', async () => {
    const insertedOrders: any[] = [];
    const insertedPaymentLinks: any[] = [];
    const { engineSendText } = await import('@/lib/flows/meta-send');
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

    // Verify order inserted
    expect(insertedOrders.length).toBe(1);
    expect(insertedOrders[0].catalog_order_id).toBe('wamid.order.unique.456');
    expect(insertedOrders[0].total_amount).toBe(170);
    expect(insertedOrders[0].quantity).toBe(2);

    // Verify payment link inserted
    expect(insertedPaymentLinks.length).toBe(1);
    expect(insertedPaymentLinks[0].customer_name).toBe('Mohd Rashid');
    expect(insertedPaymentLinks[0].amount).toBe(170);

    // Verify stock deduction called
    expect(deductStockForSale).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        accountId: fakeAccountId,
        referenceId: 'wamid.order.unique.456',
      })
    );

    // Verify WhatsApp reply sent with UPI details & Kailashpur address
    expect(engineSendText).toHaveBeenCalledTimes(1);
    const sentMessage = (engineSendText as any).mock.calls[0][0].text;
    expect(sentMessage).toContain('Mohd Rashid');
    expect(sentMessage).toContain('Hero Splendor Brake Shoe');
    expect(sentMessage).toContain('₹170.00');
    expect(sentMessage).toContain('9761224004-2@ybl');
    expect(sentMessage).toContain('Saud Khan');
    expect(sentMessage).toContain('Kailashpur, Saharanpur, UP 247001');
    expect(sentMessage).toContain('+91 96347 22174');
  });
});
