-- Migration 072: Add stock sync & reconciliation columns
-- Ensures single source of truth for purchase ledger and inventory tracking

-- 1. Ensure last_restocked_quantity on parts_catalog
ALTER TABLE parts_catalog
  ADD COLUMN IF NOT EXISTS last_restocked_quantity INTEGER DEFAULT 0;

-- 2. Add stock_synced on purchase_orders to prevent duplicate inward stock crediting
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS stock_synced BOOLEAN DEFAULT false;

-- 3. Add stock_deducted on payment_links to prevent duplicate sale deductions
ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;

-- 4. Create helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_parts_catalog_last_po ON parts_catalog(account_id, last_po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_stock_synced ON purchase_orders(account_id, stock_synced);
CREATE INDEX IF NOT EXISTS idx_payment_links_stock_deducted ON payment_links(account_id, stock_deducted);
