-- ============================================================
-- 066_stock_inward_and_delivery_tracking.sql
--
-- Date-Wise Stock Inward & Delivery Tracking
--
-- Features:
--   1. `parts_catalog` restock quantity tracking:
--      - `last_restocked_quantity INTEGER DEFAULT 0`
--   2. Index on (account_id, last_restocked_quantity)
-- ============================================================

ALTER TABLE parts_catalog
  ADD COLUMN IF NOT EXISTS last_restocked_quantity INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_parts_catalog_restocked_qty
  ON parts_catalog(account_id, last_restocked_quantity);
