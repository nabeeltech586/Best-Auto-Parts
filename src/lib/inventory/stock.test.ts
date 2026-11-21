import { describe, expect, it } from 'vitest';
import {
  calculateNewStock,
  STOCK_MOVEMENT_META,
  STOCK_MOVEMENT_TYPES,
} from './stock';

describe('calculateNewStock', () => {
  it('correctly calculates positive additions (restock)', () => {
    const result = calculateNewStock(10, 5);
    expect(result.valid).toBe(true);
    expect(result.newStock).toBe(15);
  });

  it('correctly calculates negative reductions (sales / scrap)', () => {
    const result = calculateNewStock(10, -4);
    expect(result.valid).toBe(true);
    expect(result.newStock).toBe(6);
  });

  it('prevents stock from dropping below 0', () => {
    const result = calculateNewStock(5, -10);
    expect(result.valid).toBe(false);
    expect(result.newStock).toBe(-5);
    expect(result.error).toContain('cannot be reduced below 0');
  });

  it('allows stock to reach exactly 0 (out of stock)', () => {
    const result = calculateNewStock(5, -5);
    expect(result.valid).toBe(true);
    expect(result.newStock).toBe(0);
  });

  it('rejects invalid inputs', () => {
    const invalidCurrent = calculateNewStock(-1, 5);
    expect(invalidCurrent.valid).toBe(false);

    const nonIntegerDelta = calculateNewStock(10, 2.5);
    expect(nonIntegerDelta.valid).toBe(false);
    expect(nonIntegerDelta.error).toContain('Delta must be an integer');
  });
});

describe('STOCK_MOVEMENT_META', () => {
  it('covers all standard stock movement types', () => {
    STOCK_MOVEMENT_TYPES.forEach((type) => {
      const meta = STOCK_MOVEMENT_META[type];
      expect(meta).toBeDefined();
      expect(typeof meta.label).toBe('string');
      expect(typeof meta.badgeClass).toBe('string');
      expect(typeof meta.isAddition).toBe('boolean');
    });
  });
});
