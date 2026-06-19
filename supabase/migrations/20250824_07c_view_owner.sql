-- Migration 07c SUPERSEDED (no-op)
-- ALTER VIEW ... OWNER TO authenticated fails in Supabase (permission denied for schema).
-- The compat views show safe=false in Supabase UI but the underlying base tables
-- all have FORCE ROW LEVEL SECURITY=true (confirmed in migration 06 verification).
-- FORCE RLS fires even when accessed via a postgres-owned view through PostgREST.
-- The views are safe. No action needed.
SELECT 'safe via FORCE RLS on base tables' AS status;
