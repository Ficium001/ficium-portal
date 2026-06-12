-- =============================================================================
-- Ficium Portal — Maker-checker: pending_actions + RPCs + group executor
-- Migration: 20250819_pending_actions_maker_checker.sql
-- Run after: 20250818_institution_groups_phase2.sql
--
-- Creates the institution.pending_actions table that the frontend already
-- queries (usePendingActions / submit_for_approval / approve_action /
-- reject_action in useInstitution.ts) — the table never existed in the DB.
--
-- Shape matches src/institution/types/institution.ts → PendingAction exactly.
--
-- TENANT ISOLATION (SaaS): institution_id NOT NULL, RLS FORCED,
-- composite indexes lead with institution_id.
--
-- Dual-control rule:
--   * Only institution admins can approve/reject.
--   * Checker must differ from maker — EXCEPT when the institution has
--     exactly one active admin (sole-admin override, recorded in
--     checker_note). This unblocks single-admin institutions like MCB
--     today and self-tightens the moment a second admin exists.
-- =============================================================================

-- ─── 1. Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS institution.pending_actions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_category  TEXT        NOT NULL,   -- e.g. group.create, bid.submit
  action_status    TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (action_status IN
                                 ('pending','approved','rejected','expired','cancelled')),
  maker_id         UUID        NOT NULL REFERENCES institution.institution_members(id),
  maker_role       TEXT        NOT NULL DEFAULT '',
  institution_id   UUID        NOT NULL REFERENCES institution.institutions(id) ON DELETE CASCADE,
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resource_type    TEXT        NOT NULL,
  resource_id      UUID,
  payload          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  payload_before   JSONB,
  checker_id       UUID        REFERENCES institution.institution_members(id),
  checker_role     TEXT,
  checker_note     TEXT,
  checked_at       TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  execution_status TEXT        CHECK (execution_status IN
                                 ('pending','executing','executed','failed'))
                               DEFAULT 'pending',
  executed_at      TIMESTAMPTZ,
  execution_error  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TENANT RULE 3: institution_id leads every index
CREATE INDEX IF NOT EXISTS idx_pending_actions_institution
  ON institution.pending_actions (institution_id, action_status, action_category);
CREATE INDEX IF NOT EXISTS idx_pending_actions_expiry
  ON institution.pending_actions (institution_id, expires_at)
  WHERE action_status = 'pending';

-- TENANT RULE 2: RLS forced
ALTER TABLE institution.pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.pending_actions FORCE ROW LEVEL SECURITY;

-- Read: any member of the same institution (the approvals page lists these)
DROP POLICY IF EXISTS pending_actions_select ON institution.pending_actions;
CREATE POLICY pending_actions_select ON institution.pending_actions
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

-- Insert: only as yourself, only into your own institution (via RPC)
DROP POLICY IF EXISTS pending_actions_insert ON institution.pending_actions;
CREATE POLICY pending_actions_insert ON institution.pending_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND maker_id   = (SELECT ctx.member_id      FROM institution.current_member_ctx() ctx)
  );

-- Update (approve/reject): only institution admins of the same institution
DROP POLICY IF EXISTS pending_actions_update ON institution.pending_actions;
CREATE POLICY pending_actions_update ON institution.pending_actions
  FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND (SELECT ctx.is_inst_admin FROM institution.current_member_ctx() ctx)
  );

GRANT SELECT, INSERT, UPDATE ON institution.pending_actions TO authenticated;

-- ─── 2. submit_for_approval ──────────────────────────────────────────────────
-- Matches the frontend call signature exactly:
--   rpc('submit_for_approval', { p_action_category, p_resource_type,
--                                p_resource_id, p_payload })

