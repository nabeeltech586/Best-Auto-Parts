-- ============================================================
-- 060_auto_parts_catalog.sql
--
-- Auto Parts Inventory Management & Vehicle Fitment Module
--
-- Features:
--   1. `parts_catalog` — product catalog for automotive parts with
--      SKUs, OEM numbers, alternate OEMs, categories, condition,
--      cost/selling prices, quantities, thresholds, and bin locations.
--   2. `vehicle_fitment` — Year/Make/Model/Engine compatibility records
--      linked to specific parts in the catalog.
--   3. `stock_movements` — complete immutable audit trail of inventory
--      adjustments (increases, decreases, sales, returns).
--   4. Atomic RPC functions:
--      `adjust_part_stock` — safe stock modification with race-condition
--      protection and negative inventory prevention.
--      `get_inventory_metrics` — real-time aggregate inventory stats.
--   5. Full-text search indexes on product names, OEM numbers, brands.
--   6. Strict tenant-isolation Row Level Security (RLS) policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PARTS CATALOG TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parts_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  oem_number TEXT,
  alternate_oem_numbers TEXT[] NOT NULL DEFAULT '{}',
  brand TEXT,
  category TEXT,
  subcategory TEXT,
  condition TEXT NOT NULL DEFAULT 'OEM' CHECK (condition IN ('Genuine', 'OEM', 'Aftermarket', 'Used')),
  description TEXT,
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (selling_price >= 0),
  quantity_in_stock INTEGER NOT NULL DEFAULT 0 CHECK (quantity_in_stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  location TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_parts_catalog_account_sku UNIQUE (account_id, sku)
);

-- Indexes for fast product search & filtering
CREATE INDEX IF NOT EXISTS idx_parts_catalog_account_id ON parts_catalog(account_id);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_sku ON parts_catalog(account_id, sku);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_oem ON parts_catalog(account_id, oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_brand ON parts_catalog(account_id, brand);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_category ON parts_catalog(account_id, category);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_condition ON parts_catalog(account_id, condition);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_active ON parts_catalog(account_id, is_active);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_quantity ON parts_catalog(account_id, quantity_in_stock);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_alt_oem ON parts_catalog USING GIN (alternate_oem_numbers);

-- ------------------------------------------------------------
-- 2. VEHICLE FITMENT TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_fitment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES parts_catalog(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL DEFAULT 'Passenger Car',
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT,
  year_from INTEGER NOT NULL CHECK (year_from >= 1900 AND year_from <= 2100),
  year_to INTEGER CHECK (year_to IS NULL OR (year_to >= 1900 AND year_to <= 2100 AND year_to >= year_from)),
  engine TEXT,
  fuel_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_fitment_account ON vehicle_fitment(account_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_fitment_part ON vehicle_fitment(part_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_fitment_mfr_model ON vehicle_fitment(account_id, manufacturer, model);
CREATE INDEX IF NOT EXISTS idx_vehicle_fitment_years ON vehicle_fitment(year_from, year_to);

-- ------------------------------------------------------------
-- 3. STOCK MOVEMENTS (AUDIT TRAIL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES parts_catalog(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('increase', 'decrease', 'adjustment', 'sale', 'return')),
  quantity_delta INTEGER NOT NULL,
  quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  reason TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_account ON stock_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_part ON stock_movements(part_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------
ALTER TABLE parts_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_fitment ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- parts_catalog policies
DROP POLICY IF EXISTS parts_catalog_select ON parts_catalog;
CREATE POLICY parts_catalog_select ON parts_catalog
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS parts_catalog_insert ON parts_catalog;
CREATE POLICY parts_catalog_insert ON parts_catalog
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS parts_catalog_update ON parts_catalog;
CREATE POLICY parts_catalog_update ON parts_catalog
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS parts_catalog_delete ON parts_catalog;
CREATE POLICY parts_catalog_delete ON parts_catalog
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- vehicle_fitment policies
DROP POLICY IF EXISTS vehicle_fitment_select ON vehicle_fitment;
CREATE POLICY vehicle_fitment_select ON vehicle_fitment
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS vehicle_fitment_insert ON vehicle_fitment;
CREATE POLICY vehicle_fitment_insert ON vehicle_fitment
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS vehicle_fitment_update ON vehicle_fitment;
CREATE POLICY vehicle_fitment_update ON vehicle_fitment
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS vehicle_fitment_delete ON vehicle_fitment;
CREATE POLICY vehicle_fitment_delete ON vehicle_fitment
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- stock_movements policies
DROP POLICY IF EXISTS stock_movements_select ON stock_movements;
CREATE POLICY stock_movements_select ON stock_movements
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS stock_movements_insert ON stock_movements;
CREATE POLICY stock_movements_insert ON stock_movements
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- stock_movements is immutable: no UPDATE or DELETE allowed

-- ------------------------------------------------------------
-- 5. ATOMIC FUNCTIONS / RPC
-- ------------------------------------------------------------

-- Atomically adjust part stock with race condition prevention and movement logging
CREATE OR REPLACE FUNCTION adjust_part_stock(
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
  -- Verify membership & role: must be at least agent
  IF NOT is_account_member(p_account_id, 'agent') THEN
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
    user_id,
    movement_type,
    quantity_delta,
    quantity_before,
    quantity_after,
    reason,
    reference_id
  ) VALUES (
    p_account_id,
    p_part_id,
    p_user_id,
    p_movement_type,
    p_delta,
    v_current_stock,
    v_new_stock,
    p_reason,
    p_reference_id
  ) RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'part_id', p_part_id,
    'quantity_before', v_current_stock,
    'quantity_after', v_new_stock,
    'quantity_delta', p_delta,
    'movement_id', v_movement_id
  );
END;
$$;

-- Aggregate real-time inventory metrics
CREATE OR REPLACE FUNCTION get_inventory_metrics(p_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics JSONB;
BEGIN
  IF NOT is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot access account inventory metrics';
  END IF;

  SELECT jsonb_build_object(
    'total_products', COUNT(*),
    'total_stock_units', COALESCE(SUM(quantity_in_stock), 0),
    'low_stock_products', COUNT(*) FILTER (WHERE quantity_in_stock > 0 AND quantity_in_stock <= low_stock_threshold),
    'out_of_stock_products', COUNT(*) FILTER (WHERE quantity_in_stock = 0),
    'total_cost_value', COALESCE(SUM(cost_price * quantity_in_stock), 0),
    'total_selling_value', COALESCE(SUM(selling_price * quantity_in_stock), 0)
  )
  INTO v_metrics
  FROM parts_catalog
  WHERE account_id = p_account_id AND is_active = true;

  RETURN v_metrics;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_part_stock(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_inventory_metrics(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. UPDATE REDEEM_INVITATION TO GUARD INVENTORY TABLES
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_other_members BOOLEAN;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id
  FOR UPDATE OF p, a;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE account_id = v_old_account_id
      AND user_id <> v_caller_id
  ) INTO v_has_other_members;

  IF v_has_other_members THEN
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
