-- Migration 11 — grant authenticated USAGE/EXECUTE on the app helper schema.
-- The tenant_isolation RLS policy calls app.current_institution_id(); policy
-- evaluation already works, this removes any latent direct-call failure.
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT EXECUTE ON FUNCTION app.current_institution_id() TO authenticated;
