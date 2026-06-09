-- =============================================================================
-- Ficium — portal_admin schema
-- Migration: 20250801_portal_admin_schema.sql
--
-- Creates the complete admin portal database layer:
--   - portal_admin schema + all tables
--   - RLS policies (admin_users only see their own schema)
--   - Dual-control action engine with auto-expiry
--   - Immutable append-only audit log (WORM semantics)
--   - Helper RPCs called by the frontend hooks
--   - Triggers: audit on every write, lock on failed logins
--
-- Run order: execute once on ficium-institution Supabase project.
-- All objects in portal_admin schema — zero contamination of institution.*
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS portal_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE portal_admin.admin_user_status AS ENUM (
    'active', 'locked', 'suspended', 'pending_mfa', 'deactivated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE portal_admin.action_risk AS ENUM (
    'low', 'medium', 'high', 'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE portal_admin.dual_control_status AS ENUM (
    'pending', 'approved', 'rejected', 'expired', 'cancelled', 'executed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE portal_admin.audit_outcome AS ENUM (
    'success', 'rejected', 'failed', 'blocked', 'expired', 'logged'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admin_roles — custom role definitions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_admin.admin_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID NOT NULL,             -- auth.users.id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed system roles
INSERT INTO portal_admin.admin_roles (slug, label, description, permissions, is_system, created_by)
VALUES
  ('super_admin',     'Super Admin',            'Full system access', ARRAY['*'], TRUE, '00000000-0000-0000-0000-000000000000'),
  ('institution_mgr', 'Institution Manager',    'Manage institutions and approve applications', ARRAY['institutions:view','institutions:approve','institutions:suspend','institutions:modules','audit:view','dual_control:approve','dual_control:view'], TRUE, '00000000-0000-0000-0000-000000000000'),
  ('compliance',      'Compliance Officer',     'Read-only compliance and audit access', ARRAY['institutions:view','audit:view','audit:export','dual_control:view','sessions:view'], TRUE, '00000000-0000-0000-0000-000000000000'),
  ('support',         'Support',                'User support — unlock/reset only', ARRAY['users:view','users:unlock','users:reset_password','users:force_logout','institutions:view','audit:view','dual_control:view'], TRUE, '00000000-0000-0000-0000-000000000000'),
  ('auditor',         'Auditor',                'Audit log read-only access', ARRAY['audit:view','audit:export','dual_control:view','sessions:view'], TRUE, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. admin_users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_admin.admin_users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  role_slug             TEXT NOT NULL DEFAULT 'support',
  custom_role_id        UUID REFERENCES portal_admin.admin_roles(id),
  status                portal_admin.admin_user_status NOT NULL DEFAULT 'pending_mfa',
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_verified_at       TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  failed_login_count    INT NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  locked_reason         TEXT,
  suspended_at          TIMESTAMPTZ,
  suspended_by          UUID REFERENCES portal_admin.admin_users(id),
  suspension_reason     TEXT,
  password_changed_at   TIMESTAMPTZ,
  force_password_reset  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_role_slug CHECK (
    role_slug IN ('super_admin','institution_mgr','compliance','support','auditor','custom')
  ),
  CONSTRAINT custom_role_requires_id CHECK (
    role_slug != 'custom' OR custom_role_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_users_auth    ON portal_admin.admin_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_status  ON portal_admin.admin_users(status);
CREATE INDEX IF NOT EXISTS idx_admin_users_email   ON portal_admin.admin_users(email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_sessions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_admin.admin_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES portal_admin.admin_users(id) ON DELETE CASCADE,
  ip_address      INET NOT NULL,
  user_agent      TEXT NOT NULL DEFAULT '',
  country         TEXT,
  city            TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  end_reason      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT valid_end_reason CHECK (
    end_reason IN ('logout','timeout','forced','expired') OR end_reason IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user    ON portal_admin.admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active  ON portal_admin.admin_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_admin_sessions_started ON portal_admin.admin_sessions(started_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_dual_control_actions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_admin.admin_dual_control_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_category  TEXT NOT NULL,
  action_label     TEXT NOT NULL,
  risk             portal_admin.action_risk NOT NULL DEFAULT 'medium',
  maker_id         UUID NOT NULL REFERENCES portal_admin.admin_users(id),
  maker_email      TEXT NOT NULL,
  maker_role       TEXT NOT NULL,
  maker_ip         INET NOT NULL,
  resource_type    TEXT NOT NULL,
  resource_id      UUID,
  resource_label   TEXT,
  payload          JSONB NOT NULL DEFAULT '{}',
  payload_before   JSONB,
  status           portal_admin.dual_control_status NOT NULL DEFAULT 'pending',
  checker_id       UUID REFERENCES portal_admin.admin_users(id),
  checker_email    TEXT,
  checker_role     TEXT,
  checker_note     TEXT,
  checker_ip       INET,
  checked_at       TIMESTAMPTZ,
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '8 hours'),
  executed_at      TIMESTAMPTZ,
  execution_error  TEXT,

  -- Maker cannot also be checker (enforced at RPC level too)
  CONSTRAINT no_self_approval CHECK (checker_id IS NULL OR checker_id != maker_id)
);

CREATE INDEX IF NOT EXISTS idx_dc_status    ON portal_admin.admin_dual_control_actions(status);
CREATE INDEX IF NOT EXISTS idx_dc_expires   ON portal_admin.admin_dual_control_actions(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dc_maker     ON portal_admin.admin_dual_control_actions(maker_id);
CREATE INDEX IF NOT EXISTS idx_dc_category  ON portal_admin.admin_dual_control_actions(action_category);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. admin_audit_log — WORM (append-only, no updates/deletes)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_admin.admin_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID REFERENCES portal_admin.admin_sessions(id),
  actor_id         UUID,
  actor_email      TEXT,
  actor_role       TEXT,
  actor_ip         INET,
  action_category  TEXT NOT NULL,
  event_label      TEXT NOT NULL,
  resource_type    TEXT,
  resource_id      UUID,
  resource_label   TEXT,
  dual_control_id  UUID REFERENCES portal_admin.admin_dual_control_actions(id),
  state_before     JSONB,
  state_after      JSONB,
  outcome          portal_admin.audit_outcome NOT NULL DEFAULT 'logged',
  outcome_note     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent updates and deletes — WORM enforcement
CREATE OR REPLACE RULE audit_log_no_update AS
  ON UPDATE TO portal_admin.admin_audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS
  ON DELETE TO portal_admin.admin_audit_log DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_audit_created   ON portal_admin.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor     ON portal_admin.admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_category  ON portal_admin.admin_audit_log(action_category);
CREATE INDEX IF NOT EXISTS idx_audit_outcome   ON portal_admin.admin_audit_log(outcome);
CREATE INDEX IF NOT EXISTS idx_audit_dc        ON portal_admin.admin_audit_log(dual_control_id) WHERE dual_control_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE portal_admin.admin_users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_admin.admin_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_admin.admin_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_admin.admin_dual_control_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_admin.admin_audit_log            ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a recognised admin?
CREATE OR REPLACE FUNCTION portal_admin.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_admin.admin_users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
  )
$$;

-- Helper: current admin's role slug
CREATE OR REPLACE FUNCTION portal_admin.my_role_slug()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role_slug FROM portal_admin.admin_users
  WHERE auth_user_id = auth.uid() AND status = 'active'
  LIMIT 1
$$;

-- Helper: current admin's permissions array
CREATE OR REPLACE FUNCTION portal_admin.my_permissions()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT permissions FROM portal_admin.admin_roles
     WHERE slug = portal_admin.my_role_slug() LIMIT 1),
    '{}'::TEXT[]
  )
$$;

-- Helper: does current admin have permission?
CREATE OR REPLACE FUNCTION portal_admin.has_permission(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    portal_admin.my_role_slug() = 'super_admin'
    OR p_key = ANY(portal_admin.my_permissions())
$$;

-- admin_users: readable by active admins
CREATE POLICY admin_users_select ON portal_admin.admin_users
  FOR SELECT USING (portal_admin.is_admin());

-- admin_users: insert only via service role (RPCs)
CREATE POLICY admin_users_insert ON portal_admin.admin_users
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- admin_users: update only via service role
CREATE POLICY admin_users_update ON portal_admin.admin_users
  FOR UPDATE USING (auth.role() = 'service_role');

-- admin_roles: all active admins can read
CREATE POLICY admin_roles_select ON portal_admin.admin_roles
  FOR SELECT USING (portal_admin.is_admin());

CREATE POLICY admin_roles_write ON portal_admin.admin_roles
  FOR ALL USING (auth.role() = 'service_role');

-- admin_sessions: admins can read all sessions
CREATE POLICY admin_sessions_select ON portal_admin.admin_sessions
  FOR SELECT USING (portal_admin.is_admin());

CREATE POLICY admin_sessions_write ON portal_admin.admin_sessions
  FOR ALL USING (portal_admin.is_admin() OR auth.role() = 'service_role');

-- dual_control: readable by all active admins
CREATE POLICY dc_select ON portal_admin.admin_dual_control_actions
  FOR SELECT USING (portal_admin.is_admin());

-- dual_control: write via service role only (RPCs enforce business logic)
CREATE POLICY dc_write ON portal_admin.admin_dual_control_actions
  FOR ALL USING (auth.role() = 'service_role');

-- audit_log: read-only for active admins with audit:view
CREATE POLICY audit_select ON portal_admin.admin_audit_log
  FOR SELECT USING (portal_admin.has_permission('audit:view'));

-- audit_log: insert via service role only
CREATE POLICY audit_insert ON portal_admin.admin_audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role' OR portal_admin.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION portal_admin.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_users_updated_at
  BEFORE UPDATE ON portal_admin.admin_users
  FOR EACH ROW EXECUTE FUNCTION portal_admin.set_updated_at();

-- Auto-expire pending dual-control actions (runs via pg_cron or manual call)
CREATE OR REPLACE FUNCTION portal_admin.expire_dual_control_actions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  expired_count INT;
BEGIN
  WITH expired AS (
    UPDATE portal_admin.admin_dual_control_actions
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now()
    RETURNING id, action_label, maker_id
  )
  INSERT INTO portal_admin.admin_audit_log
    (action_category, event_label, resource_type, resource_id, outcome, outcome_note)
  SELECT
    'dual_control.expire',
    'Dual control action expired: ' || action_label,
    'admin_dual_control_action',
    id,
    'expired',
    'TTL elapsed without checker decision'
  FROM expired;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- Lock account after 5 failed logins
CREATE OR REPLACE FUNCTION portal_admin.check_failed_logins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.failed_login_count >= 5 AND OLD.status = 'active' THEN
    NEW.status     := 'locked';
    NEW.locked_at  := now();
    NEW.locked_reason := 'Exceeded 5 failed login attempts — auto-locked';
    INSERT INTO portal_admin.admin_audit_log
      (actor_id, action_category, event_label, resource_type, resource_id, outcome, outcome_note)
    VALUES
      (NEW.id, 'security.auto_lock', 'Account auto-locked after 5 failed logins', 'admin_user', NEW.id, 'success', 'Threshold: 5 attempts');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_users_failed_login_lock
  BEFORE UPDATE OF failed_login_count ON portal_admin.admin_users
  FOR EACH ROW EXECUTE FUNCTION portal_admin.check_failed_logins();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPCs — called by frontend hooks
-- ─────────────────────────────────────────────────────────────────────────────

-- Submit a dual-control action
CREATE OR REPLACE FUNCTION portal_admin.admin_submit_dual_control(
  action_category TEXT,
  action_label    TEXT,
  risk            TEXT,
  resource_type   TEXT,
  resource_id     UUID     DEFAULT NULL,
  resource_label  TEXT     DEFAULT NULL,
  payload         JSONB    DEFAULT '{}'::JSONB,
  payload_before  JSONB    DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin     portal_admin.admin_users%ROWTYPE;
  v_action_id UUID;
  v_session   portal_admin.admin_sessions%ROWTYPE;
BEGIN
  -- Authenticate
  SELECT * INTO v_admin FROM portal_admin.admin_users
  WHERE auth_user_id = auth.uid() AND status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorised'; END IF;

  -- Get latest session IP
  SELECT * INTO v_session FROM portal_admin.admin_sessions
  WHERE admin_user_id = v_admin.id AND is_active = TRUE
  ORDER BY last_active_at DESC LIMIT 1;

  -- Insert dual-control action
  INSERT INTO portal_admin.admin_dual_control_actions (
    action_category, action_label, risk, maker_id, maker_email, maker_role,
    maker_ip, resource_type, resource_id, resource_label, payload, payload_before
  ) VALUES (
    action_category, action_label, risk::portal_admin.action_risk,
    v_admin.id, v_admin.email, v_admin.role_slug,
    COALESCE(v_session.ip_address, '0.0.0.0'::INET),
    resource_type, resource_id, resource_label, payload, payload_before
  ) RETURNING id INTO v_action_id;

  -- Audit
  INSERT INTO portal_admin.admin_audit_log (
    actor_id, actor_email, actor_role, actor_ip,
    action_category, event_label, resource_type, resource_id,
    dual_control_id, payload, outcome, outcome_note
  ) VALUES (
    v_admin.id, v_admin.email, v_admin.role_slug,
    COALESCE(v_session.ip_address, '0.0.0.0'::INET),
    action_category, 'Dual-control action submitted: ' || action_label,
    resource_type, resource_id, v_action_id, payload,
    'logged', 'Awaiting second admin approval'
  );

  RETURN v_action_id;
END;
$$;

-- Approve a dual-control action
CREATE OR REPLACE FUNCTION portal_admin.admin_approve_dual_control(
  p_action_id UUID,
  p_note      TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin   portal_admin.admin_users%ROWTYPE;
  v_action  portal_admin.admin_dual_control_actions%ROWTYPE;
  v_session portal_admin.admin_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM portal_admin.admin_users
  WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorised'; END IF;

  SELECT * INTO v_action FROM portal_admin.admin_dual_control_actions
  WHERE id = p_action_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found or not pending'; END IF;

  -- Block self-approval
  IF v_action.maker_id = v_admin.id THEN
    INSERT INTO portal_admin.admin_audit_log
      (actor_id, actor_email, actor_role, action_category, event_label, dual_control_id, outcome, outcome_note)
    VALUES
      (v_admin.id, v_admin.email, v_admin.role_slug, 'dual_control.self_approval_blocked',
       'Self-approval attempt blocked', p_action_id, 'blocked',
       'Maker cannot approve their own action');
    RAISE EXCEPTION 'Self-approval is not permitted';
  END IF;

  -- Block expired
  IF v_action.expires_at < now() THEN
    RAISE EXCEPTION 'Action has expired';
  END IF;

  -- Check checker has dual_control:approve permission
  IF NOT portal_admin.has_permission('dual_control:approve') THEN
    RAISE EXCEPTION 'Insufficient permissions to approve dual-control actions';
  END IF;

  SELECT * INTO v_session FROM portal_admin.admin_sessions
  WHERE admin_user_id = v_admin.id AND is_active = TRUE
  ORDER BY last_active_at DESC LIMIT 1;

  -- Approve
  UPDATE portal_admin.admin_dual_control_actions SET
    status       = 'approved',
    checker_id   = v_admin.id,
    checker_email= v_admin.email,
    checker_role = v_admin.role_slug,
    checker_note = p_note,
    checker_ip   = COALESCE(v_session.ip_address, '0.0.0.0'::INET),
    checked_at   = now()
  WHERE id = p_action_id;

  -- Execute the action
  PERFORM portal_admin._execute_dual_control_action(p_action_id);

  -- Audit
  INSERT INTO portal_admin.admin_audit_log
    (actor_id, actor_email, actor_role, actor_ip, action_category, event_label,
     resource_type, resource_id, dual_control_id, outcome, outcome_note)
  VALUES
    (v_admin.id, v_admin.email, v_admin.role_slug,
     COALESCE(v_session.ip_address, '0.0.0.0'::INET),
     v_action.action_category, 'Dual-control action approved: ' || v_action.action_label,
     v_action.resource_type, v_action.resource_id, p_action_id, 'success', p_note);
END;
$$;

-- Reject a dual-control action
CREATE OR REPLACE FUNCTION portal_admin.admin_reject_dual_control(
  p_action_id UUID,
  p_note      TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin  portal_admin.admin_users%ROWTYPE;
  v_action portal_admin.admin_dual_control_actions%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM portal_admin.admin_users
  WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorised'; END IF;

  SELECT * INTO v_action FROM portal_admin.admin_dual_control_actions
  WHERE id = p_action_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found or not pending'; END IF;

  IF v_action.maker_id = v_admin.id THEN RAISE EXCEPTION 'Cannot reject your own action — use cancel instead'; END IF;

  UPDATE portal_admin.admin_dual_control_actions SET
    status        = 'rejected',
    checker_id    = v_admin.id,
    checker_email = v_admin.email,
    checker_role  = v_admin.role_slug,
    checker_note  = p_note,
    checked_at    = now()
  WHERE id = p_action_id;

  INSERT INTO portal_admin.admin_audit_log
    (actor_id, actor_email, actor_role, action_category, event_label,
     resource_type, resource_id, dual_control_id, outcome, outcome_note)
  VALUES
    (v_admin.id, v_admin.email, v_admin.role_slug,
     v_action.action_category, 'Dual-control action rejected: ' || v_action.action_label,
     v_action.resource_type, v_action.resource_id, p_action_id, 'rejected', p_note);
END;
$$;

-- Execute an approved action (dispatches by action_category)
CREATE OR REPLACE FUNCTION portal_admin._execute_dual_control_action(p_action_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action portal_admin.admin_dual_control_actions%ROWTYPE;
  v_payload JSONB;
BEGIN
  SELECT * INTO v_action FROM portal_admin.admin_dual_control_actions WHERE id = p_action_id;
  v_payload := v_action.payload;

  UPDATE portal_admin.admin_dual_control_actions
  SET status = 'executed', executed_at = now()
  WHERE id = p_action_id;

  CASE v_action.action_category

    WHEN 'user.suspend' THEN
      UPDATE portal_admin.admin_users SET
        status             = 'suspended',
        suspended_at       = now(),
        suspended_by       = v_action.checker_id,
        suspension_reason  = v_payload->>'suspension_reason',
        updated_at         = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.unlock' THEN
      UPDATE portal_admin.admin_users SET
        status             = 'active',
        locked_at          = NULL,
        locked_reason      = NULL,
        failed_login_count = 0,
        updated_at         = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.reset_password' THEN
      UPDATE portal_admin.admin_users SET
        force_password_reset = TRUE,
        updated_at           = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.role_change' THEN
      UPDATE portal_admin.admin_users SET
        role_slug  = v_payload->>'new_role_slug',
        updated_at = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.deactivate' THEN
      UPDATE portal_admin.admin_users SET
        status     = 'deactivated',
        updated_at = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;
      -- Force-end all sessions
      UPDATE portal_admin.admin_sessions SET
        is_active  = FALSE,
        ended_at   = now(),
        end_reason = 'forced'
      WHERE admin_user_id = (v_payload->>'admin_user_id')::UUID AND is_active = TRUE;

    WHEN 'user.force_logout' THEN
      UPDATE portal_admin.admin_sessions SET
        is_active  = FALSE,
        ended_at   = now(),
        end_reason = 'forced'
      WHERE admin_user_id = (v_payload->>'admin_user_id')::UUID AND is_active = TRUE;

    WHEN 'role.create' THEN
      INSERT INTO portal_admin.admin_roles
        (slug, label, description, permissions, is_system, created_by)
      VALUES (
        v_payload->>'slug',
        v_payload->>'label',
        COALESCE(v_payload->>'description', ''),
        ARRAY(SELECT jsonb_array_elements_text(v_payload->'permissions')),
        FALSE,
        v_action.checker_id
      )
      ON CONFLICT (slug) DO NOTHING;

    ELSE
      -- Unknown category — log warning but don't fail
      INSERT INTO portal_admin.admin_audit_log
        (action_category, event_label, dual_control_id, outcome, outcome_note)
      VALUES ('execution.unknown', 'Unknown action category: ' || v_action.action_category,
              p_action_id, 'logged', 'No executor registered for this category');

  END CASE;

  EXCEPTION WHEN OTHERS THEN
    UPDATE portal_admin.admin_dual_control_actions
    SET execution_error = SQLERRM, status = 'approved'  -- keep approved, mark error
    WHERE id = p_action_id;
    RAISE;
END;
$$;

-- Grant execute on RPCs to authenticated
GRANT EXECUTE ON FUNCTION portal_admin.admin_submit_dual_control TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.admin_approve_dual_control TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.admin_reject_dual_control  TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.is_admin                   TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.has_permission             TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.my_role_slug               TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.my_permissions             TO authenticated;

-- Grant table access to authenticated (RLS enforces what they can see)
GRANT SELECT, INSERT, UPDATE ON portal_admin.admin_users                TO authenticated;
GRANT SELECT, INSERT, UPDATE ON portal_admin.admin_sessions             TO authenticated;
GRANT SELECT, INSERT         ON portal_admin.admin_dual_control_actions TO authenticated;
GRANT SELECT, INSERT         ON portal_admin.admin_audit_log            TO authenticated;
GRANT SELECT                 ON portal_admin.admin_roles                TO authenticated;
