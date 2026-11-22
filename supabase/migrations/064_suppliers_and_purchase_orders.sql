-- ============================================================
-- 064_suppliers_and_purchase_orders.sql
--
-- Suppliers / Distributors Directory & Restock Purchase Orders
--
-- Features:
--   1. `suppliers` — Wholesalers and distributors directory with
--      firm name, contact person, WhatsApp number, brand specialty.
--   2. `purchase_orders` — Restock purchase orders with line items,
--      quantities, cost estimates, status (DRAFT, SENT, RECEIVED),
--      and auto-restock receiving.
--   3. Strict tenant-isolation Row Level Security (RLS) policies.
--   4. Updates `redeem_invitation(TEXT)` RPC to guard both tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SUPPLIERS / DISTRIBUTORS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  firm_name TEXT NOT NULL,
  contact_person TEXT,
  whatsapp_number TEXT NOT NULL,
  brand_specialty TEXT[] NOT NULL DEFAULT '{}',
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_account_active ON suppliers(account_id, is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_firm_name ON suppliers(account_id, firm_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(account_id, whatsapp_number);

-- ------------------------------------------------------------
-- 2. PURCHASE ORDERS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  supplier_phone TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  total_items INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  total_estimated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_estimated_cost >= 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_purchase_orders_account_po UNIQUE (account_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_account_status ON purchase_orders(account_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_account_created ON purchase_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(account_id, supplier_id);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- Suppliers policies
CREATE POLICY suppliers_select ON suppliers
  FOR SELECT
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY suppliers_delete ON suppliers
  FOR DELETE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- Purchase Orders policies
CREATE POLICY purchase_orders_select ON purchase_orders
  FOR SELECT
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY purchase_orders_insert ON purchase_orders
  FOR INSERT
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY purchase_orders_update ON purchase_orders
  FOR UPDATE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY purchase_orders_delete ON purchase_orders
  FOR DELETE
  USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ------------------------------------------------------------
-- 4. REDEEM INVITATION INTEGRITY GUARD UPDATE
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
