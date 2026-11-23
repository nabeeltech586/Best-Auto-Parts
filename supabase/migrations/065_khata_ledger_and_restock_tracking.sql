-- ============================================================
-- 065_khata_ledger_and_restock_tracking.sql
--
-- Best Auto Parts: 3-Way Khata/Ledger System & Catalog Restock Tracking
--
-- Features:
--   1. `parts_catalog` restock tracking:
--      - `last_restocked_at TIMESTAMPTZ`
--      - `last_po_number TEXT`
--   2. `purchase_orders` payment tracking & confirmation:
--      - `confirmed_at TIMESTAMPTZ`
--      - `payment_status TEXT ('UNPAID', 'PARTIAL', 'PAID')`
--      - `amount_paid NUMERIC(12, 2)`
--   3. `supplier_payments` — Distributor / Wholesaler payment ledger:
--      - Records every payment made to suppliers with mode and ref ID.
--   4. `mechanic_ledger_entries` — Mechanic Khata & Credit ledger:
--      - Records every Udhaar (credit) and Settlement (debit) with running balance.
--   5. `contacts` mechanic Khata columns:
--      - `pending_balance NUMERIC(12, 2)`
--      - `monthly_purchases NUMERIC(12, 2)`
--      - `loyalty_tier TEXT ('Partner', 'Silver', 'Gold', 'VIP')`
--      - `khata_stage TEXT ('Active Clear', 'Running Monthly Khata', 'Payment Due', 'Gold & VIP Partners', 'Settled This Month')`
--   6. Strict tenant-isolation RLS on both new ledger tables.
--   7. Updates `redeem_invitation(TEXT)` RPC to guard both new tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ALTER PARTS_CATALOG (RESTOCK TRACKING)
-- ------------------------------------------------------------
ALTER TABLE parts_catalog
  ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_po_number TEXT;

CREATE INDEX IF NOT EXISTS idx_parts_catalog_restocked ON parts_catalog(account_id, last_restocked_at DESC);

-- ------------------------------------------------------------
-- 2. ALTER PURCHASE_ORDERS (CONFIRMATION & KHATA)
-- ------------------------------------------------------------
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PENDING', 'PARTIAL', 'PAID')),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (amount_paid >= 0);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_status ON purchase_orders(account_id, payment_status);

-- ------------------------------------------------------------
-- 3. SUPPLIER_PAYMENTS TABLE (DISTRIBUTOR KHATA)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'UPI'
    CHECK (payment_mode IN ('UPI', 'Cash', 'Bank Transfer', 'Cheque', 'PhonePe', 'Cash / Quick Settle', 'Quick Settle')),
  reference_id TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_account ON supplier_payments(account_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(account_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_po ON supplier_payments(purchase_order_id);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_payments_select ON supplier_payments
  FOR SELECT
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY supplier_payments_insert ON supplier_payments
  FOR INSERT
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY supplier_payments_update ON supplier_payments
  FOR UPDATE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY supplier_payments_delete ON supplier_payments
  FOR DELETE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ------------------------------------------------------------
-- 4. ALTER CONTACTS (MECHANIC KHATA & LOYALTY)
-- ------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS monthly_purchases NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS loyalty_tier TEXT NOT NULL DEFAULT 'Partner'
    CHECK (loyalty_tier IN ('Partner', 'Silver', 'Gold', 'VIP')),
  ADD COLUMN IF NOT EXISTS khata_stage TEXT NOT NULL DEFAULT 'Active Clear'
    CHECK (khata_stage IN ('Active Clear', 'Running Monthly Khata', 'Payment Due', 'Gold & VIP Partners', 'Settled This Month'));

CREATE INDEX IF NOT EXISTS idx_contacts_khata_stage ON contacts(account_id, khata_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_loyalty_tier ON contacts(account_id, loyalty_tier);

-- ------------------------------------------------------------
-- 5. MECHANIC_LEDGER_ENTRIES TABLE (MECHANIC KHATA)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechanic_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit_udhaar', 'debit_payment')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  payment_mode TEXT CHECK (payment_mode IN ('UPI', 'Cash', 'Bank Transfer', 'Cheque')),
  reference_id TEXT,
  balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mechanic_ledger_contact ON mechanic_ledger_entries(account_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mechanic_ledger_type ON mechanic_ledger_entries(account_id, entry_type);

ALTER TABLE mechanic_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY mechanic_ledger_select ON mechanic_ledger_entries
  FOR SELECT
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY mechanic_ledger_insert ON mechanic_ledger_entries
  FOR INSERT
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY mechanic_ledger_update ON mechanic_ledger_entries
  FOR UPDATE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY mechanic_ledger_delete ON mechanic_ledger_entries
  FOR DELETE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ------------------------------------------------------------
-- 6. REDEEM INVITATION INTEGRITY GUARD UPDATE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > NOW();

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found or expired' USING ERRCODE = 'P0002';
  END IF;

  SELECT account_id, user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles
  WHERE user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RETURN v_inv.account_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE account_id = v_old_account_id
      AND user_id <> v_caller_id
  ) THEN
    RAISE EXCEPTION 'Your account has other members; remove them or transfer ownership before joining another account'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automation_logs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automation_pending_executions WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flow_runs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM deals WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM api_keys WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM webhook_endpoints WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM quick_replies WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM notifications WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_configs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_knowledge_documents WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_knowledge_chunks WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_usage_log WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM parts_catalog WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM vehicle_fitment WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM stock_movements WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM orders WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM payments WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM payment_links WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM suppliers WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM purchase_orders WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM supplier_payments WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM mechanic_ledger_entries WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
