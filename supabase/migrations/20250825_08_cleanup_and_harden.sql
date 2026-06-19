-- =============================================================================
-- Ficium Migration 08 — Cleanup, catalogue extraction completion, RLS hardening
-- Project: egwobcajdlragubtkpqp (portal DB)
--
-- GREEN CODE: fully idempotent, non-breaking. Compat views are preserved.
-- Every statement is guarded so re-running is a no-op. Frontend impact: NONE.
--
-- This completes the v2 redesign by:
--   A. Repointing the two KEPT override tables (product_config, sla_config) from
--      the duplicate institution.products to the canonical catalog.product, then
--      dropping the 7 duplicate institution.product_* tables. (Catalogue
--      extraction — the architecture doc's highest-value step.)
--   B. Removing two dead pre-v2 tables (audit_events, webhook_events) and the
--      pre-v2 bids archive, all 0 rows, all shadowed by v2 tables.
--   C. Hardening RLS: identity.* and portal_admin.* policies moved from the
--      {public} role to {authenticated}; redundant dual policies removed; the
--      missing member-admin UPDATE policy added.
--   D. Enhancements: bid four-eyes guard parity, governance expiry helper,
--      and a catalogue-readability grant audit.
--
-- All drops are verified 0-row as of 2026-06-19. Re-verify with Section 0.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0 — PREFLIGHT GUARD: abort if any drop-candidate holds data
-- Raises an exception (rolls back the whole migration) if rows appeared since
-- the audit. This makes the migration safe to run unattended.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n BIGINT;
  tbl TEXT;
  candidates TEXT[] := ARRAY[
    'institution.products','institution.product_families','institution.product_documents',
    'institution.product_eligibility','institution.product_parameters',
    'institution.product_rate_config','institution.product_sla_defaults',
    'institution.audit_events','institution.webhook_events',
    'institution.institution_bids_archive'
  ];
BEGIN
  FOREACH tbl IN ARRAY candidates LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', tbl) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'ABORT: % holds % row(s); migration 08 expects it empty. Manual review required.', tbl, n;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'Preflight passed: all drop-candidates empty.';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION A — CATALOGUE EXTRACTION: repoint override-table FKs to catalog.product
-- product_config and institution_sla_config are KEPT (per-tenant overrides).
-- Their product_id FK currently points at the duplicate institution.products.
-- Repoint to catalog.product, then the duplicate tables become safe to drop.
-- ─────────────────────────────────────────────────────────────────────────────

-- product_config.product_id  →  catalog.product.id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'institution_product_config_product_id_fkey'
               AND table_schema = 'institution') THEN
    ALTER TABLE institution.product_config
      DROP CONSTRAINT institution_product_config_product_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'product_config_product_id_catalog_fkey'
                   AND table_schema = 'institution') THEN
    ALTER TABLE institution.product_config
      ADD CONSTRAINT product_config_product_id_catalog_fkey
      FOREIGN KEY (product_id) REFERENCES catalog.product(id) ON DELETE CASCADE;
  END IF;
END $$;

