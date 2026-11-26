-- Migration 074: Razorpay Payment Links & Webhooks
-- Adds Razorpay tracking columns to payment_links and payments

ALTER TABLE payment_links
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_payment_link_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_payment_link_url TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_links_razorpay_payment_id
ON payment_links (razorpay_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_links_razorpay_link_id
ON payment_links (razorpay_payment_link_id);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
