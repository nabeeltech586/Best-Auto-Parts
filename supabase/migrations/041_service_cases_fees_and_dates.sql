-- Migration: 041_service_cases_fees_and_dates.sql
-- Description: Add govt_fee, service_charge, receipt_number, and payment_date to service_cases

ALTER TABLE public.service_cases
  ADD COLUMN IF NOT EXISTS govt_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_date TEXT;
