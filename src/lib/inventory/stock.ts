import type { StockMovementType } from '@/types/inventory';

export const STOCK_MOVEMENT_TYPES: readonly StockMovementType[] = [
  'increase',
  'decrease',
  'adjustment',
  'sale',
  'return',
] as const;

export const STOCK_MOVEMENT_META: Record<
  StockMovementType,
  { label: string; badgeClass: string; isAddition: boolean }
> = {
  increase: {
    label: 'Restock / Received',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    isAddition: true,
  },
  return: {
    label: 'Customer Return',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    isAddition: true,
  },
  decrease: {
    label: 'Damaged / Removed',
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
    isAddition: false,
  },
  sale: {
    label: 'Order Sale',
    badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    isAddition: false,
  },
  adjustment: {
    label: 'Manual Count Audit',
    badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    isAddition: false,
  },
};

/**
 * Calculate expected new stock based on current stock, operation, and delta/quantity.
 */
export function calculateNewStock(
  currentStock: number,
  delta: number,
): { valid: boolean; newStock: number; error?: string } {
  if (isNaN(currentStock) || currentStock < 0) {
    return { valid: false, newStock: currentStock, error: 'Current stock is invalid' };
  }
  if (isNaN(delta) || !Number.isInteger(delta)) {
    return { valid: false, newStock: currentStock, error: 'Delta must be an integer' };
  }

  const newStock = currentStock + delta;
  if (newStock < 0) {
    return {
      valid: false,
      newStock,
      error: `Stock cannot be reduced below 0. Current stock is ${currentStock}, adjustment is ${delta}.`,
    };
  }

  return { valid: true, newStock };
}
