-- ============================================================
-- 061_contact_preferred_language.sql
--
-- WhatsApp CRM Preferred Language Support
--
-- Adds `preferred_language` column to `contacts` table to persist
-- customer language preferences ('en' or 'hinglish') across conversations.
-- Backward-compatible: nullable column with check constraint.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS preferred_language TEXT
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'hinglish'));

CREATE INDEX IF NOT EXISTS idx_contacts_preferred_language
  ON contacts(account_id, preferred_language);
