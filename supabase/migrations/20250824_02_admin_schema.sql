-- =============================================================================
-- Ficium Migration 02/06 — admin schema
-- Builds admin.* tables alongside portal_admin.* (no removal yet).
-- Backfills data from portal_admin. Creates compat views so existing
-- portal_admin.* calls keep working unchanged.
-- Frontend impact: NONE (compat views in place)
-- =============================================================================

-- ── admin.system_group (replaces portal_admin.user_groups) ──────────────────
CREATE TABLE IF NOT EXISTS admin.system_group (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT        NOT NULL UNIQUE,
  label              TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  side               TEXT        NOT NULL DEFAULT 'institution'
                                 CHECK (side IN ('institution','admin','both')),
  module_permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER admin_system_group_updated_at
  BEFORE UPDATE ON admin.system_group
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from portal_admin.user_groups
INSERT INTO admin.system_group
  (id, slug, label, description, module_permissions, is_system, created_at, updated_at)
SELECT
  id, slug, label, description, module_permissions, is_system, created_at, updated_at
FROM portal_admin.user_groups
ON CONFLICT (id) DO NOTHING;

-- ── admin.role (replaces portal_admin.admin_roles) ───────────────────────────
CREATE TABLE IF NOT EXISTS admin.role (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin.role (id, slug, label, description, permissions, is_system, created_at)
SELECT id, slug, label, description, permissions, is_system, created_at
FROM portal_admin.admin_roles
ON CONFLICT (id) DO NOTHING;

-- ── admin.user (replaces portal_admin.admin_users) ───────────────────────────
CREATE TABLE IF NOT EXISTS admin.user (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id          UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL UNIQUE,
  display_name          TEXT        NOT NULL,
  role_id               UUID        REFERENCES admin.role(id),
  role_slug             TEXT        NOT NULL DEFAULT 'support'
                                    CHECK (role_slug IN
                                      ('super_admin','institution_mgr','compliance','support','auditor','custom')),
  system_group_id       UUID        REFERENCES admin.system_group(id),
  status                TEXT        NOT NULL DEFAULT 'pending_mfa'
                                    CHECK (status IN
                                      ('active','locked','suspended','pending_mfa','deactivated')),
  mfa_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  mfa_verified_at       TIMESTAMPTZ,
  failed_login_count    INT         NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  locked_reason         TEXT,
  force_password_reset  BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_user_auth   ON admin.user (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_status ON admin.user (status);
CREATE OR REPLACE TRIGGER admin_user_updated_at
  BEFORE UPDATE ON admin.user
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from portal_admin.admin_users
INSERT INTO admin.user
  (id, auth_user_id, email, display_name, role_slug, system_group_id,
   status, mfa_enabled, failed_login_count, locked_at,
   force_password_reset, created_at, updated_at)
SELECT
  u.id, u.auth_user_id, u.email, u.display_name, u.role_slug, u.group_id,
  u.status::TEXT, u.mfa_enabled, u.failed_login_count, u.locked_at,
  u.force_password_reset, u.created_at, u.updated_at
FROM portal_admin.admin_users u
ON CONFLICT (id) DO NOTHING;

-- Link role_id from role_slug
UPDATE admin.user u
SET role_id = r.id
FROM admin.role r
WHERE r.slug = u.role_slug AND u.role_id IS NULL;

-- ── admin.session (replaces portal_admin.admin_sessions) ────────────────────
CREATE TABLE IF NOT EXISTS admin.session (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES admin.user(id) ON DELETE CASCADE,
  ip_address     INET        NOT NULL,
  user_agent     TEXT        NOT NULL DEFAULT '',
  country        TEXT,
  city           TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  end_reason     TEXT        CHECK (end_reason IN ('logout','timeout','forced','expired')),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_admin_session_user   ON admin.session (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_admin_session_active ON admin.session (is_active, last_active_at)
  WHERE is_active = TRUE;

-- Backfill sessions (admin_user_id → user_id mapping)
INSERT INTO admin.session
  (id, user_id, ip_address, user_agent, started_at, last_active_at,
   ended_at, end_reason, is_active)
SELECT
  s.id, u.id, s.ip_address, COALESCE(s.user_agent,''),
  s.started_at, s.last_active_at, s.ended_at, s.end_reason, s.is_active
FROM portal_admin.admin_sessions s
JOIN admin.user u ON u.auth_user_id = (
  SELECT auth_user_id FROM portal_admin.admin_users WHERE id = s.admin_user_id
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE admin.system_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.role         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.user         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.session      ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION admin.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM admin.user WHERE auth_user_id = auth.uid() AND status = 'active')
$$;

CREATE OR REPLACE FUNCTION admin.current_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM admin.user WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION admin.has_permission(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin.user u
    JOIN admin.role r ON r.id = u.role_id
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND ('*' = ANY(r.permissions) OR p_key = ANY(r.permissions))
  )
$$;

REVOKE ALL ON FUNCTION admin.is_admin()           FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.current_user_id()    FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION admin.current_user_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION admin.has_permission(TEXT) TO authenticated;

-- Auto-lock after 5 failed logins
CREATE OR REPLACE FUNCTION admin.check_failed_logins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.failed_login_count >= 5 AND OLD.status = 'active' THEN
    NEW.status        := 'locked';
    NEW.locked_at     := now();
    NEW.locked_reason := 'Auto-locked: 5 consecutive failed login attempts';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS admin_user_failed_login_lock ON admin.user;
CREATE TRIGGER admin_user_failed_login_lock
  BEFORE UPDATE OF failed_login_count ON admin.user
  FOR EACH ROW EXECUTE FUNCTION admin.check_failed_logins();

-- Policies
CREATE POLICY admin_system_group_select ON admin.system_group FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY admin_role_select         ON admin.role         FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_user_select         ON admin.user         FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_user_write          ON admin.user         FOR ALL    TO authenticated USING (auth.role() = 'service_role');
CREATE POLICY admin_session_select      ON admin.session      FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_session_write       ON admin.session      FOR ALL    TO authenticated USING (admin.is_admin());

GRANT USAGE ON SCHEMA admin TO authenticated;
GRANT SELECT ON admin.system_group                TO authenticated;
GRANT SELECT ON admin.role                        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.user        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.session     TO authenticated;

-- ── COMPAT VIEWS in portal_admin (frontend keeps working unchanged) ───────────
CREATE OR REPLACE VIEW portal_admin.user_groups
  WITH (security_invoker = on) AS SELECT * FROM admin.system_group;
CREATE OR REPLACE VIEW portal_admin.admin_users_v
  WITH (security_invoker = on) AS SELECT * FROM admin.user;

GRANT SELECT ON portal_admin.user_groups   TO authenticated;
GRANT SELECT ON portal_admin.admin_users_v TO authenticated;

-- Update get_my_group to read from admin schema (still returns same shape)
CREATE OR REPLACE FUNCTION portal_admin.get_my_group()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_group admin.system_group%ROWTYPE;
BEGIN
  -- Admin user path
  SELECT sg.* INTO v_group
  FROM admin.system_group sg
  JOIN admin.user u ON u.system_group_id = sg.id
  WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  -- Institution member path (still reads portal_admin.user_groups via existing join)
  SELECT sg.* INTO v_group
  FROM admin.system_group sg
  JOIN institution.institution_members m ON m.group_id = sg.id
  WHERE m.auth_user_id = auth.uid()
  LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION portal_admin.get_my_group() TO authenticated;

-- Update is_admin, has_permission to delegate to admin schema
CREATE OR REPLACE FUNCTION portal_admin.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT admin.is_admin()
$$;
CREATE OR REPLACE FUNCTION portal_admin.has_permission(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT admin.has_permission(p_key)
$$;
GRANT EXECUTE ON FUNCTION portal_admin.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.has_permission(TEXT) TO authenticated;