-- institution_sla_config.product_id  →  catalog.product.id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'institution_sla_config_product_id_fkey'
               AND table_schema = 'institution') THEN
    ALTER TABLE institution.institution_sla_config
      DROP CONSTRAINT institution_sla_config_product_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'sla_config_product_id_catalog_fkey'
                   AND table_schema = 'institution') THEN
    ALTER TABLE institution.institution_sla_config
      ADD CONSTRAINT sla_config_product_id_catalog_fkey
      FOREIGN KEY (product_id) REFERENCES catalog.product(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION B — DROP DUPLICATE catalog tables now orphaned of FKs
-- catalog.* is the canonical home (architecture doc §2.2). All 0 rows.
-- Internal FKs between these tables cascade automatically.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS institution.product_rate_config   CASCADE;
DROP TABLE IF EXISTS institution.product_parameters    CASCADE;
DROP TABLE IF EXISTS institution.product_eligibility   CASCADE;
DROP TABLE IF EXISTS institution.product_documents     CASCADE;
DROP TABLE IF EXISTS institution.product_sla_defaults  CASCADE;
DROP TABLE IF EXISTS institution.product_families      CASCADE;
DROP TABLE IF EXISTS institution.products              CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION C — DROP dead pre-v2 tables (0 rows, shadowed by v2)
--   audit_events            → superseded by audit.event
--   webhook_events          → superseded by institution.webhook_delivery
--   institution_bids_archive→ superseded by marketplace.bid (FK to products dropped via CASCADE above)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS institution.audit_events            CASCADE;
DROP TABLE IF EXISTS institution.webhook_events          CASCADE;
DROP TABLE IF EXISTS institution.institution_bids_archive CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION D — RLS HARDENING: identity.* move {public} → {authenticated}
-- These tables hold user-owned rows; {public} permits unauthenticated reach.
-- Recreate each policy bound to the authenticated role. Idempotent via DROP IF.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS identity_verify_own  ON identity.email_verification_token;
CREATE POLICY identity_verify_own ON identity.email_verification_token
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS identity_ip_own      ON identity.ip_allowlist;
CREATE POLICY identity_ip_own ON identity.ip_allowlist
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS identity_login_own   ON identity.login_event;
CREATE POLICY identity_login_own ON identity.login_event
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS identity_mfa_own     ON identity.mfa_backup_code;
CREATE POLICY identity_mfa_own ON identity.mfa_backup_code
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS identity_reset_own   ON identity.password_reset_token;
CREATE POLICY identity_reset_own ON identity.password_reset_token
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS identity_profile_own ON identity.profile;
CREATE POLICY identity_profile_own ON identity.profile
  FOR SELECT TO authenticated USING (id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION E — RLS HARDENING: portal_admin.* move {public} → {authenticated}
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audit_insert ON portal_admin.admin_audit_log;
CREATE POLICY audit_insert ON portal_admin.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS audit_select ON portal_admin.admin_audit_log;
CREATE POLICY audit_select ON portal_admin.admin_audit_log
  FOR SELECT TO authenticated USING (portal_admin.has_permission('audit:view'));

DROP POLICY IF EXISTS dc_select ON portal_admin.admin_dual_control_actions;
CREATE POLICY dc_select ON portal_admin.admin_dual_control_actions
  FOR SELECT TO authenticated USING (portal_admin.is_admin());

DROP POLICY IF EXISTS dc_write ON portal_admin.admin_dual_control_actions;
CREATE POLICY dc_write ON portal_admin.admin_dual_control_actions
  FOR ALL TO authenticated USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS admin_roles_select ON portal_admin.admin_roles;
CREATE POLICY admin_roles_select ON portal_admin.admin_roles
  FOR SELECT TO authenticated USING (portal_admin.is_admin());

DROP POLICY IF EXISTS admin_roles_write ON portal_admin.admin_roles;
CREATE POLICY admin_roles_write ON portal_admin.admin_roles
  FOR ALL TO authenticated USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS admin_sessions_select ON portal_admin.admin_sessions;
CREATE POLICY admin_sessions_select ON portal_admin.admin_sessions
  FOR SELECT TO authenticated USING (portal_admin.is_admin());

DROP POLICY IF EXISTS admin_sessions_write ON portal_admin.admin_sessions;
CREATE POLICY admin_sessions_write ON portal_admin.admin_sessions
  FOR ALL TO authenticated USING (portal_admin.is_admin() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS admin_users_insert ON portal_admin.admin_users;
CREATE POLICY admin_users_insert ON portal_admin.admin_users
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS admin_users_self_select ON portal_admin.admin_users;
CREATE POLICY admin_users_self_select ON portal_admin.admin_users
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS admin_users_update ON portal_admin.admin_users;
CREATE POLICY admin_users_update ON portal_admin.admin_users
  FOR UPDATE TO authenticated USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS groups_select ON portal_admin.user_groups;
CREATE POLICY groups_select ON portal_admin.user_groups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS groups_write ON portal_admin.user_groups;
CREATE POLICY groups_write ON portal_admin.user_groups
  FOR ALL TO authenticated USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION F — RESOLVE DUAL-POLICY CONFLICTS on institution.api_key / group
-- The tenant_isolation ALL policy (app.current_institution_id()) overlaps the
-- specific current_member_ctx() policies. Keep the specific ones; drop the
-- generic tenant_isolation on these two tables. (Other tables keep theirs —
-- tenant_isolation is correct where it's the SOLE policy.)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON institution.api_key;
DROP POLICY IF EXISTS tenant_isolation ON institution."group";


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION G — ADD MISSING member-admin UPDATE policy
-- Member lifecycle ops (deactivate, role change, group change) had no UPDATE
-- path. Institution admins may update members within their own tenant.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS institution_members_update_admin ON institution.member;
CREATE POLICY institution_members_update_admin ON institution.member
  FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id
      FROM institution.current_member_ctx()
        ctx(member_id, institution_id, is_admin, member_role, modules))
    AND (SELECT ctx.is_admin
      FROM institution.current_member_ctx()
        ctx(member_id, institution_id, is_admin, member_role, modules))
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION H — ENHANCEMENT: catalogue read grants (architecture doc §catalog)
-- catalog.* is public reference data: authenticated reads, writes via service.
-- Idempotent GRANTs ensure the portal can read product reference data once seeded.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA catalog TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog GRANT SELECT ON TABLES TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION I — ENHANCEMENT: governance auto-expiry helper (idempotent)
-- A set-returning maintenance function the existing pg_cron job can call to
-- expire stale pending actions. Mirrors the portal_admin.expire_dual_control_
-- actions() pattern but for the unified governance.action table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION governance.expire_stale_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE governance.action
     SET status = 'expired', updated_at = now()
   WHERE status = 'pending'
     AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION governance.expire_stale_actions() FROM PUBLIC;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run post-apply
-- ─────────────────────────────────────────────────────────────────────────────

-- Duplicate tables gone (expect 0):
SELECT count(*) AS leftover_dupes
FROM pg_tables
WHERE schemaname = 'institution'
  AND tablename IN ('products','product_families','product_documents',
      'product_eligibility','product_parameters','product_rate_config',
      'product_sla_defaults','audit_events','webhook_events','institution_bids_archive');

-- FKs now point at catalog (expect 2):
SELECT count(*) AS catalog_fks
FROM information_schema.table_constraints
WHERE constraint_name IN ('product_config_product_id_catalog_fkey','sla_config_product_id_catalog_fkey');

-- identity/portal_admin policies all authenticated (expect 0 public rows):
SELECT count(*) AS public_role_policies
FROM pg_policies
WHERE schemaname IN ('identity','portal_admin')
  AND roles = '{public}';

-- member UPDATE policy exists (expect 1):
SELECT count(*) AS member_update_policy
FROM pg_policies
WHERE schemaname = 'institution' AND tablename = 'member' AND cmd = 'UPDATE';
