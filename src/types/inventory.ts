// ============================================================
// Auto Parts Inventory & Vehicle Compatibility Types
// Best Auto Spare Parts App
// ============================================================

export type PartCondition = 'Genuine' | 'OEM' | 'Aftermarket' | 'Used';

export const PART_CONDITIONS: readonly PartCondition[] = [
  'Genuine',
  'OEM',
  'Aftermarket',
  'Used',
] as const;

export type StockMovementType =
  | 'increase'
  | 'decrease'
  | 'adjustment'
  | 'sale'
  | 'return';

// ============================================================
// PART CATALOG
// ============================================================

export interface PartCatalogItem {
  id: string;
  account_id: string;
  part_name: string;
  sku: string;
  oem_number: string | null;
  alternate_oem_numbers: string[];
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  condition: PartCondition;
  description: string | null;
  cost_price: number;
  selling_price: number;
  quantity_in_stock: number;
  low_stock_threshold: number;
  location: string | null;
  image_urls: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  fitments?: VehicleFitment[];
}

/**
 * Customer-Facing Part Representation.
 * Strictly excludes internal stock quantities, cost prices, and storage locations.
 */
export interface CustomerFacingPart {
  id: string;
  part_name: string;
  sku: string;
  oem_number: string | null;
  alternate_oem_numbers: string[];
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  condition: PartCondition;
  description: string | null;
  selling_price: number;
  image_urls: string[];
  is_available: boolean;
  fitments?: VehicleFitment[];
}

// ============================================================
// VEHICLE COMPATIBILITY / FITMENT
// ============================================================

export interface VehicleFitment {
  id: string;
  account_id: string;
  part_id: string;
  vehicle_type: string;
  manufacturer: string;
  model: string;
  variant: string | null;
  year_from: number;
  year_to: number | null;
  engine: string | null;
  fuel_type: string | null;
  notes: string | null;
  created_at: string;
}

// ============================================================
// STOCK MOVEMENT / INVENTORY HISTORY
// ============================================================

export interface StockMovement {
  id: string;
  account_id: string;
  part_id: string;
  user_id: string | null;
  movement_type: StockMovementType;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  reference_id: string | null;
  created_at: string;
  user_name?: string | null;
}

// ============================================================
// INVENTORY DASHBOARD METRICS
// ============================================================

export interface InventoryMetrics {
  total_products: number;
  total_stock_units: number;
  low_stock_products: number;
  out_of_stock_products: number;
  total_cost_value: number;
  total_selling_value: number;
}

// ============================================================
// INVENTORY FILTERS & PAGINATION
// ============================================================

export interface InventoryFilterParams {
  search?: string;
  category?: string;
  brand?: string;
  condition?: PartCondition | 'all';
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  vehicleManufacturer?: string;
  vehicleModel?: string;
  sortBy?: 'name' | 'sku' | 'price' | 'stock' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// ============================================================
// PART FORM DATA
// ============================================================

export interface PartFormData {
  part_name: string;
  sku: string;
  oem_number?: string;
  alternate_oem_numbers?: string[];
  brand?: string;
  category?: string;
  subcategory?: string;
  condition: PartCondition;
  description?: string;
  cost_price: number;
  selling_price: number;
  quantity_in_stock: number;
  low_stock_threshold: number;
  location?: string;
  image_urls?: string[];
  is_active?: boolean;
}

// ============================================================
// VEHICLE FITMENT FORM DATA
// ============================================================

export interface VehicleFitmentFormData {
  vehicle_type?: string;
  manufacturer: string;
  model: string;
  variant?: string;
  year_from: number;
  year_to?: number;
  engine?: string;
  fuel_type?: string;
  notes?: string;
}

// ============================================================
// STOCK ADJUSTMENT FORM DATA
// ============================================================

export interface StockAdjustmentFormData {
  part_id: string;
  delta: number;
  movement_type: StockMovementType;
  reason?: string;
  reference_id?: string;
}

// ============================================================
// CSV IMPORT ROW
// ============================================================

export interface CsvImportRow {
  part_name: string;
  sku: string;
  oem_number?: string;
  alternate_oem_numbers?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  condition?: PartCondition | string;
  cost_price?: string | number;
  selling_price: string | number;
  quantity_in_stock?: string | number;
  low_stock_threshold?: string | number;
  location?: string;
  description?: string;
  quality_review_notes?: string;
}

// ============================================================
// CSV VALIDATION ERROR
// ============================================================

export interface CsvValidationError {
  row: number;
  sku?: string;
  field: string;
  message: string;
}

// ============================================================
// CSV IMPORT SUMMARY
// ============================================================

export interface CsvImportSummary {
  totalRows: number;
  validRows: number;
  imported: number;
  skippedDuplicates: number;
  errors: CsvValidationError[];
}