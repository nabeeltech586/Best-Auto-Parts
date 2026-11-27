-- Migration: 040_service_cases.sql
-- Description: Isolated table for Online Services Desk (ITR, Vehicle Insurance, RTO Road Tax, State Border Tax, E-Challan)

CREATE TABLE IF NOT EXISTS public.service_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('ITR', 'Vehicle Insurance', 'RTO Road Tax', 'State Border Tax', 'E-Challan')),
  vehicle_or_ref TEXT NOT NULL DEFAULT '',
  notes TEXT,
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID')),
  stage TEXT NOT NULL DEFAULT 'NEW_INQUIRY' CHECK (stage IN ('NEW_INQUIRY', 'PORTAL_CHECK', 'PAYMENT_PENDING', 'PROCESSING', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_service_cases_phone ON public.service_cases(phone);
CREATE INDEX IF NOT EXISTS idx_service_cases_stage ON public.service_cases(stage);
CREATE INDEX IF NOT EXISTS idx_service_cases_service_type ON public.service_cases(service_type);
CREATE INDEX IF NOT EXISTS idx_service_cases_account_id ON public.service_cases(account_id);

-- Enable Row Level Security
ALTER TABLE public.service_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read service_cases"
  ON public.service_cases
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert service_cases"
  ON public.service_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update service_cases"
  ON public.service_cases
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete service_cases"
  ON public.service_cases
  FOR DELETE
  TO authenticated
  USING (true);
