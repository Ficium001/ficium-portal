-- =============================================================================
-- Ficium Portal — Phase 2: Institution-scoped Groups & User Provisioning prep
-- Migration: 20250818_institution_groups_phase2.sql
-- Run after: 20250817_default_member_group.sql
--
-- TENANT ISOLATION RULES (SaaS — providers must always be segregated):
--   1. Every tenant-scoped table carries institution_id NOT NULL
--   2. RLS enabled + FORCED, scoped to the caller's institution
--   3. Composite indexes lead with institution_id
--
-- Follows the existing flat-group pattern from 20250802_user_groups.sql
-- (module_permissions TEXT[] on the group row — no join table), so the
-- frontend can reuse the same group shape it already renders in AdminGroups.
-- =============================================================================

-- ─── 0. Helper: caller's membership context (SECURITY DEFINER, no recursion) ─
-- Same pattern as institution.assign_default_member_group(): definer-owned so
-- it can read institution_members + portal_admin.user_groups regardless of
-- the caller's RLS grants, and so policies can call it without self-joining
-- institution_members (the 20250816 recursion bug).

CREATE OR REPLACE FUNCTION institution.current_member_ctx()
RETURNS TABLE (member_id UUID, institution_id UUID, is_inst_admin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
  SELECT
    im.id,
    im.institution_id,
    (im.is_primary_admin OR ug.slug = 'institution_admin') AS is_inst_admin
  FROM institution.institution_members im
  LEFT JOIN portal_admin.user_groups ug ON ug.id = im.group_id
  WHERE im.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION institution.current_member_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.current_member_ctx() TO authenticated;

-- ─── 1. institution.groups — custom groups, scoped per institution ──────────
-- Mirrors portal_admin.user_groups shape (slug/label/module_permissions) but
-- is tenant-scoped: every row belongs to exactly one institution.

CREATE TABLE IF NOT EXISTS institution.groups (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     UUID        NOT NULL REFERENCES institution.institutions(id) ON DELETE CASCADE,
  slug               TEXT        NOT NULL,
  label              TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  -- Module keys from MODULE_CATALOGUE (institution-facing modules only)
  module_permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system          BOOLEAN     NOT NULL DEFAULT FALSE,  -- reserved: default templates
  created_by         UUID        REFERENCES institution.institution_members(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Slug unique per institution — NEVER globally (providers are segregated)
  CONSTRAINT groups_slug_unique_per_institution UNIQUE (institution_id, slug)
);

-- TENANT RULE 3: institution_id leads every index
CREATE INDEX IF NOT EXISTS idx_inst_groups_institution
  ON institution.groups (institution_id, slug);

CREATE TRIGGER inst_groups_updated_at
  BEFORE UPDATE ON institution.groups
  FOR EACH ROW EXECUTE FUNCTION portal_admin.set_updated_at();

-- TENANT RULE 2: RLS forced — even definer-owned app paths stay scoped
ALTER TABLE institution.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.groups FORCE ROW LEVEL SECURITY;

-- Read: any member of the same institution
CREATE POLICY inst_groups_select ON institution.groups
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

-- Write: only institution admins of the SAME institution
CREATE POLICY inst_groups_insert ON institution.groups
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND (SELECT ctx.is_inst_admin FROM institution.current_member_ctx() ctx)
  );

CREATE POLICY inst_groups_update ON institution.groups
  FOR UPDATE TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND (SELECT ctx.is_inst_admin FROM institution.current_member_ctx() ctx)
  );

CREATE POLICY inst_groups_delete ON institution.groups
  FOR DELETE TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND (SELECT ctx.is_inst_admin FROM institution.current_member_ctx() ctx)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON institution.groups TO authenticated;

-- ─── 2. institution_members: support custom institution groups + roles ──────
-- A member resolves modules from EITHER a platform system group (group_id →
-- portal_admin.user_groups) OR a custom institution group (custom_group_id).
-- Custom group wins when both are set.

ALTER TABLE institution.institution_members
  ADD COLUMN IF NOT EXISTS custom_group_id UUID REFERENCES institution.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_role TEXT
    CHECK (member_role IN ('maker','checker','viewer','api_operator'));

-- TENANT RULE 3 (ensure the leading-institution_id index exists)
CREATE INDEX IF NOT EXISTS idx_inst_members_institution
  ON institution.institution_members (institution_id, auth_user_id);

-- Cross-tenant guard: a member can never be assigned another institution's
-- group, regardless of how the write happens (UI, RPC, or elevated path).
CREATE OR REPLACE FUNCTION institution.enforce_member_group_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution
AS $$
DECLARE
  grp_institution UUID;
BEGIN
  IF NEW.custom_group_id IS NOT NULL THEN
    SELECT g.institution_id INTO grp_institution
    FROM institution.groups g WHERE g.id = NEW.custom_group_id;

    IF grp_institution IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'Cross-tenant group assignment blocked: group belongs to a different institution';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_group_tenant ON institution.institution_members;
CREATE TRIGGER trg_member_group_tenant
  BEFORE INSERT OR UPDATE OF custom_group_id ON institution.institution_members
  FOR EACH ROW EXECUTE FUNCTION institution.enforce_member_group_tenant();

-- ─── 3. Module resolution for the nav: custom group first, fallback platform ─

CREATE OR REPLACE FUNCTION institution.get_my_modules()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
  SELECT COALESCE(
    -- custom institution group takes precedence
    (SELECT g.module_permissions
       FROM institution.institution_members im
       JOIN institution.groups g ON g.id = im.custom_group_id
      WHERE im.auth_user_id = auth.uid()),
    -- fallback: platform system group (Phase 1 path)
    (SELECT ug.module_permissions
       FROM institution.institution_members im
       JOIN portal_admin.user_groups ug ON ug.id = im.group_id
      WHERE im.auth_user_id = auth.uid()),
    '{}'::TEXT[]
  );
$$;

REVOKE ALL ON FUNCTION institution.get_my_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.get_my_modules() TO authenticated;

-- ─── 4. pending_actions: NOTE ─────────────────────────────────────────────
-- pending_actions table was created directly in Supabase (not in migrations).
-- The user.invite → user.create rename + execution_status column addition
-- should be run as a one-off after confirming the table's schema:
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'pending_actions'
--   ORDER BY ordinal_position;
--
-- Then run separately:
--   UPDATE <schema>.pending_actions SET action_category = 'user.create'
--     WHERE action_category = 'user.invite';
--   ALTER TABLE <schema>.pending_actions
--     ADD COLUMN IF NOT EXISTS execution_status TEXT
--       CHECK (execution_status IN ('pending','executing','executed','failed'))
--       DEFAULT 'pending';
-- =============================================================================
-- Verification (run after migration):
--
-- 1. RLS forced on the new table:
--    SELECT relname, relrowsecurity, relforcerowsecurity
--    FROM pg_class WHERE relname = 'groups';
--    → groups | t | t
--
-- 2. As MCB's admin, create a test group:
--    INSERT INTO institution.groups (institution_id, slug, label, module_permissions)
--    VALUES ((SELECT institution_id FROM institution.current_member_ctx()),
--            'credit_team', 'Credit Team', ARRAY['marketplace','products']);
--
-- 3. Cross-tenant check — MUST fail with an RLS violation:
--    INSERT INTO institution.groups (institution_id, slug, label)
--    VALUES ('<some-other-institution-uuid>', 'leak_test', 'Leak Test');
--
-- 4. Module resolution: SELECT institution.get_my_modules();
-- =============================================================================
