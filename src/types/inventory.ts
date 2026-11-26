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
  image_url?: string | null;
  image_urls: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Restock & PO confirmation tracking
  last_restocked_at?: string | null;
  last_po_number?: string | null;
  last_restocked_quantity?: number | null;
  pending_po?: { po_number: string; date: string } | null;

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
  image_url?: string;
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

// ============================================================
// SUPPLIERS / DISTRIBUTORS DIRECTORY
// ============================================================

export interface Supplier {
  id: string;
  account_id: string;
  firm_name: string;
  contact_person?: string | null;
  whatsapp_number: string;
  brand_specialty: string[];
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierFormData {
  firm_name: string;
  contact_person?: string;
  whatsapp_number: string;
  brand_specialty: string[];
  address?: string;
  notes?: string;
  is_active?: boolean;
}

// ============================================================
// PURCHASE ORDERS (PO) & RESTOCK
// ============================================================

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';
export type PurchaseOrderPaymentStatus = 'UNPAID' | 'PENDING' | 'PARTIAL' | 'PAID';

export interface PurchaseOrderItem {
  part_id: string;
  part_name: string;
  sku: string;
  oem_number?: string | null;
  brand?: string | null;
  cost_price: number;
  unit_cost?: number;
  quantity: number;
  total_cost: number;
  // Inward restock tracking details
  prev_stock?: number;
  new_stock?: number;
  quantity_added?: number;
  received_at?: string;
  received_date_formatted?: string;
  inward_reference?: string;
}

export interface PurchaseOrder {
  id: string;
  account_id: string;
  po_number: string;
  supplier_id?: string | null;
  supplier_name: string;
  supplier_phone: string;
  items: PurchaseOrderItem[];
  total_items: number;
  total_units: number;
  total_estimated_cost: number;
  notes?: string | null;
  status: PurchaseOrderStatus;
  payment_status?: PurchaseOrderPaymentStatus;
  amount_paid?: number;
  confirmed_at?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePurchaseOrderPayload {
  po_number?: string;
  supplier_id?: string | null;
  supplier_name: string;
  supplier_phone: string;
  items: PurchaseOrderItem[];
  notes?: string;
  send_via_whatsapp?: boolean;
}

// ============================================================
// SUPPLIER / DISTRIBUTOR KHATA & PAYMENTS
// ============================================================

export type SupplierPaymentMode = 'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque' | 'Razorpay' | 'Cash / Quick Settle' | string;

export interface SupplierPayment {
  id: string;
  account_id: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_order_id?: string | null;
  user_id?: string | null;
  amount: number;
  payment_mode: SupplierPaymentMode;
  reference_id?: string | null;
  notes?: string | null;
  paid_at: string;
  created_at: string;
  supplier?: {
    firm_name: string;
    whatsapp_number: string;
  };
}

// ============================================================
// MECHANIC LOYALTY & KHATA LEDGER
// ============================================================

export type MechanicLedgerType = 'credit_udhaar' | 'debit_payment';
export type MechanicLoyaltyTier = 'Partner' | 'Silver' | 'Gold' | 'VIP';
export type MechanicKhataStage =
  | 'Active Clear'
  | 'Running Monthly Khata'
  | 'Payment Due'
  | 'Gold & VIP Partners'
  | 'Settled This Month';

export interface MechanicLedgerEntry {
  id: string;
  account_id: string;
  contact_id: string;
  user_id?: string | null;
  entry_type: MechanicLedgerType;
  amount: number;
  description?: string | null;
  payment_mode?: SupplierPaymentMode | null;
  reference_id?: string | null;
  balance_after: number;
  created_at: string;
}

export interface MechanicContact {
  id: string;
  account_id: string;
  name: string;
  phone: string;
  company?: string | null;
  pending_balance: number;
  monthly_purchases: number;
  loyalty_tier: MechanicLoyaltyTier;
  khata_stage: MechanicKhataStage;
  recent_entries?: MechanicLedgerEntry[];
  created_at?: string;
  updated_at?: string;
}
