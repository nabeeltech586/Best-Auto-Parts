-- Migration 073: WhatsApp / Meta Commerce Catalog Synchronization
-- Supports direct Meta Graph API catalog sync, webhook order processing, and feed tracking

-- 1. Add catalog_id to whatsapp_config for direct Meta Graph API sync
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS catalog_id TEXT;

-- 2. Add catalog_order_id to orders table to correlate with Meta Catalog incoming orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS catalog_order_id TEXT;

-- 3. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_orders_catalog_order_id ON orders(account_id, catalog_order_id);
