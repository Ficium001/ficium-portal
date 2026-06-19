-- Migration 09 — grants enabling RLS enforcement under SET ROLE authenticated.
-- Prereq for db.py tenant_session role switch. RLS policies remain the row-level
-- security boundary; these grants only let the role REACH the tables.
GRANT USAGE ON SCHEMA admin TO authenticated;
GRANT SELECT ON admin.system_group TO authenticated;
GRANT SELECT ON admin.role          TO authenticated;
GRANT SELECT ON admin."user"        TO authenticated;
GRANT SELECT ON admin.session       TO authenticated;
GRANT SELECT ON institution.product_config         TO authenticated;
GRANT SELECT, INSERT, UPDATE ON institution.institution_sla_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON institution.webhook        TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin GRANT SELECT ON TABLES TO authenticated;
