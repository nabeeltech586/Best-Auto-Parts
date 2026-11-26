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
