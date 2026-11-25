import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deductStockForSale,
  restoreStockForCancelledOrder,
} from './stock-deduction';

describe('stock-deduction', () => {
  const fakeAccountId = '11111111-1111-4111-8111-111111111111';
  const fakePartId = '22222222-2222-4222-8222-222222222222';

  it('deducts exact sold quantity from parts_catalog and records in stock_movements', async () => {
    let updatedCatalog: any = null;
    let insertedMovement: any = null;

    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === 'stock_movements') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((payload) => {
              insertedMovement = payload;
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        if (table === 'parts_catalog') {
          return {
            select: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: fakePartId,
                account_id: fakeAccountId,
                part_name: 'Hero Splendor Brake Shoe',
                sku: 'SKU-HER-BRK-001',
                quantity_in_stock: 25,
                low_stock_threshold: 5,
              },
              error: null,
            }),
            update: vi.fn((payload) => {
              updatedCatalog = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        if (table === 'payment_links') {
          return {
            update: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };

    const res = await deductStockForSale(mockDb, {
      accountId: fakeAccountId,
      orderId: 'ORD-98765',
      itemDescription: 'Hero Splendor Brake Shoe (x3)',
      referenceId: 'UPI-TXN-112233',
    });

    expect(res.success).toBe(true);
    expect(res.deductedCount).toBe(1);
    expect(res.totalQuantityDeducted).toBe(3);
    expect(updatedCatalog.quantity_in_stock).toBe(22); // 25 - 3
    expect(insertedMovement.movement_type).toBe('decrease');
    expect(insertedMovement.quantity_delta).toBe(-3);
    expect(insertedMovement.quantity_before).toBe(25);
    expect(insertedMovement.quantity_after).toBe(22);
    expect(insertedMovement.reference_id).toBe('UPI-TXN-112233');
  });

  it('prevents double-deduction when order reference has already been deducted', async () => {
    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === 'stock_movements') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'existing-movement-1' }],
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    const res = await deductStockForSale(mockDb, {
      accountId: fakeAccountId,
      orderId: 'ORD-98765',
      itemDescription: 'Hero Splendor Brake Shoe',
      referenceId: 'UPI-TXN-112233',
    });

    expect(res.success).toBe(true);
    expect(res.alreadyDeducted).toBe(true);
    expect(res.deductedCount).toBe(0);
  });

  it('restores stock when order is cancelled or refunded', async () => {
    let restoredStock: any = null;
    let restoreMovement: any = null;

    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === 'stock_movements') {
          const queryObj: any = {
            data: [
              {
                id: 'mov-1',
                part_id: fakePartId,
                quantity_delta: -3,
                movement_type: 'decrease',
              },
            ],
            error: null,
          };
          queryObj.select = vi.fn().mockReturnValue(queryObj);
          queryObj.eq = vi.fn().mockReturnValue(queryObj);
          queryObj.limit = vi.fn().mockReturnValue(queryObj);
          queryObj.then = (fn: any) => Promise.resolve({ data: queryObj.data, error: null }).then(fn);
          queryObj.insert = vi.fn((payload: any) => {
            restoreMovement = payload;
            return Promise.resolve({ data: null, error: null });
          });
          return queryObj;
        }
        if (table === 'parts_catalog') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: fakePartId,
                account_id: fakeAccountId,
                quantity_in_stock: 22,
              },
            }),
            update: vi.fn((payload) => {
              restoredStock = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        if (table === 'payment_links') {
          return {
            update: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };

    const res = await restoreStockForCancelledOrder(mockDb, {
      accountId: fakeAccountId,
      orderId: 'ORD-98765',
      referenceId: 'UPI-TXN-112233',
    });

    expect(res.success).toBe(true);
    expect(res.restoredCount).toBe(1);
    expect(restoredStock.quantity_in_stock).toBe(25); // 22 + 3
    expect(restoreMovement.movement_type).toBe('increase');
    expect(restoreMovement.quantity_delta).toBe(3);
    expect(restoreMovement.quantity_before).toBe(22);
    expect(restoreMovement.quantity_after).toBe(25);
  });
});
