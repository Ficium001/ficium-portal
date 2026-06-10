-- =============================================================================
-- Ficium — user_groups migration
-- Migration: 20250802_user_groups.sql
--
-- Replaces role_slug + PERMISSION_CATALOGUE with a flat group system.
-- Groups live in portal_admin schema.
-- Both admin_users and institution_members reference a group_id.
--
-- Run after: 20250801_portal_admin_schema.sql
-- =============================================================================

-- ─── 1. user_groups table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_admin.user_groups (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT        NOT NULL UNIQUE,
  label              TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  -- 'admin' | 'institution' — drives which shell is rendered post-login
  user_type          TEXT        NOT NULL DEFAULT 'institution'
                                 CHECK (user_type IN ('admin', 'institution')),
  -- Module keys from MODULE_CATALOGUE, or ['*'] for super_admin
  module_permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by         UUID        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_groups_slug      ON portal_admin.user_groups(slug);
CREATE INDEX IF NOT EXISTS idx_user_groups_user_type ON portal_admin.user_groups(user_type);

-- Auto-update updated_at
CREATE TRIGGER user_groups_updated_at
  BEFORE UPDATE ON portal_admin.user_groups
  FOR EACH ROW EXECUTE FUNCTION portal_admin.set_updated_at();

-- ─── 2. Add group_id to admin_users ──────────────────────────────────────────

ALTER TABLE portal_admin.admin_users
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES portal_admin.user_groups(id);

CREATE INDEX IF NOT EXISTS idx_admin_users_group ON portal_admin.admin_users(group_id);

-- ─── 3. Add group_id to institution_members ───────────────────────────────────
-- institution_members lives in the institution schema

ALTER TABLE institution.institution_members
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES portal_admin.user_groups(id);

CREATE INDEX IF NOT EXISTS idx_inst_members_group ON institution.institution_members(group_id);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE portal_admin.user_groups ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read groups (needed for nav resolution)
CREATE POLICY groups_select ON portal_admin.user_groups
  FOR SELECT USING (auth.role() = 'authenticated');

-- Write only via service role (mutations go through RPCs / dual-control)
CREATE POLICY groups_write ON portal_admin.user_groups
  FOR ALL USING (auth.role() = 'service_role');

-- ─── 5. Seed system groups ────────────────────────────────────────────────────

INSERT INTO portal_admin.user_groups
  (slug, label, description, user_type, module_permissions, is_system, created_by)
VALUES
  (
    'super_admin', 'Super Admin',
    'Full platform access — all modules',
    'admin', ARRAY['*'], TRUE,
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    'ficium_support', 'Ficium Support',
    'Admin portal — users, sessions and audit',
    'admin',
    ARRAY['admin:dashboard','admin:users','admin:sessions','admin:audit'],
    TRUE, '00000000-0000-0000-0000-000000000000'
  ),
  (
    'institution_admin', 'Institution Admin',
    'Full institution portal + team management',
    'institution',
    ARRAY[
      'inst:dashboard','inst:marketplace','inst:bids','inst:bid_approval',
      'inst:products','inst:webhooks','inst:audit','inst:settings'
    ],
    TRUE, '00000000-0000-0000-0000-000000000000'
  ),
  (
    'bank_officer', 'Bank Officer',
    'Marketplace browse and bid submission',
    'institution',
    ARRAY['inst:dashboard','inst:marketplace','inst:bids'],
    TRUE, '00000000-0000-0000-0000-000000000000'
  ),
  (
    'bank_officer_approver', 'Bank Officer + Approval',
    'Marketplace, bid submission and bid approval (checker)',
    'institution',
    ARRAY['inst:dashboard','inst:marketplace','inst:bids','inst:bid_approval'],
    TRUE, '00000000-0000-0000-0000-000000000000'
  ),
  (
    'it_admin', 'IT Admin',
    'Technical setup — webhooks, settings, products',
    'institution',
    ARRAY['inst:dashboard','inst:products','inst:webhooks','inst:settings'],
    TRUE, '00000000-0000-0000-0000-000000000000'
  ),
  (
    'compliance', 'Compliance',
    'Read-only audit access',
    'institution',
    ARRAY['inst:dashboard','inst:audit'],
    TRUE, '00000000-0000-0000-0000-000000000000'
  )
ON CONFLICT (slug) DO UPDATE SET
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  module_permissions = EXCLUDED.module_permissions,
  updated_at         = now();

-- ─── 6. RPCs ─────────────────────────────────────────────────────────────────

-- List all groups (used by admin groups page)
CREATE OR REPLACE FUNCTION portal_admin.get_user_groups()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',                 g.id,
        'slug',               g.slug,
        'label',              g.label,
        'description',        g.description,
        'user_type',          g.user_type,
        'module_permissions', g.module_permissions,
        'is_system',          g.is_system,
        'member_count',       (
          SELECT COUNT(*) FROM portal_admin.admin_users u
          WHERE u.group_id = g.id AND u.status != 'deactivated'
        ) + (
          SELECT COUNT(*) FROM institution.institution_members m
          WHERE m.group_id = g.id AND m.active = TRUE
        ),
        'created_by',  g.created_by,
        'created_at',  g.created_at,
        'updated_at',  g.updated_at
      )
      ORDER BY g.user_type, g.is_system DESC, g.label
    )
    FROM portal_admin.user_groups g
  );
