// ============================================================
// Auto Parts Inventory & Vehicle Compatibility Types
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

export interface InventoryMetrics {
  total_products: number;
  total_stock_units: number;
  low_stock_products: number;
  out_of_stock_products: number;
  total_cost_value: number;
  total_selling_value: number;
}

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

export interface StockAdjustmentFormData {
  part_id: string;
  delta: number;
  movement_type: StockMovementType;
  reason?: string;
  reference_id?: string;
}

export interface CsvImportRow {
  part_name: string;
  sku: string;
  oem_number?: string;
  alternate_oem_numbers?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  condition?: string;
  cost_price?: string | number;
  selling_price: string | number;
  quantity_in_stock?: string | number;
  low_stock_threshold?: string | number;
  location?: string;
  description?: string;
}

export interface CsvValidationError {
  row: number;
  sku?: string;
  field: string;
  message: string;
}

export interface CsvImportSummary {
  totalRows: number;
  validRows: number;
  imported: number;
  skippedDuplicates: number;
  errors: CsvValidationError[];
}
