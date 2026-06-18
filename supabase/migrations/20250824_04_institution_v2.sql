-- =============================================================================
-- Ficium Migration 04/06 — institution schema v2
-- Renames existing tables to v2 names, adds new tables, creates compat views.
-- Every step is idempotent. Frontend keeps working via compat views.
-- Frontend impact: NONE (compat views cover all old names)
-- =============================================================================

-- ── Step 1: Rename institution.institutions → institution.institution ─────────
DO $$ BEGIN
  ALTER TABLE institution.institutions RENAME TO institution;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- ── Step 2: Add new columns to institution.institution ───────────────────────
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN country               CHAR(2)     REFERENCES catalog.country(code);      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN regulator              TEXT        REFERENCES catalog.regulator(code);    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN tax_id                 TEXT;                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN incorporation_date     DATE;                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN logo_url               TEXT;                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN timezone               TEXT        NOT NULL DEFAULT 'Indian/Mauritius';   EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN compliance_reviewed_at TIMESTAMPTZ;                                      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN compliance_reviewed_by UUID        REFERENCES auth.users(id);            EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN approved_by            UUID        REFERENCES auth.users(id);            EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN suspended_by           UUID        REFERENCES auth.users(id);            EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN offboarded_at          TIMESTAMPTZ;                                      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN notes                  TEXT;                                              EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.institution ADD COLUMN metadata               JSONB       NOT NULL DEFAULT '{}';                 EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add indexes on new columns
CREATE INDEX IF NOT EXISTS idx_institution_stage   ON institution.institution (onboarding_stage, approved);
CREATE INDEX IF NOT EXISTS idx_institution_country ON institution.institution (country, institution_type);

