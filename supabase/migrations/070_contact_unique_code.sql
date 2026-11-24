-- ============================================================
-- 070_contact_unique_code.sql
--
-- Best Auto Parts: Permanent Unique Contact IDs
-- Format: BAP-CUS-001, BAP-MEC-001, BAP-DIS-001, BAP-WHL-001
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS unique_code TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_unique_code
  ON contacts(account_id, unique_code);