END;
$$;

-- Get group for the current authenticated user (used by shells for nav)
CREATE OR REPLACE FUNCTION portal_admin.get_my_group()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_group portal_admin.user_groups%ROWTYPE;
BEGIN
  -- Check admin_users first
  SELECT g.* INTO v_group
  FROM portal_admin.user_groups g
  JOIN portal_admin.admin_users u ON u.group_id = g.id
  WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_group)::JSONB;
  END IF;

  -- Check institution_members
  SELECT g.* INTO v_group
  FROM portal_admin.user_groups g
  JOIN institution.institution_members m ON m.group_id = g.id
  WHERE m.auth_user_id = auth.uid() AND m.active = TRUE
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_group)::JSONB;
  END IF;

  RETURN NULL;
END;
$$;

-- Update group module permissions (high-risk — goes through dual-control executor)
CREATE OR REPLACE FUNCTION portal_admin.update_group_modules(
  p_group_id           UUID,
  p_module_permissions TEXT[]
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorised — service role only';
  END IF;

  UPDATE portal_admin.user_groups
  SET module_permissions = p_module_permissions, updated_at = now()
  WHERE id = p_group_id AND is_system = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found or is a system group';
  END IF;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION portal_admin.get_user_groups  TO authenticated;
GRANT EXECUTE ON FUNCTION portal_admin.get_my_group     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON portal_admin.user_groups TO authenticated;
GRANT USAGE ON SCHEMA portal_admin TO authenticated, service_role;

-- ─── 7. Wire detect_portal_user_type to read group.user_type ─────────────────

CREATE OR REPLACE FUNCTION detect_portal_user_type(p_auth_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_type TEXT;
BEGIN
  -- Check admin_users
  SELECT 'admin' INTO v_type
  FROM portal_admin.admin_users
  WHERE auth_user_id = p_auth_user_id AND status = 'active'
  LIMIT 1;

  IF FOUND THEN RETURN v_type; END IF;

  -- Check institution_members
  SELECT 'institution' INTO v_type
  FROM institution.institution_members
  WHERE auth_user_id = p_auth_user_id AND active = TRUE
  LIMIT 1;

  IF FOUND THEN RETURN v_type; END IF;

  RETURN 'unknown';
END;
$$;

GRANT EXECUTE ON FUNCTION detect_portal_user_type TO authenticated, anon;

-- ─── 8. Wire group actions into dual-control executor ─────────────────────────
-- Extend _execute_dual_control_action to handle group.create and group.update_modules

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

    WHEN 'group.create' THEN
      INSERT INTO portal_admin.user_groups
        (slug, label, description, user_type, module_permissions, is_system, created_by)
      VALUES (
        v_payload->>'slug',
        v_payload->>'label',
        COALESCE(v_payload->>'description', ''),
        COALESCE(v_payload->>'user_type', 'institution'),
        ARRAY(SELECT jsonb_array_elements_text(v_payload->'module_permissions')),
        FALSE,
        v_action.checker_id
      )
      ON CONFLICT (slug) DO NOTHING;

    WHEN 'group.update_modules' THEN
      UPDATE portal_admin.user_groups SET
        module_permissions = ARRAY(SELECT jsonb_array_elements_text(v_payload->'module_permissions')),
        updated_at         = now()
      WHERE id = (v_payload->>'group_id')::UUID AND is_system = FALSE;

    WHEN 'role.create' THEN
      -- Legacy — kept for backward compat
      INSERT INTO portal_admin.user_groups
        (slug, label, description, module_permissions, is_system, created_by)
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
      INSERT INTO portal_admin.admin_audit_log
        (action_category, event_label, dual_control_id, outcome, outcome_note)
      VALUES ('execution.unknown', 'Unknown action category: ' || v_action.action_category,
              p_action_id, 'logged', 'No executor registered for this category');

  END CASE;

  EXCEPTION WHEN OTHERS THEN
    UPDATE portal_admin.admin_dual_control_actions
    SET execution_error = SQLERRM, status = 'approved'
    WHERE id = p_action_id;
    RAISE;
END;
$$;
