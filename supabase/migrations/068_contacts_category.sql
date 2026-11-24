-- ============================================================
-- 068_contacts_category.sql
--
-- Best Auto Parts: Contact Category Classification & Quick Filter
--
-- Categories: 'Distributor' | 'Wholesaler' | 'Mechanic' | 'Customer'
-- Default: 'Customer'
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Customer';

CREATE INDEX IF NOT EXISTS idx_contacts_account_category
  ON contacts(account_id, category);

-- Backfill known classifications for Best Auto Parts
UPDATE contacts
SET category = 'Distributor'
WHERE phone ILIKE '%8791823550%'
   OR name ILIKE '%Sandeep%'
   OR name ILIKE '%PAL AGENCY%'
   OR company ILIKE '%PAL AGENCY%'
   OR phone ILIKE '%9634002453%'
   OR name ILIKE '%HAMDAAN%';

UPDATE contacts
SET category = 'Mechanic'
WHERE company ILIKE '%MOTERS%'
   OR company ILIKE '%Ustad%'
   OR name ILIKE '%Mohd ali%'
   OR name ILIKE '%Liyakat%'
   OR name ILIKE '%Sarwaj%';

UPDATE contacts
SET category = 'Wholesaler'
WHERE name ILIKE '%Irfan%';
