-- =============================================================================
-- Ficium Migration 04b — Fix for 04 errors
-- Replaces the failing parts of migration 04. Safe to run after 04 partial run.
-- Fixes:
--   1. `group` is reserved — use "group" with quotes
--   2. api_key table is NEW (never existed as institution_api_keys) — just create it
--   3. DROP current_member_ctx before recreating (return type changed)
--   4. Runs steps 11–13 that never executed
-- =============================================================================

-- ── Fix 1: Rename groups → "group" (quoted reserved word) ───────────────────
DO $$ BEGIN
  ALTER TABLE institution.groups RENAME TO "group";
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- ── Fix 2: api_key — create if missing, then add any missing columns ────────
CREATE TABLE IF NOT EXISTS institution.api_key (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  key_prefix     TEXT NOT NULL DEFAULT '',
  key_hash       TEXT NOT NULL DEFAULT '' UNIQUE,
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add every v2 column idempotently (skips if already present)
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN last_used_at  TIMESTAMPTZ;                                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN last_used_ip  INET;                                                                     EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN expires_at    TIMESTAMPTZ;                                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN revoked_at    TIMESTAMPTZ;                                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN revoked_by    UUID REFERENCES institution.member(id) ON DELETE SET NULL;                EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN created_by    UUID REFERENCES institution.member(id) ON DELETE SET NULL;                EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN key_prefix    TEXT NOT NULL DEFAULT '';                                                 EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN key_hash      TEXT NOT NULL DEFAULT '';                                                 EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_api_key_inst
  ON institution.api_key (institution_id, revoked_at);

ALTER TABLE institution.api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.api_key FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY api_key_select ON institution.api_key
    FOR SELECT TO authenticated
    USING (institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON institution.api_key TO authenticated;

-- Compat view for old name (if anything references institution_api_keys)
CREATE OR REPLACE VIEW institution.institution_api_keys
  WITH (security_invoker = on) AS SELECT * FROM institution.api_key;
GRANT SELECT ON institution.institution_api_keys TO authenticated;

-- ── Fix 3: DROP current_member_ctx before redefining (return type changed) ───
DROP FUNCTION IF EXISTS institution.current_member_ctx();

CREATE OR REPLACE FUNCTION institution.current_member_ctx()
RETURNS TABLE (
  member_id      UUID,
  institution_id UUID,
  is_admin       BOOLEAN,
  member_role    TEXT,
  modules        TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = institution, admin, portal_admin
AS $$
  SELECT
    m.id,
    m.institution_id,
    (m.is_primary_admin OR COALESCE(sg.slug, pg.slug, '') = 'institution_admin') AS is_admin,
    COALESCE(m.member_role, 'maker')                                              AS member_role,
    COALESCE(
      cg.module_permissions,   -- custom group (tenant-defined)
      sg.module_permissions,   -- admin.system_group (v2)
      pg.module_permissions,   -- portal_admin.user_groups (compat fallback)
      '{}'::TEXT[]
    ) AS modules
  FROM institution.member m
  LEFT JOIN institution."group"        cg ON cg.id = m.custom_group_id
  LEFT JOIN admin.system_group         sg ON sg.id = m.system_group_id
  LEFT JOIN portal_admin.user_groups   pg ON pg.id = m.group_id
  WHERE m.user_id = auth.uid()
    AND m.status  = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION institution.current_member_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.current_member_ctx() TO authenticated;

-- ── Fix 4a: Compat views for old names (step 11) ─────────────────────────────
CREATE OR REPLACE VIEW institution.institutions
  WITH (security_invoker = on) AS SELECT * FROM institution.institution;
CREATE OR REPLACE VIEW institution.institution_members
  WITH (security_invoker = on) AS SELECT * FROM institution.member;
CREATE OR REPLACE VIEW institution.groups
  WITH (security_invoker = on) AS SELECT * FROM institution."group";
CREATE OR REPLACE VIEW institution.institution_product_config
  WITH (security_invoker = on) AS SELECT * FROM institution.product_config;
CREATE OR REPLACE VIEW institution.institution_webhooks
  WITH (security_invoker = on) AS SELECT * FROM institution.webhook;

GRANT SELECT ON institution.institutions               TO authenticated;
GRANT SELECT ON institution.institution_members        TO authenticated;
GRANT SELECT ON institution.groups                     TO authenticated;
GRANT SELECT ON institution.institution_product_config TO authenticated;
GRANT SELECT ON institution.institution_webhooks       TO authenticated;

-- ── Fix 4b: Default member group trigger (step 12) ────────────────────────────
CREATE OR REPLACE FUNCTION institution.assign_default_member_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, admin, portal_admin AS $$
BEGIN
  IF NEW.system_group_id IS NULL AND NEW.group_id IS NULL THEN
    IF NEW.is_primary_admin THEN
      SELECT id INTO NEW.system_group_id
        FROM admin.system_group WHERE slug = 'institution_admin' LIMIT 1;
      IF NEW.system_group_id IS NULL THEN
        SELECT id INTO NEW.group_id
          FROM portal_admin.user_groups WHERE slug = 'institution_admin' LIMIT 1;
      END IF;
    ELSE
      SELECT id INTO NEW.system_group_id
        FROM admin.system_group WHERE slug = 'bank_officer' LIMIT 1;
      IF NEW.system_group_id IS NULL THEN
        SELECT id INTO NEW.group_id
          FROM portal_admin.user_groups WHERE slug = 'bank_officer' LIMIT 1;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_default_member_group ON institution.member;
CREATE TRIGGER trg_assign_default_member_group
  BEFORE INSERT ON institution.member
  FOR EACH ROW EXECUTE FUNCTION institution.assign_default_member_group();

-- ── Fix 4c: submit_for_approval shim (step 13) ────────────────────────────────
CREATE OR REPLACE FUNCTION institution.submit_for_approval(
  p_action_category TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_payload         JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin AS $$
DECLARE
  v_ctx  RECORD;
  v_id   UUID;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL THEN
    RAISE EXCEPTION 'Not an active institution member';
  END IF;

  INSERT INTO institution.pending_actions
    (action_category, institution_id, maker_id, maker_role,
     resource_type, resource_id, payload)
  VALUES
    (p_action_category, v_ctx.institution_id, v_ctx.member_id,
     v_ctx.member_role, p_resource_type, p_resource_id,
     COALESCE(p_payload, '{}'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION institution.submit_for_approval FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.submit_for_approval TO authenticated;

-- ── RLS on "group" table (was missing from partial run) ──────────────────────
ALTER TABLE institution."group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution."group" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY group_select ON institution."group"
    FOR SELECT TO authenticated
    USING (institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE ON institution."group" TO authenticated;

-- ── Cross-tenant guard on member group assignment ────────────────────────────
CREATE OR REPLACE FUNCTION institution.enforce_member_group_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution AS $$
BEGIN
  IF NEW.custom_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM institution."group"
      WHERE id = NEW.custom_group_id
        AND institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Cross-tenant group assignment blocked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_group_tenant ON institution.member;
CREATE TRIGGER trg_member_group_tenant
  BEFORE INSERT OR UPDATE OF custom_group_id ON institution.member
  FOR EACH ROW EXECUTE FUNCTION institution.enforce_member_group_tenant();

-- ── Verification ─────────────────────────────────────────────────────────────
/*
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'institution'
ORDER BY table_name;
-- Should include: api_key, group, institution, member, product_config,
--                 webhook, webhook_delivery, kyb_document, pending_actions

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'institution'
ORDER BY routine_name;
-- Should include: current_member_ctx, submit_for_approval,
--                 assign_default_member_group, enforce_member_group_tenant
*/
