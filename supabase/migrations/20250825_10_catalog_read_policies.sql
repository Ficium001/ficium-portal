-- Migration 10 — catalog.* had RLS enabled with NO policies (silent deny-all
-- once the connection respects RLS). Add read-all policies for authenticated;
-- writes stay service_role-only (no write policy = denied).
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='catalog' AND c.relkind='r' AND c.relrowsecurity=true
      AND (SELECT count(*) FROM pg_policies p WHERE p.schemaname='catalog' AND p.tablename=c.relname)=0
  LOOP
    EXECUTE format('CREATE POLICY catalog_read_all ON catalog.%I FOR SELECT TO authenticated USING (true)', t.relname);
  END LOOP;
END $$;
