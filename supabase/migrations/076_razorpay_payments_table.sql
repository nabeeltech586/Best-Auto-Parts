-- ============================================================
-- Migration 076: Dedicated razorpay_payments table for Best Auto Parts
-- Tracks live Razorpay payment links, webhooks, and ledger synchronization
-- ============================================================

CREATE TABLE IF NOT EXISTS public.razorpay_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  razorpay_payment_link_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  order_id TEXT,
  ledger_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' 
    CHECK (status IN ('created', 'paid', 'partially_paid', 'expired', 'cancelled', 'failed')),
  customer_name TEXT,
  customer_phone TEXT,
  description TEXT,
  short_url TEXT,
  payment_method TEXT,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_webhook_payload JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ultra-fast query lookups by link ID, payment ID, order ID, or ledger ID
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_link_id 
  ON public.razorpay_payments (razorpay_payment_link_id);

CREATE INDEX IF NOT EXISTS idx_razorpay_payments_payment_id 
  ON public.razorpay_payments (razorpay_payment_id);

-- Enforce strict unique index on razorpay_payment_id once assigned to guarantee idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_razorpay_payments_payment_id 
  ON public.razorpay_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_razorpay_payments_order_id 
  ON public.razorpay_payments (order_id);

CREATE INDEX IF NOT EXISTS idx_razorpay_payments_ledger_id 
  ON public.razorpay_payments (ledger_id);

CREATE INDEX IF NOT EXISTS idx_razorpay_payments_status 
  ON public.razorpay_payments (status);

CREATE INDEX IF NOT EXISTS idx_razorpay_payments_created_at 
  ON public.razorpay_payments (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;

-- Allow service_role full unrestricted access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'razorpay_payments' AND policyname = 'service_role_all_razorpay_payments'
  ) THEN
    CREATE POLICY service_role_all_razorpay_payments
      ON public.razorpay_payments
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Allow authenticated users to view payments
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'razorpay_payments' AND policyname = 'authenticated_read_razorpay_payments'
  ) THEN
    CREATE POLICY authenticated_read_razorpay_payments
      ON public.razorpay_payments
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ------------------------------------------------------------
-- REDEEM INVITATION INTEGRITY GUARD UPDATE FOR RAZORPAY PAYMENTS
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
    UNION ALL SELECT 1 FROM razorpay_payments WHERE account_id = v_old_account_id
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