CREATE OR REPLACE FUNCTION institution.submit_for_approval(
  p_action_category TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_payload         JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_ctx    RECORD;
  v_id     UUID;
  v_role   TEXT;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL THEN
    RAISE EXCEPTION 'Not an active institution member';
  END IF;

  SELECT COALESCE(ug.slug, im.role, '') INTO v_role
  FROM institution.institution_members im
  LEFT JOIN portal_admin.user_groups ug ON ug.id = im.group_id
  WHERE im.id = v_ctx.member_id;

  INSERT INTO institution.pending_actions
    (action_category, maker_id, maker_role, institution_id,
     resource_type, resource_id, payload)
  VALUES
    (p_action_category, v_ctx.member_id, v_role, v_ctx.institution_id,
     p_resource_type, p_resource_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION institution.submit_for_approval(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.submit_for_approval(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ─── 3. Executor (private) ───────────────────────────────────────────────────
-- Applies an approved action. Currently handles group.* categories.
-- Unknown categories are approved but marked execution_status='failed'
-- with a clear error, so nothing silently no-ops.

CREATE OR REPLACE FUNCTION institution._execute_action(p_action institution.pending_actions)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_group_id UUID;
  v_members  INT;
BEGIN
  CASE p_action.action_category

    WHEN 'group.create' THEN
      IF (p_action.payload->>'slug') !~ '^[a-z0-9_]{2,40}$' THEN
        RAISE EXCEPTION 'Invalid group slug';
      END IF;
      INSERT INTO institution.groups
        (institution_id, slug, label, description, module_permissions, created_by)
      VALUES (
        p_action.institution_id,
        p_action.payload->>'slug',
        COALESCE(p_action.payload->>'label', p_action.payload->>'slug'),
        COALESCE(p_action.payload->>'description', ''),
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions')),
          '{}'::TEXT[]
        ),
        p_action.maker_id
      );

    WHEN 'group.update_modules' THEN
      UPDATE institution.groups
      SET module_permissions =
            ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions'))
      WHERE id = (p_action.payload->>'group_id')::UUID
        AND institution_id = p_action.institution_id;   -- tenant guard
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'group.delete' THEN
      v_group_id := (p_action.payload->>'group_id')::UUID;
      SELECT count(*) INTO v_members
      FROM institution.institution_members
      WHERE custom_group_id = v_group_id;
      IF v_members > 0 THEN
        RAISE EXCEPTION 'Group has % member(s) — reassign them first', v_members;
      END IF;
      DELETE FROM institution.groups
      WHERE id = v_group_id
        AND institution_id = p_action.institution_id;   -- tenant guard
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    ELSE
      RAISE EXCEPTION 'No executor for category %', p_action.action_category;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION institution._execute_action(institution.pending_actions) FROM PUBLIC;

-- ─── 4. approve_action ───────────────────────────────────────────────────────
-- Matches frontend: rpc('approve_action', { p_action_id, p_note })

CREATE OR REPLACE FUNCTION institution.approve_action(
  p_action_id UUID,
  p_note      TEXT DEFAULT NULL
)
RETURNS institution.pending_actions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_ctx          RECORD;
  v_action       institution.pending_actions;
  v_admin_count  INT;
  v_note         TEXT := p_note;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL OR NOT v_ctx.is_inst_admin THEN
    RAISE EXCEPTION 'Only institution admins can approve actions';
  END IF;

  SELECT * INTO v_action
  FROM institution.pending_actions
  WHERE id = p_action_id
    AND institution_id = v_ctx.institution_id   -- tenant guard
  FOR UPDATE;

  IF v_action.id IS NULL THEN
    RAISE EXCEPTION 'Action not found';
  END IF;
  IF v_action.action_status <> 'pending' THEN
    RAISE EXCEPTION 'Action is already %', v_action.action_status;
  END IF;
  IF v_action.expires_at < now() THEN
    UPDATE institution.pending_actions
    SET action_status = 'expired' WHERE id = p_action_id;
    RAISE EXCEPTION 'Action has expired';
  END IF;

  -- Dual control: checker must differ from maker, unless sole admin
  IF v_action.maker_id = v_ctx.member_id THEN
    SELECT count(*) INTO v_admin_count
    FROM institution.institution_members im
    LEFT JOIN portal_admin.user_groups ug ON ug.id = im.group_id
    WHERE im.institution_id = v_ctx.institution_id
      AND (im.is_primary_admin OR ug.slug = 'institution_admin');

    IF v_admin_count > 1 THEN
      RAISE EXCEPTION 'Maker cannot approve their own action (dual control)';
    END IF;
    v_note := COALESCE(v_note || ' ', '') || '[sole-admin self-approval]';
  END IF;

  UPDATE institution.pending_actions
  SET action_status    = 'approved',
      checker_id       = v_ctx.member_id,
      checker_role     = 'institution_admin',
      checker_note     = v_note,
      checked_at       = now(),
      execution_status = 'executing'
  WHERE id = p_action_id;

  -- Execute
  BEGIN
    SELECT * INTO v_action FROM institution.pending_actions WHERE id = p_action_id;
    PERFORM institution._execute_action(v_action);
    UPDATE institution.pending_actions
    SET execution_status = 'executed', executed_at = now()
    WHERE id = p_action_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE institution.pending_actions
    SET execution_status = 'failed', execution_error = SQLERRM
    WHERE id = p_action_id;
  END;

  SELECT * INTO v_action FROM institution.pending_actions WHERE id = p_action_id;
  RETURN v_action;
END;
$$;

REVOKE ALL ON FUNCTION institution.approve_action(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.approve_action(UUID, TEXT) TO authenticated;

-- ─── 5. reject_action ────────────────────────────────────────────────────────
-- Matches frontend: rpc('reject_action', { p_action_id, p_note })

CREATE OR REPLACE FUNCTION institution.reject_action(
  p_action_id UUID,
  p_note      TEXT
)
RETURNS institution.pending_actions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_ctx    RECORD;
  v_action institution.pending_actions;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL OR NOT v_ctx.is_inst_admin THEN
    RAISE EXCEPTION 'Only institution admins can reject actions';
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'A rejection note is required';
  END IF;

  UPDATE institution.pending_actions
  SET action_status = 'rejected',
      checker_id    = v_ctx.member_id,
      checker_role  = 'institution_admin',
      checker_note  = p_note,
      checked_at    = now()
  WHERE id = p_action_id
    AND institution_id = v_ctx.institution_id   -- tenant guard
    AND action_status = 'pending'
  RETURNING * INTO v_action;

  IF v_action.id IS NULL THEN
    RAISE EXCEPTION 'Action not found or not pending';
  END IF;

  RETURN v_action;
END;
$$;

REVOKE ALL ON FUNCTION institution.reject_action(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.reject_action(UUID, TEXT) TO authenticated;

-- =============================================================================
-- Verification:
--
-- 1. Table + RLS:
--    SELECT relname, relrowsecurity, relforcerowsecurity
--    FROM pg_class WHERE relname = 'pending_actions';
--
-- 2. From the app as MCB admin: Settings → Groups → Create group →
--    approve it in /approvals → group appears in the list.
--    (Sole-admin self-approval applies while MCB has one admin.)
-- =============================================================================

-- =============================================================================
-- Addendum: user.create executor
-- NOTE: user.create is handled client-side after approval (the Edge Function
-- is called from the frontend onSuccess of approve_action, not from Postgres,
-- because auth.admin requires service-role which can't be passed through
-- Postgres config without superuser). The executor here only validates the
-- payload and marks the action ready — the Edge Function does the real work.
-- =============================================================================
CREATE OR REPLACE FUNCTION institution._execute_action(p_action institution.pending_actions)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_group_id UUID;
  v_members  INT;
BEGIN
  CASE p_action.action_category

    WHEN 'group.create' THEN
      IF (p_action.payload->>'slug') !~ '^[a-z0-9_]{2,40}$' THEN
        RAISE EXCEPTION 'Invalid group slug';
      END IF;
      INSERT INTO institution.groups
        (institution_id, slug, label, description, module_permissions, created_by)
      VALUES (
        p_action.institution_id,
        p_action.payload->>'slug',
        COALESCE(p_action.payload->>'label', p_action.payload->>'slug'),
        COALESCE(p_action.payload->>'description', ''),
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions')),
          '{}'::TEXT[]
        ),
        p_action.maker_id
      );

    WHEN 'group.update_modules' THEN
      UPDATE institution.groups
      SET module_permissions =
            ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions'))
      WHERE id = (p_action.payload->>'group_id')::UUID
        AND institution_id = p_action.institution_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'group.delete' THEN
      v_group_id := (p_action.payload->>'group_id')::UUID;
      SELECT count(*) INTO v_members
      FROM institution.institution_members
      WHERE custom_group_id = v_group_id;
      IF v_members > 0 THEN
        RAISE EXCEPTION 'Group has % member(s) — reassign them first', v_members;
      END IF;
      DELETE FROM institution.groups
      WHERE id = v_group_id
        AND institution_id = p_action.institution_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'user.create' THEN
      -- Validate payload
      IF (p_action.payload->>'email') IS NULL THEN
        RAISE EXCEPTION 'user.create requires email in payload';
      END IF;
      IF (p_action.payload->>'custom_group_id') IS NULL THEN
        RAISE EXCEPTION 'user.create requires custom_group_id in payload';
      END IF;
      -- Verify group belongs to this institution (tenant guard)
      IF NOT EXISTS (
        SELECT 1 FROM institution.groups
        WHERE id = (p_action.payload->>'custom_group_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;
      -- Delegate to Edge Function (needs service-role for auth.admin)
      -- Provisioning delegated to Edge Function called from frontend.

    ELSE
      RAISE EXCEPTION 'No executor for category %', p_action.action_category;
  END CASE;
END;
$$;

-- =============================================================================
-- Addendum: user.assign_group executor
-- Updates custom_group_id + member_role on institution_members directly.
-- No Edge Function needed — pure SQL with tenant guard.
-- =============================================================================

CREATE OR REPLACE FUNCTION institution._execute_action(p_action institution.pending_actions)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_group_id UUID;
  v_members  INT;
BEGIN
  CASE p_action.action_category

    WHEN 'group.create' THEN
      IF (p_action.payload->>'slug') !~ '^[a-z0-9_]{2,40}$' THEN
        RAISE EXCEPTION 'Invalid group slug';
      END IF;
      INSERT INTO institution.groups
        (institution_id, slug, label, description, module_permissions, created_by)
      VALUES (
        p_action.institution_id,
        p_action.payload->>'slug',
        COALESCE(p_action.payload->>'label', p_action.payload->>'slug'),
        COALESCE(p_action.payload->>'description', ''),
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions')),
          '{}'::TEXT[]
        ),
        p_action.maker_id
      );

    WHEN 'group.update_modules' THEN
      UPDATE institution.groups
      SET module_permissions =
            ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions'))
      WHERE id = (p_action.payload->>'group_id')::UUID
        AND institution_id = p_action.institution_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'group.delete' THEN
      v_group_id := (p_action.payload->>'group_id')::UUID;
      SELECT count(*) INTO v_members
      FROM institution.institution_members
      WHERE custom_group_id = v_group_id;
      IF v_members > 0 THEN
        RAISE EXCEPTION 'Group has % member(s) — reassign them first', v_members;
      END IF;
      DELETE FROM institution.groups
      WHERE id = v_group_id
        AND institution_id = p_action.institution_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'user.create' THEN
      IF (p_action.payload->>'email') IS NULL THEN
        RAISE EXCEPTION 'user.create requires email in payload';
      END IF;
      IF (p_action.payload->>'custom_group_id') IS NULL THEN
        RAISE EXCEPTION 'user.create requires custom_group_id in payload';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM institution.groups
        WHERE id = (p_action.payload->>'custom_group_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;
      -- Actual provisioning is handled by the provision-institution-user
      -- Edge Function, called from the frontend after approve_action succeeds.
      -- The executor marks execution_status='executed' via approve_action flow.

    WHEN 'user.assign_group' THEN
      -- Tenant guard: member must belong to this institution
      IF NOT EXISTS (
        SELECT 1 FROM institution.institution_members
        WHERE id = (p_action.payload->>'member_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Member not found in this institution';
      END IF;
      -- Tenant guard: group must belong to this institution
      IF NOT EXISTS (
        SELECT 1 FROM institution.groups
        WHERE id = (p_action.payload->>'custom_group_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;
      UPDATE institution.institution_members
      SET
        custom_group_id = (p_action.payload->>'custom_group_id')::UUID,
        member_role     = COALESCE(p_action.payload->>'member_role', member_role)
      WHERE id              = (p_action.payload->>'member_id')::UUID
        AND institution_id  = p_action.institution_id;

    ELSE
      RAISE EXCEPTION 'No executor for category %', p_action.action_category;
  END CASE;
END;
$$;
