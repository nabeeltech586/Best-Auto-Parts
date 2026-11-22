import type {
  PartCatalogItem,
  PartCondition,
  PartFormData,
} from '@/types/inventory';
import { PART_CONDITIONS } from '@/types/inventory';

/**
 * Validate a Part form payload before saving or updating.
 */
export function validatePartPayload(data: Partial<PartFormData>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!data.part_name || !data.part_name.trim()) {
    errors.part_name = 'Part name is required';
  }

  if (!data.sku || !data.sku.trim()) {
    errors.sku = 'SKU is required';
  } else if (!/^[A-Za-z0-9-_./]{2,50}$/.test(data.sku.trim())) {
    errors.sku = 'SKU must be 2-50 alphanumeric characters (-, _, ., / allowed)';
  }

  if (data.selling_price === undefined || isNaN(Number(data.selling_price)) || Number(data.selling_price) < 0) {
    errors.selling_price = 'Selling price must be a valid non-negative number';
  }

  if (data.cost_price !== undefined && (isNaN(Number(data.cost_price)) || Number(data.cost_price) < 0)) {
    errors.cost_price = 'Cost price must be a non-negative number';
  }

  if (
    data.quantity_in_stock !== undefined &&
    (!Number.isInteger(Number(data.quantity_in_stock)) || Number(data.quantity_in_stock) < 0)
  ) {
    errors.quantity_in_stock = 'Quantity in stock must be a non-negative integer';
  }

  if (
    data.low_stock_threshold !== undefined &&
    (!Number.isInteger(Number(data.low_stock_threshold)) || Number(data.low_stock_threshold) < 0)
  ) {
    errors.low_stock_threshold = 'Low stock threshold must be a non-negative integer';
  }

  if (data.condition && !PART_CONDITIONS.includes(data.condition as PartCondition)) {
    errors.condition = `Condition must be one of: ${PART_CONDITIONS.join(', ')}`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Clean and normalize alternate OEM numbers into a clean string array.
 */
export function normalizeAlternateOemNumbers(
  input: string | string[] | undefined | null,
): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    );
  }
  return Array.from(
    new Set(
      input
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

/**
 * Determine stock status of a part for badges & alerts.
 */
export function getStockStatus(part: Pick<PartCatalogItem, 'quantity_in_stock' | 'low_stock_threshold'>): {
  status: 'out_of_stock' | 'low_stock' | 'in_stock';
  label: string;
  badgeClass: string;
} {
  if (part.quantity_in_stock <= 0) {
    return {
      status: 'out_of_stock',
      label: 'Out of Stock',
      badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
  }
  if (part.quantity_in_stock <= part.low_stock_threshold) {
    return {
      status: 'low_stock',
      label: 'Low Stock',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
  }
  return {
    status: 'in_stock',
    label: 'In Stock',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
}

/**
 * Format currency with 2 decimals.
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export { toCustomerSafePart } from '@/lib/ai/stock-privacy';
export const getPartStockStatus = getStockStatus;
