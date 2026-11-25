-- ============================================================
-- 071_payment_links_partial_and_paid_amounts.sql
--
-- Support partial payments and paid/remaining balances on payment_links
-- ============================================================

-- 1. Relax/update status check constraint to include 'PARTIAL'
DO $$
BEGIN
  ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_status_check;
  ALTER TABLE payment_links ADD CONSTRAINT payment_links_status_check 
    CHECK (status IN ('PENDING', 'PAID', 'PARTIAL', 'FAILED'));
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- 2. Add paid_amount and remaining_amount columns if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_links' AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE payment_links ADD COLUMN paid_amount NUMERIC(12, 2) DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_links' AND column_name = 'remaining_amount'
  ) THEN
    ALTER TABLE payment_links ADD COLUMN remaining_amount NUMERIC(12, 2);
  END IF;
END $$;
