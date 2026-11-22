-- ============================================================
-- 062_orders_and_payments.sql
--
-- Orders & PhonePe Automated Online Payment Infrastructure
--
-- Features:
--   1. `orders` — customer purchase orders originating from WhatsApp CRM,
--      tracking item, quantity, unit price, total amount, fulfillment mode
--      (pickup, delivery, online checkout), and lifecycle states.
--   2. `payments` — transaction-level records for PhonePe Payment Gateway (v2),
--      tracking merchant transaction ID, provider transaction ID,
--      payment method (UPI_QR, UPI_COLLECT, UPI_INTENT, CHECKOUT_LINK),
--      cryptographic status, bank UTR, and separate settlement status.
--   3. Strict separation of customer fund capture (`payment_status`)
--      from merchant bank payout (`settlement_status`).
--   4. Expiration tracking with 15-minute default TTL.
--   5. Tenant isolation (account_id) with RLS policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS FOR ORDERS & PAYMENTS
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE order_status_type AS ENUM (
    'draft',
    'pending_payment',
    'paid',
    'processing',
    'ready_for_pickup',
    'shipped',
    'completed',
    'cancelled',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_type AS ENUM (
    'unpaid',
    'pending',
    'paid',
    'failed',
    'expired',
    'refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_status_type AS ENUM (
    'unsettled',
    'settled',
    'delayed',
    'chargeback'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_choice_type AS ENUM (
    'store_pickup',
    'home_delivery',
    'online_checkout'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------
-- 2. ORDERS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  part_id UUID REFERENCES parts_catalog(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  fulfillment_type TEXT NOT NULL DEFAULT 'store_pickup'
    CHECK (fulfillment_type IN ('store_pickup', 'home_delivery', 'online_checkout')),
  delivery_address TEXT,
  order_status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (order_status IN ('draft', 'pending_payment', 'paid', 'processing', 'ready_for_pickup', 'shipped', 'completed', 'cancelled', 'expired')),
  customer_language VARCHAR(10) NOT NULL DEFAULT 'en',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_contact_id ON orders(account_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_part_id ON orders(part_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(account_id, order_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(account_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. PAYMENTS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_transaction_id TEXT NOT NULL UNIQUE,
  phonepe_transaction_id TEXT,
  payment_method TEXT NOT NULL DEFAULT 'UPI_QR'
    CHECK (payment_method IN ('UPI_QR', 'UPI_COLLECT', 'UPI_INTENT', 'CHECKOUT_LINK')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'expired', 'refunded')),
  settlement_status TEXT NOT NULL DEFAULT 'unsettled'
    CHECK (settlement_status IN ('unsettled', 'settled', 'delayed', 'chargeback')),
  utr TEXT,
  phonepe_response_code TEXT,
  error_message TEXT,
  qr_payload TEXT,
  checkout_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_merchant_tx ON payments(merchant_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_account_id ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(account_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_settlement ON payments(account_id, settlement_status);
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at) WHERE payment_status = 'pending';

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Orders RLS policies
DROP POLICY IF EXISTS orders_select ON orders;
CREATE POLICY orders_select ON orders
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS orders_insert ON orders;
CREATE POLICY orders_insert ON orders
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS orders_update ON orders;
CREATE POLICY orders_update ON orders
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS orders_delete ON orders;
CREATE POLICY orders_delete ON orders
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Payments RLS policies
DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_delete ON payments
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ------------------------------------------------------------
-- 5. UPDATE redeem_invitation RPC (ACCOUNT DELETION GUARD)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_invitation(TEXT);
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

-- ------------------------------------------------------------
-- 6. ALLOW service_role BACKGROUND DECREMENT IN adjust_part_stock
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_part_stock(
  p_account_id UUID,
  p_part_id UUID,
  p_delta INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_movement_type TEXT DEFAULT 'adjustment',
  p_reference_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_movement_id UUID;
BEGIN
  -- Verify membership & role: must be at least agent, or service_role background webhook process
  IF auth.role() <> 'service_role' AND NOT is_account_member(p_account_id, 'agent') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient role to adjust inventory stock';
  END IF;

  -- Lock row for update to prevent concurrent race conditions
  SELECT quantity_in_stock
  INTO v_current_stock
  FROM parts_catalog
  WHERE id = p_part_id AND account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part not found in account';
  END IF;

  v_new_stock := v_current_stock + p_delta;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Cannot adjust stock below zero. Current stock: %, requested delta: %', v_current_stock, p_delta;
  END IF;

  -- Update quantity and timestamp
  UPDATE parts_catalog
  SET quantity_in_stock = v_new_stock,
      updated_at = NOW()
  WHERE id = p_part_id AND account_id = p_account_id;

  -- Record audit trail
  INSERT INTO stock_movements (
    account_id,
    part_id,
    delta,
    movement_type,
    reason,
    reference_id,
    created_by
  ) VALUES (
    p_account_id,
    p_part_id,
    p_delta,
    p_movement_type,
    p_reason,
    p_reference_id,
    COALESCE(p_user_id, auth.uid())
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'part_id', p_part_id,
    'previous_stock', v_current_stock,
    'new_stock', v_new_stock,
    'delta', p_delta,
    'movement_id', v_movement_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_part_stock(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