-- ── Step 3: Rename institution.institution_members → institution.member ───────
DO $$ BEGIN
  ALTER TABLE institution.institution_members RENAME TO member;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Add new columns to member
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN system_group_id UUID;           EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN custom_group_id UUID;           EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN member_role     TEXT NOT NULL DEFAULT 'maker' CHECK (member_role IN ('maker','checker','viewer','api_operator')); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN invited_by      UUID REFERENCES auth.users(id);   EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN invited_at      TIMESTAMPTZ;    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN activated_at    TIMESTAMPTZ;    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.member ADD COLUMN deactivated_at  TIMESTAMPTZ;    EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_member_institution ON institution.member (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_member_user        ON institution.member (user_id);

CREATE OR REPLACE TRIGGER institution_member_updated_at
  BEFORE UPDATE ON institution.member
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Step 4: Rename institution.groups → institution.group ─────────────────────
DO $$ BEGIN
  ALTER TABLE institution.groups RENAME TO group;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

CREATE OR REPLACE TRIGGER institution_group_updated_at
  BEFORE UPDATE ON institution.group
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Step 5: Rename institution_product_config → product_config ───────────────
DO $$ BEGIN
  ALTER TABLE institution.institution_product_config RENAME TO product_config;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Add enhanced columns to product_config
DO $$ BEGIN ALTER TABLE institution.product_config ADD COLUMN min_rate              NUMERIC(8,4); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_config ADD COLUMN max_rate              NUMERIC(8,4); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_config ADD COLUMN bid_window_minutes    INT;          EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_config ADD COLUMN auto_withdraw_minutes INT;          EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_config ADD COLUMN conditions            JSONB NOT NULL DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_product_config_inst
  ON institution.product_config (institution_id, enabled);

CREATE OR REPLACE TRIGGER institution_product_config_updated_at
  BEFORE UPDATE ON institution.product_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Step 6: Rename institution_api_keys → api_key ────────────────────────────
DO $$ BEGIN
  ALTER TABLE institution.institution_api_keys RENAME TO api_key;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN last_used_ip INET; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.api_key ADD COLUMN expires_at   TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_api_key_inst
  ON institution.api_key (institution_id) WHERE revoked_at IS NULL;

-- ── Step 7: Rename institution_webhooks → webhook ─────────────────────────────
DO $$ BEGIN
  ALTER TABLE institution.institution_webhooks RENAME TO webhook;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE institution.webhook ADD COLUMN signing_secret TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.webhook ADD COLUMN failure_count  INT  NOT NULL DEFAULT 0;  EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_webhook_inst ON institution.webhook (institution_id, active);

CREATE OR REPLACE TRIGGER institution_webhook_updated_at
  BEFORE UPDATE ON institution.webhook
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Step 8: New tables ────────────────────────────────────────────────────────

-- webhook_delivery (new)
CREATE TABLE IF NOT EXISTS institution.webhook_delivery (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID        NOT NULL REFERENCES institution.webhook(id) ON DELETE CASCADE,
  institution_id  UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  event_id        UUID        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','delivered','failed','retrying','abandoned')),
  attempts        INT         NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INT,
  response_body   TEXT,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (webhook_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_inst
  ON institution.webhook_delivery (institution_id, status, next_retry_at)
  WHERE status IN ('pending','retrying');

-- kyb_document (new)
CREATE TABLE IF NOT EXISTS institution.kyb_document (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  doc_type         TEXT        NOT NULL
                               CHECK (doc_type IN (
                                 'certificate_of_incorporation','business_registration',
                                 'regulator_license','tax_certificate','audited_accounts',
                                 'aml_policy','beneficial_owner_declaration','other')),
  label            TEXT        NOT NULL,
  storage_path     TEXT        NOT NULL,
  mime_type        TEXT        NOT NULL,
  file_size_bytes  INT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','under_review','accepted','rejected')),
  rejection_reason TEXT,
  reviewed_by      UUID        REFERENCES auth.users(id),
  reviewed_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  uploaded_by      UUID        REFERENCES institution.member(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyb_doc_inst
  ON institution.kyb_document (institution_id, doc_type, status);

-- ── Step 9: RLS on new tables ─────────────────────────────────────────────────
ALTER TABLE institution.webhook_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook_delivery FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.kyb_document     ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.kyb_document     FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY webhook_delivery_select ON institution.webhook_delivery
    FOR SELECT TO authenticated
    USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY kyb_document_select ON institution.kyb_document
    FOR SELECT TO authenticated
    USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON institution.webhook_delivery TO authenticated;
GRANT SELECT, INSERT ON institution.kyb_document TO authenticated;

-- ── Step 10: Updated current_member_ctx (reads new table names) ──────────────
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
    (m.is_primary_admin OR COALESCE(sg.slug,'') = 'institution_admin') AS is_admin,
    COALESCE(m.member_role, 'maker')                                   AS member_role,
    COALESCE(
      cg.module_permissions,
      sg.module_permissions,
      pg.module_permissions,
      '{}'::TEXT[]
    ) AS modules
  FROM institution.member m
  LEFT JOIN institution.group          cg ON cg.id = m.custom_group_id
  LEFT JOIN portal_admin.user_groups   pg ON pg.id = m.group_id         -- old column still exists
  LEFT JOIN admin.system_group         sg ON sg.id = m.system_group_id
  WHERE m.user_id = auth.uid()
    AND m.status  = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION institution.current_member_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.current_member_ctx() TO authenticated;

-- ── Step 11: Compat views so old table names keep working ─────────────────────
CREATE OR REPLACE VIEW institution.institutions
  WITH (security_invoker = on) AS SELECT * FROM institution.institution;
CREATE OR REPLACE VIEW institution.institution_members
  WITH (security_invoker = on) AS SELECT * FROM institution.member;
CREATE OR REPLACE VIEW institution.groups
  WITH (security_invoker = on) AS SELECT * FROM institution.group;
CREATE OR REPLACE VIEW institution.institution_product_config
  WITH (security_invoker = on) AS SELECT * FROM institution.product_config;
CREATE OR REPLACE VIEW institution.institution_api_keys
  WITH (security_invoker = on) AS SELECT * FROM institution.api_key;
CREATE OR REPLACE VIEW institution.institution_webhooks
  WITH (security_invoker = on) AS SELECT * FROM institution.webhook;

GRANT SELECT ON institution.institutions              TO authenticated;
GRANT SELECT ON institution.institution_members       TO authenticated;
GRANT SELECT ON institution.groups                    TO authenticated;
GRANT SELECT ON institution.institution_product_config TO authenticated;
GRANT SELECT ON institution.institution_api_keys      TO authenticated;
GRANT SELECT ON institution.institution_webhooks      TO authenticated;

-- ── Step 12: Update default member group trigger ──────────────────────────────
CREATE OR REPLACE FUNCTION institution.assign_default_member_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, admin, portal_admin AS $$
BEGIN
  IF NEW.system_group_id IS NULL AND NEW.group_id IS NULL THEN
    IF NEW.is_primary_admin THEN
      SELECT id INTO NEW.system_group_id FROM admin.system_group WHERE slug = 'institution_admin' LIMIT 1;
      IF NEW.system_group_id IS NULL THEN
        SELECT id INTO NEW.group_id FROM portal_admin.user_groups WHERE slug = 'institution_admin' LIMIT 1;
      END IF;
    ELSE
      SELECT id INTO NEW.system_group_id FROM admin.system_group WHERE slug = 'bank_officer' LIMIT 1;
      IF NEW.system_group_id IS NULL THEN
        SELECT id INTO NEW.group_id FROM portal_admin.user_groups WHERE slug = 'bank_officer' LIMIT 1;
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

-- Also keep old trigger on old table name if it still points somewhere
DROP TRIGGER IF EXISTS trg_assign_default_member_group ON institution.institution_members;

-- ── Step 13: Submit for approval shim ────────────────────────────────────────
-- Keep old signature working; governance.submit created in migration 06
CREATE OR REPLACE FUNCTION institution.submit_for_approval(
  p_action_category TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_payload         JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin AS $$
DECLARE
  v_ctx    RECORD;
  v_id     UUID;
  v_role   TEXT;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL THEN
    RAISE EXCEPTION 'Not an active institution member';
  END IF;
  v_role := v_ctx.member_role;

  -- Write to existing pending_actions until governance.action is ready
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'institution' AND table_name = 'pending_actions'
  ) THEN
    INSERT INTO institution.pending_actions
      (action_category, institution_id, maker_id, maker_role,
       resource_type, resource_id, payload)
    VALUES
      (p_action_category, v_ctx.institution_id, v_ctx.member_id, v_role,
       p_resource_type, p_resource_id, COALESCE(p_payload,'{}'))
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION institution.submit_for_approval FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.submit_for_approval TO authenticated;
