-- ============================================================
-- 069_distributors_view_and_contacts_sync.sql
--
-- Best Auto Parts: Distributors View & Contacts Integration
-- Creates a view over suppliers and grants SELECT for CRM sync.
-- ============================================================

CREATE OR REPLACE VIEW distributors AS
  SELECT * FROM suppliers;

GRANT SELECT ON distributors TO authenticated, anon, service_role;
