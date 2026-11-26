-- Migration 075: Local Rider Delivery Tracking for Best Auto Parts (Kailashpur, Saharanpur)
-- Adds rider assignment, phone, delivery status lifecycle, and timestamp tracking

-- 1. Extend payment_links table
ALTER TABLE payment_links
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'Confirmed',
ADD COLUMN IF NOT EXISTS rider_name TEXT,
ADD COLUMN IF NOT EXISTS rider_phone TEXT,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_links_delivery_status
ON payment_links (delivery_status);

CREATE INDEX IF NOT EXISTS idx_payment_links_rider_phone
ON payment_links (rider_phone);

-- 2. Extend orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'Confirmed',
ADD COLUMN IF NOT EXISTS rider_name TEXT,
ADD COLUMN IF NOT EXISTS rider_phone TEXT,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_status
ON orders (delivery_status);
