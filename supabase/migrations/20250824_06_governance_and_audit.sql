-- =============================================================================
-- Ficium Migration 06/06 — governance + audit schemas
-- governance.action: unified maker-checker (replaces both pending_actions
--   and admin_dual_control_actions).
-- audit.event: single WORM log (replaces admin_audit_log + scattered events).
-- Backfills data from old tables. Compat views keep existing RPCs working.
-- Frontend impact: NONE
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- GOVERNANCE
-- ────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA governance TO authenticated;

CREATE TABLE IF NOT EXISTS governance.action (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope            TEXT        NOT NULL DEFAULT 'institution'
                               CHECK (scope IN ('institution','platform')),
  category         TEXT        NOT NULL,
  label            TEXT        NOT NULL DEFAULT '',
  risk             TEXT        NOT NULL DEFAULT 'medium'
                               CHECK (risk IN ('low','medium','high','critical')),
  institution_id   UUID        REFERENCES institution.institution(id) ON DELETE CASCADE,
  maker_id         UUID        NOT NULL,
  maker_role       TEXT        NOT NULL DEFAULT '',
  maker_ip         INET,
  maker_user_agent TEXT,
  resource_type    TEXT        NOT NULL,
  resource_id      UUID,
  resource_label   TEXT,
  payload          JSONB       NOT NULL DEFAULT '{}',
  payload_before   JSONB,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  checker_id       UUID,
  checker_role     TEXT,
  checker_note     TEXT,
  checker_ip       INET,
  checked_at       TIMESTAMPTZ,
  execution_status TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (execution_status IN ('pending','executing','executed','failed','skipped')),
  executed_at      TIMESTAMPTZ,
  execution_error  TEXT,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT four_eyes CHECK (checker_id IS NULL OR checker_id != maker_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_inst     ON governance.action (institution_id, status, category) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_governance_platform ON governance.action (scope, status)                    WHERE scope = 'platform';
CREATE INDEX IF NOT EXISTS idx_governance_expiry   ON governance.action (expires_at)                       WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_governance_maker    ON governance.action (maker_id, created_at DESC);

CREATE OR REPLACE TRIGGER governance_action_updated_at
  BEFORE UPDATE ON governance.action
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE governance.action ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.action FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY governance_inst_select ON governance.action
    FOR SELECT TO authenticated
    USING (scope = 'institution' AND institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY governance_inst_insert ON governance.action
    FOR INSERT TO authenticated
    WITH CHECK (scope = 'institution'
      AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
      AND maker_id       = (SELECT ctx.member_id      FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY governance_inst_update ON governance.action
    FOR UPDATE TO authenticated
    USING (scope = 'institution'
      AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
      AND (SELECT ctx.is_admin FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY governance_platform_select ON governance.action
    FOR SELECT TO authenticated USING (scope = 'platform' AND admin.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY governance_platform_insert ON governance.action
    FOR INSERT TO authenticated WITH CHECK (scope = 'platform' AND admin.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY governance_platform_update ON governance.action
    FOR UPDATE TO authenticated
    USING (scope = 'platform' AND admin.has_permission('dual_control:approve'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE ON governance.action TO authenticated;

-- ── Backfill from institution.pending_actions ─────────────────────────────────
INSERT INTO governance.action
  (id, scope, category, label, risk, institution_id, maker_id, maker_role,
   resource_type, resource_id, payload, payload_before, status,
   checker_id, checker_note, checked_at, execution_status, executed_at,
   execution_error, expires_at, created_at, updated_at)
SELECT
  id, 'institution', action_category, COALESCE(action_category,''), 'medium',
  institution_id, maker_id, COALESCE(maker_role,''),
  COALESCE(resource_type,'unknown'), resource_id,
  COALESCE(payload,'{}'), payload_before, COALESCE(action_status,'pending'),
  checker_id, checker_note, checked_at,
  COALESCE(execution_status,'pending'), executed_at, execution_error,
  COALESCE(expires_at, now() + INTERVAL '7 days'), created_at, created_at
FROM institution.pending_actions
-- Skip rows where maker = checker (violates four_eyes; logged separately)
WHERE checker_id IS NULL OR checker_id != maker_id
ON CONFLICT (id) DO NOTHING;

-- ── Backfill from portal_admin.admin_dual_control_actions ─────────────────────
INSERT INTO governance.action
  (scope, category, label, risk, maker_id, maker_role, maker_ip,
   resource_type, resource_id, resource_label, payload, payload_before,
   status, checker_id, checker_role, checker_note, checker_ip, checked_at,
   execution_status, executed_at, execution_error, expires_at, created_at)
SELECT
  'platform', action_category, COALESCE(action_label,''), COALESCE(risk::TEXT,'medium'),
  maker_id, COALESCE(maker_role,''), maker_ip,
  COALESCE(resource_type,'unknown'), resource_id, resource_label,
  COALESCE(payload,'{}'), payload_before,
  -- Map old status → new status (only pending/approved/rejected/expired/cancelled allowed)
  CASE
    WHEN status::TEXT IN ('pending','approved','rejected','expired','cancelled') THEN status::TEXT
    WHEN status::TEXT = 'executed' THEN 'approved'
    ELSE 'pending'
  END,
  checker_id, checker_role, checker_note, checker_ip, checked_at,
  -- Map old status → execution_status
  CASE
    WHEN status::TEXT = 'executed' THEN 'executed'
    WHEN status::TEXT = 'approved' THEN 'executed'
    ELSE 'pending'
  END,
  executed_at, execution_error,
  COALESCE(expires_at, now() + INTERVAL '7 days'), initiated_at
FROM portal_admin.admin_dual_control_actions
WHERE checker_id IS NULL OR checker_id != maker_id
ON CONFLICT DO NOTHING;

-- ── governance.submit RPC ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.submit(
  p_category      TEXT,
  p_resource_type TEXT,
  p_resource_id   UUID,
  p_payload       JSONB,
  p_label         TEXT DEFAULT '',
  p_risk          TEXT DEFAULT 'medium'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, governance, admin AS $$
DECLARE
  v_ctx  RECORD;
  v_id   UUID;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL THEN
    RAISE EXCEPTION 'Not an active institution member';
  END IF;

  INSERT INTO governance.action
    (scope, category, label, risk, institution_id, maker_id, maker_role,
     resource_type, resource_id, payload)
  VALUES
    ('institution', p_category, COALESCE(p_label,''), p_risk,
     v_ctx.institution_id, v_ctx.member_id, v_ctx.member_role,
     p_resource_type, p_resource_id, COALESCE(p_payload,'{}'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION governance.submit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.submit TO authenticated;

-- Update submit_for_approval shim to use governance.submit
CREATE OR REPLACE FUNCTION institution.submit_for_approval(
  p_action_category TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_payload         JSONB
) RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT governance.submit(p_action_category, p_resource_type, p_resource_id, p_payload);
$$;

REVOKE ALL ON FUNCTION institution.submit_for_approval FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.submit_for_approval TO authenticated;

-- Compat view so portal_admin.admin_dual_control_actions queries still work
CREATE OR REPLACE VIEW portal_admin.admin_dual_control_actions_v
  WITH (security_invoker = on)
  AS SELECT * FROM governance.action WHERE scope = 'platform';
GRANT SELECT ON portal_admin.admin_dual_control_actions_v TO authenticated;

-- Compat view for institution.pending_actions
CREATE OR REPLACE VIEW institution.pending_actions_v
  WITH (security_invoker = on)
  AS SELECT * FROM governance.action WHERE scope = 'institution';
GRANT SELECT ON institution.pending_actions_v TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- AUDIT
-- ────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA audit TO authenticated;

CREATE TABLE IF NOT EXISTS audit.event (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id             UUID,
  actor_type           TEXT        NOT NULL DEFAULT 'system'
                                   CHECK (actor_type IN ('consumer','member','admin','system','api')),
  actor_email          TEXT,
  actor_role           TEXT,
  actor_ip             INET,
  actor_user_agent     TEXT,
  institution_id       UUID        REFERENCES institution.institution(id) ON DELETE SET NULL,
  action               TEXT        NOT NULL,
  resource_type        TEXT,
  resource_id          UUID,
  resource_label       TEXT,
  outcome              TEXT        NOT NULL DEFAULT 'logged'
                                   CHECK (outcome IN ('success','failed','blocked','rejected','expired','logged')),
  outcome_note         TEXT,
  governance_action_id UUID        REFERENCES governance.action(id) ON DELETE SET NULL,
  session_id           UUID,
  request_id           TEXT,
  metadata             JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred    ON audit.event (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit.event (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_institution ON audit.event (institution_id, occurred_at DESC) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit.event (action, outcome);
CREATE INDEX IF NOT EXISTS idx_audit_governance  ON audit.event (governance_action_id) WHERE governance_action_id IS NOT NULL;

-- WORM via trigger (not RULE — rules block ON CONFLICT inserts)
CREATE OR REPLACE FUNCTION audit.block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.event is append-only — updates and deletes are not permitted';
END;
$$;

DROP TRIGGER IF EXISTS audit_event_no_update ON audit.event;
CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON audit.event
  FOR EACH ROW EXECUTE FUNCTION audit.block_mutation();

DROP TRIGGER IF EXISTS audit_event_no_delete ON audit.event;
CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON audit.event
  FOR EACH ROW EXECUTE FUNCTION audit.block_mutation();

ALTER TABLE audit.event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.event FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY audit_inst_select ON audit.event
    FOR SELECT TO authenticated
    USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY audit_admin_select ON audit.event
    FOR SELECT TO authenticated USING (admin.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY audit_insert ON audit.event
    FOR INSERT TO authenticated
    WITH CHECK (
      auth.role() = 'service_role' OR admin.is_admin()
      OR institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT ON audit.event TO authenticated;

-- ── Backfill from portal_admin.admin_audit_log ────────────────────────────────
INSERT INTO audit.event
  (occurred_at, actor_id, actor_type, actor_email, actor_role, actor_ip,
   action, resource_type, resource_id, resource_label,
   outcome, outcome_note, governance_action_id)
SELECT
  created_at, actor_id, 'admin', actor_email, actor_role, actor_ip,
  action_category, resource_type, resource_id, resource_label,
  COALESCE(outcome::TEXT,'logged'), outcome_note, dual_control_id
FROM portal_admin.admin_audit_log
ON CONFLICT DO NOTHING;

-- ── audit.log() helper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit.log(
  p_action         TEXT,
  p_actor_id       UUID    DEFAULT NULL,
  p_actor_type     TEXT    DEFAULT 'system',
  p_institution_id UUID    DEFAULT NULL,
  p_resource_type  TEXT    DEFAULT NULL,
  p_resource_id    UUID    DEFAULT NULL,
  p_outcome        TEXT    DEFAULT 'logged',
  p_metadata       JSONB   DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO audit.event
    (action, actor_id, actor_type, institution_id,
     resource_type, resource_id, outcome, metadata)
  VALUES
    (p_action, p_actor_id, p_actor_type, p_institution_id,
     p_resource_type, p_resource_id, p_outcome, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION audit.log FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.log TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- FINAL: Compat layer for portal_admin functions that still read old tables
-- ────────────────────────────────────────────────────────────────────────────

-- get_institutions: update to read institution.institution (new name)
CREATE OR REPLACE FUNCTION portal_admin.get_institutions()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT portal_admin.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN (
    SELECT jsonb_agg(row_to_json(i))
    FROM (
      SELECT
        i.id, i.name, i.legal_name, i.institution_type,
        i.onboarding_stage, i.compliance_status,
        i.approved, i.approved_at, i.suspended_at, i.suspension_reason,
        i.primary_contact_name, i.primary_contact_email,
        i.website, i.country, i.regulator, i.modules,
        i.created_at, i.updated_at,
        COALESCE(
          (SELECT COUNT(*) FROM institution.member m WHERE m.institution_id = i.id AND m.status = 'active'),
          0
        ) AS member_count
      FROM institution.institution i
      ORDER BY i.created_at DESC
    ) i
  );
END;
$$;

GRANT EXECUTE ON FUNCTION portal_admin.get_institutions() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after all 6 migrations)
-- ────────────────────────────────────────────────────────────────────────────
/*
-- All 7 schemas exist:
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('identity','catalog','institution','marketplace','governance','admin','audit')
ORDER BY schema_name;

-- All tenant tables have forced RLS:
SELECT n.nspname AS schema, c.relname AS "table",
       c.relrowsecurity AS rls_on, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('institution','marketplace','governance','audit')
ORDER BY n.nspname, c.relname;

-- All views are security_invoker:
SELECT n.nspname AS schema, c.relname AS view,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE) AS safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
ORDER BY n.nspname, c.relname;

-- Critical FK: bid → request:
SELECT conname FROM pg_constraint
WHERE conrelid = 'marketplace.bid'::regclass AND contype = 'f'
  AND conname LIKE '%request%';

-- marketplace.my_bids is security_invoker:
SELECT reloptions FROM pg_class
WHERE relname = 'my_bids'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'marketplace');

-- Old function signatures still callable (frontend compat check):
SELECT routine_schema, routine_name FROM information_schema.routines
WHERE routine_schema IN ('portal_admin','institution')
  AND routine_name IN ('get_my_group','get_institutions','submit_for_approval',
                       'current_member_ctx','approve_action','reject_action')
ORDER BY routine_schema, routine_name;
*/
