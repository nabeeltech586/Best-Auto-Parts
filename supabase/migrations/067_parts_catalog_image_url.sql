-- ============================================================
-- 067_parts_catalog_image_url.sql
--
-- Product Visuals & Thumbnail Tracking
--
-- Features:
--   1. `parts_catalog.image_url TEXT`
--   2. Index on (account_id, image_url)
-- ============================================================

ALTER TABLE parts_catalog
  ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_parts_catalog_image_url
  ON parts_catalog(account_id, image_url);
