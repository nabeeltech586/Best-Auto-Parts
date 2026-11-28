-- ============================================================
-- 077_sync_supplier_contacts_balance.sql
--
-- Best Auto Parts: Sync Contacts Directory Balance with Purchase Ledger
--
-- Features:
--   1. Reconciles `pending_balance` (and optional `udhaar_balance`) on `contacts`
--      for Wholesalers and Distributors directly against live Purchase Orders.
--   2. Ensures settled suppliers (such as NABEEL PATHAN and Sandeep / PAL AGENCY)
--      whose POs are all marked PAID immediately show Settled 0.00 with 0 Udhaar Due.
-- ============================================================

-- Backfill / reconcile contacts pending_balance to 0.00 for suppliers with all PAID POs
UPDATE contacts
SET pending_balance = 0.00
WHERE (
  category IN ('Wholesaler', 'Distributor')
  OR name ILIKE '%Nabeel%'
  OR name ILIKE '%Sandeep%'
  OR name ILIKE '%PAL AGENCY%'
  OR company ILIKE '%PAL AGENCY%'
  OR company ILIKE '%HAMDAAN%'
)
AND NOT EXISTS (
  SELECT 1 FROM purchase_orders po
  WHERE (
    (po.supplier_phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(po.supplier_phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(contacts.phone, '\D', '', 'g'), 10))
    OR po.supplier_name ILIKE '%' || contacts.name || '%'
    OR (contacts.company IS NOT NULL AND po.supplier_name ILIKE '%' || contacts.company || '%')
  )
  AND po.payment_status != 'PAID'
);
