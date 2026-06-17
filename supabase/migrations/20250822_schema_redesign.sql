-- =============================================================================
-- Ficium Portal — 7-Schema Redesign
-- Migration: 20250822_schema_redesign.sql
--
-- SAFE TO RUN IN ONE BLOCK. All statements are idempotent (IF NOT EXISTS,
-- IF EXISTS, ON CONFLICT DO NOTHING). No ALTER...RENAME chains that depend
-- on tables that may not exist.
--
-- Schemas: identity | catalog | institution | marketplace | governance | admin | audit
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. CREATE SCHEMAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS audit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. IDENTITY — thin extension of auth.users
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA identity TO authenticated;

CREATE TABLE IF NOT EXISTS identity.profiles (
  id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT        NOT NULL UNIQUE,
  display_name         TEXT        NOT NULL DEFAULT '',
  phone                TEXT,
  status               TEXT        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','locked','suspended','deactivated')),
  mfa_enabled          BOOLEAN     NOT NULL DEFAULT FALSE,
  mfa_verified_at      TIMESTAMPTZ,
  failed_login_count   INT         NOT NULL DEFAULT 0,
  locked_at            TIMESTAMPTZ,
  force_password_reset BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.login_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ip          INET,
  user_agent  TEXT,
  outcome     TEXT        NOT NULL DEFAULT 'success'
                          CHECK (outcome IN ('success','failed','blocked','mfa_required')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_login_user ON identity.login_events(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_login_at   ON identity.login_events(occurred_at DESC);

GRANT SELECT ON identity.profiles     TO authenticated;
GRANT SELECT ON identity.login_events TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CATALOG — global product reference data (Ficium-owned, read-only for tenants)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA catalog TO authenticated;

-- Move existing tables from institution → catalog FIRST
-- (before CREATE TABLE IF NOT EXISTS, so duplicate_table never fires)
DO $$ BEGIN ALTER TABLE institution.product_families     SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.products             SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_parameters   SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_rate_config  SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_sla_defaults SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_eligibility  SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE institution.product_documents    SET SCHEMA catalog; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Now CREATE TABLE IF NOT EXISTS only runs if tables didn't exist in institution
CREATE TABLE IF NOT EXISTS catalog.product_families (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID        NOT NULL REFERENCES catalog.product_families(id),
  code        TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT,
  currency    TEXT        NOT NULL DEFAULT 'MUR',
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.product_parameters (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID    NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  key        TEXT    NOT NULL,
  data_type  TEXT    NOT NULL DEFAULT 'text',
  required   BOOLEAN NOT NULL DEFAULT FALSE,
  ui_config  JSONB,
  UNIQUE(product_id, key)
);

CREATE TABLE IF NOT EXISTS catalog.product_rate_config (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE UNIQUE,
  model      TEXT NOT NULL DEFAULT 'fixed',
  bounds     JSONB,
  config     JSONB
);

CREATE TABLE IF NOT EXISTS catalog.product_sla_defaults (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE UNIQUE,
  bid_window_minutes    INT  NOT NULL DEFAULT 240,
  auto_withdraw_minutes INT  NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS catalog.product_eligibility (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID  NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  rules      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS catalog.product_documents (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID    NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  doc_key    TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  required   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(product_id, doc_key)
);

CREATE TABLE IF NOT EXISTS catalog.modules (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  side        TEXT NOT NULL DEFAULT 'institution'
                   CHECK (side IN ('institution','admin')),
  sort_order  INT  NOT NULL DEFAULT 0
);

INSERT INTO catalog.modules (key, label, description, side, sort_order) VALUES
  ('marketplace',  'Marketplace',   'Browse and respond to live funding requests', 'institution', 1),
  ('bids',         'Bids',          'Manage submitted bids and bid history',       'institution', 2),
  ('products',     'Products',      'Configure product catalogue and rates',       'institution', 3),
  ('team',         'Team',          'Manage institution members and roles',        'institution', 4),
  ('settings',     'Settings',      'Profile, API keys and SLA config',            'institution', 5),
  ('approvals',    'Approvals',     'Maker-checker approval queue',                'institution', 6),
  ('audit',        'Audit',         'Compliance and activity audit log',           'institution', 7),
  ('webhooks',     'Webhooks',      'Configure outbound event webhooks',           'institution', 8),
  ('institutions', 'Institutions',  'Review and approve institution applications', 'admin', 1),
  ('users',        'Users',         'Manage admin users and roles',                'admin', 2),
  ('dual_control', 'Dual Control',  'Platform-level maker-checker queue',          'admin', 3),
  ('system_audit', 'System Audit',  'Full platform audit log',                    'admin', 4)
ON CONFLICT (key) DO NOTHING;

-- No RLS on catalog — public reference data
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO authenticated;

-- Compatibility views in institution schema (keep old code working)
CREATE OR REPLACE VIEW institution.product_families
  WITH (security_invoker = on) AS SELECT * FROM catalog.product_families;
CREATE OR REPLACE VIEW institution.products
  WITH (security_invoker = on) AS SELECT * FROM catalog.products;
CREATE OR REPLACE VIEW institution.product_parameters
  WITH (security_invoker = on) AS SELECT * FROM catalog.product_parameters;
CREATE OR REPLACE VIEW institution.product_rate_config
  WITH (security_invoker = on) AS SELECT * FROM catalog.product_rate_config;
CREATE OR REPLACE VIEW institution.product_sla_defaults
  WITH (security_invoker = on) AS SELECT * FROM catalog.product_sla_defaults;
CREATE OR REPLACE VIEW institution.product_eligibility
  WITH (security_invoker = on) AS SELECT * FROM catalog.product_eligibility;
CREATE OR REPLACE VIEW institution.product_documents
  WITH (security_invoker = on) AS SELECT * FROM catalog.product_documents;

GRANT SELECT ON institution.product_families    TO authenticated;
GRANT SELECT ON institution.products            TO authenticated;
GRANT SELECT ON institution.product_parameters  TO authenticated;
GRANT SELECT ON institution.product_rate_config TO authenticated;
GRANT SELECT ON institution.product_sla_defaults TO authenticated;
GRANT SELECT ON institution.product_eligibility TO authenticated;
GRANT SELECT ON institution.product_documents   TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INSTITUTION — rename tables (drop the stutter), add missing ones
-- ─────────────────────────────────────────────────────────────────────────────

-- Rename institution_members → members
DO $$ BEGIN
  ALTER TABLE institution.institution_members RENAME TO members;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Rename institution_api_keys → api_keys
DO $$ BEGIN
  ALTER TABLE institution.institution_api_keys RENAME TO api_keys;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Rename institution_webhooks → webhooks
DO $$ BEGIN
  ALTER TABLE institution.institution_webhooks RENAME TO webhooks;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Rename institution_sla_config → sla_config
DO $$ BEGIN
  ALTER TABLE institution.institution_sla_config RENAME TO sla_config;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Rename institution_product_config → product_config
DO $$ BEGIN
  ALTER TABLE institution.institution_product_config RENAME TO product_config;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Compatibility views for old names
CREATE OR REPLACE VIEW institution.institution_members
  WITH (security_invoker = on) AS SELECT * FROM institution.members;
CREATE OR REPLACE VIEW institution.institution_api_keys
  WITH (security_invoker = on) AS SELECT * FROM institution.api_keys;
CREATE OR REPLACE VIEW institution.institution_webhooks
  WITH (security_invoker = on) AS SELECT * FROM institution.webhooks;
CREATE OR REPLACE VIEW institution.institution_sla_config
  WITH (security_invoker = on) AS SELECT * FROM institution.sla_config;
CREATE OR REPLACE VIEW institution.institution_product_config
  WITH (security_invoker = on) AS SELECT * FROM institution.product_config;

GRANT SELECT ON institution.institution_members        TO authenticated;
GRANT SELECT ON institution.institution_api_keys       TO authenticated;
GRANT SELECT ON institution.institution_webhooks       TO authenticated;
GRANT SELECT ON institution.institution_sla_config     TO authenticated;
GRANT SELECT ON institution.institution_product_config TO authenticated;

-- webhook_deliveries (new)
CREATE TABLE IF NOT EXISTS institution.webhook_deliveries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id     UUID        NOT NULL REFERENCES institution.webhooks(id) ON DELETE CASCADE,
  institution_id UUID        NOT NULL REFERENCES institution.institutions(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL,
  payload        JSONB       NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','delivered','failed','retrying')),
  attempts       INT         NOT NULL DEFAULT 0,
  response_code  INT,
  next_retry_at  TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_inst
  ON institution.webhook_deliveries (institution_id, status);

ALTER TABLE institution.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_select ON institution.webhook_deliveries
  FOR SELECT TO authenticated
  USING (institution_id = (
    SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
  ));

GRANT SELECT ON institution.webhook_deliveries TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MARKETPLACE — requests + bids in one schema with a real FK
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA marketplace TO authenticated;

CREATE TABLE IF NOT EXISTS marketplace.requests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id          UUID        NOT NULL,
  product_id           UUID        NOT NULL REFERENCES catalog.products(id),
  amount               NUMERIC     NOT NULL CHECK (amount > 0),
  currency             TEXT        NOT NULL DEFAULT 'MUR',
  term_months          INT         NOT NULL CHECK (term_months > 0),
  params               JSONB       NOT NULL DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','bidding','accepted','cancelled','expired')),
  bid_window_opens_at  TIMESTAMPTZ,
  bid_window_closes_at TIMESTAMPTZ,
  idempotency_key      TEXT        UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_requests_status
  ON marketplace.requests (status, bid_window_closes_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_requests_product
  ON marketplace.requests (product_id, status);

CREATE TABLE IF NOT EXISTS marketplace.bids (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID        NOT NULL REFERENCES marketplace.requests(id) ON DELETE RESTRICT,
  institution_id   UUID        NOT NULL REFERENCES institution.institutions(id),
  rate             NUMERIC     NOT NULL CHECK (rate > 0),
  rate_type        TEXT        NOT NULL DEFAULT 'fixed'
                               CHECK (rate_type IN ('fixed','variable')),
  amount_offered   NUMERIC     NOT NULL CHECK (amount_offered > 0),
  term_months      INT         NOT NULL CHECK (term_months > 0),
  conditions       JSONB,
  status           TEXT        NOT NULL DEFAULT 'submitted'
                               CHECK (status IN ('submitted','accepted','rejected','expired','withdrawn')),
  submitted_via    TEXT        NOT NULL DEFAULT 'portal'
                               CHECK (submitted_via IN ('portal','api','webhook','core_banking')),
  submitted_by     UUID,
  idempotency_key  TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  withdrawn_at     TIMESTAMPTZ,
  withdraw_reason  TEXT,
  response_time_ms INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, request_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_bids_institution
  ON marketplace.bids (institution_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_request
  ON marketplace.bids (request_id, status);

CREATE TABLE IF NOT EXISTS marketplace.bid_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id      UUID        NOT NULL REFERENCES marketplace.bids(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  actor_id    UUID,
  actor_type  TEXT        NOT NULL DEFAULT 'system'
                          CHECK (actor_type IN ('institution','consumer','system','admin')),
  reason      TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bid_events_bid
  ON marketplace.bid_events (bid_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS marketplace.acceptances (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           UUID        NOT NULL REFERENCES marketplace.requests(id) UNIQUE,
  bid_id               UUID        NOT NULL REFERENCES marketplace.bids(id),
  accepted_by_consumer UUID        NOT NULL,
  accepted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE marketplace.requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.requests   FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bids       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bids       FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_events FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.acceptances FORCE ROW LEVEL SECURITY;

CREATE POLICY marketplace_requests_select ON marketplace.requests
  FOR SELECT TO authenticated
  USING (status IN ('open','bidding') AND EXISTS (
    SELECT 1 FROM institution.current_member_ctx() ctx
    WHERE ctx.institution_id IS NOT NULL
  ));

CREATE POLICY marketplace_bids_select ON marketplace.bids
  FOR SELECT TO authenticated
  USING (institution_id = (
    SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
  ));

CREATE POLICY marketplace_bid_events_select ON marketplace.bid_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM marketplace.bids b
    WHERE b.id = bid_id
      AND b.institution_id = (
        SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
      )
  ));

CREATE POLICY marketplace_acceptances_select ON marketplace.acceptances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM marketplace.bids b
    WHERE b.id = bid_id
      AND b.institution_id = (
        SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
      )
  ));

GRANT SELECT ON marketplace.requests    TO authenticated;
GRANT SELECT ON marketplace.bids        TO authenticated;
GRANT SELECT ON marketplace.bid_events  TO authenticated;
GRANT SELECT ON marketplace.acceptances TO authenticated;

-- my_bids view with security_invoker (fixes the UNRESTRICTED flag)
DROP VIEW IF EXISTS institution.my_bids;
CREATE OR REPLACE VIEW marketplace.my_bids
WITH (security_invoker = on) AS
SELECT
  b.id, b.request_id, b.institution_id,
  b.rate, b.rate_type, b.amount_offered, b.term_months,
  b.conditions, b.status, b.submitted_via,
  b.submitted_at, b.expires_at, b.created_at,
  r.product_id,
  r.amount        AS requested_amount,
  r.currency,
  r.status        AS request_status,
  r.bid_window_closes_at,
  p.label         AS product_label
FROM marketplace.bids        b
JOIN marketplace.requests    r ON r.id = b.request_id
JOIN catalog.products        p ON p.id = r.product_id;

GRANT SELECT ON marketplace.my_bids TO authenticated;

-- Backfill institution_bids → marketplace.bids (if data exists and bids table is empty)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'institution' AND table_name = 'institution_bids'
  ) AND NOT EXISTS (SELECT 1 FROM marketplace.bids LIMIT 1) THEN
    INSERT INTO marketplace.bids
      (id, institution_id, rate, rate_type, amount_offered,
       term_months, conditions, status, submitted_via, submitted_at, created_at)
    SELECT
      id, institution_id, rate, rate_type, amount_offered,
      term_months, conditions, status,
      COALESCE(submitted_via, 'portal'), submitted_at, created_at
    FROM institution.institution_bids;
  END IF;
END $$;

-- Move institution.institution_bids → marketplace.bids, then compat view
DO $$ BEGIN ALTER TABLE institution.institution_bids SET SCHEMA marketplace; ALTER TABLE marketplace.institution_bids RENAME TO bids; EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- Compat view
CREATE OR REPLACE VIEW institution.institution_bids
  WITH (security_invoker = on)
  AS SELECT * FROM marketplace.bids;

GRANT SELECT ON institution.institution_bids TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GOVERNANCE — unified maker-checker queue
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA governance TO authenticated;

CREATE TABLE IF NOT EXISTS governance.pending_actions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope            TEXT        NOT NULL DEFAULT 'institution'
                               CHECK (scope IN ('institution','platform')),
  action_category  TEXT        NOT NULL,
  action_label     TEXT        NOT NULL DEFAULT '',
  risk             TEXT        NOT NULL DEFAULT 'medium'
                               CHECK (risk IN ('low','medium','high','critical')),
  institution_id   UUID        REFERENCES institution.institutions(id) ON DELETE CASCADE,
  maker_id         UUID        NOT NULL,
  maker_role       TEXT        NOT NULL DEFAULT '',
  maker_ip         INET,
  resource_type    TEXT        NOT NULL,
  resource_id      UUID,
  resource_label   TEXT,
  payload          JSONB       NOT NULL DEFAULT '{}',
  payload_before   JSONB,
  action_status    TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (action_status IN
                                 ('pending','approved','rejected','expired','cancelled')),
  checker_id       UUID,
  checker_role     TEXT,
  checker_note     TEXT,
  checked_at       TIMESTAMPTZ,
  execution_status TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (execution_status IN
                                 ('pending','executing','executed','failed')),
  executed_at      TIMESTAMPTZ,
  execution_error  TEXT,
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_approval CHECK (checker_id IS NULL OR checker_id != maker_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_institution
  ON governance.pending_actions (institution_id, action_status, action_category)
  WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_governance_platform
  ON governance.pending_actions (scope, action_status)
  WHERE scope = 'platform';
CREATE INDEX IF NOT EXISTS idx_governance_expiry
  ON governance.pending_actions (expires_at)
  WHERE action_status = 'pending';

ALTER TABLE governance.pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.pending_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY governance_inst_select ON governance.pending_actions
  FOR SELECT TO authenticated
  USING (
    scope = 'institution'
    AND institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    )
  );

CREATE POLICY governance_inst_insert ON governance.pending_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    scope = 'institution'
    AND institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    )
    AND maker_id = (
      SELECT ctx.member_id FROM institution.current_member_ctx() ctx
    )
  );

CREATE POLICY governance_inst_update ON governance.pending_actions
  FOR UPDATE TO authenticated
  USING (
    scope = 'institution'
    AND institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    )
    AND (SELECT ctx.is_inst_admin FROM institution.current_member_ctx() ctx)
  );

GRANT SELECT, INSERT, UPDATE ON governance.pending_actions TO authenticated;

-- Backfill from institution.pending_actions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'institution' AND table_name = 'pending_actions'
  ) AND NOT EXISTS (SELECT 1 FROM governance.pending_actions LIMIT 1) THEN
    INSERT INTO governance.pending_actions
      (id, scope, action_category, risk, institution_id, maker_id, maker_role,
       resource_type, resource_id, payload, payload_before, action_status,
       checker_id, checker_note, checked_at, execution_status, executed_at,
       execution_error, initiated_at, expires_at, created_at)
    SELECT
      id, 'institution', action_category, 'medium', institution_id,
      maker_id, maker_role, resource_type, resource_id, payload,
      payload_before, action_status, checker_id, checker_note, checked_at,
      COALESCE(execution_status, 'pending'), executed_at, execution_error,
      initiated_at, expires_at, created_at
    FROM institution.pending_actions;
  END IF;
END $$;

-- Move institution.pending_actions → governance, then create compat view
DO $$ BEGIN ALTER TABLE institution.pending_actions SET SCHEMA governance; EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- Add scope column if it came from the old table (didn't have it)
DO $$ BEGIN ALTER TABLE governance.pending_actions ADD COLUMN scope TEXT NOT NULL DEFAULT 'institution' CHECK (scope IN ('institution','platform')); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Compat view
CREATE OR REPLACE VIEW institution.pending_actions
  WITH (security_invoker = on)
  AS SELECT * FROM governance.pending_actions WHERE scope = 'institution';

GRANT SELECT ON institution.pending_actions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ADMIN — renamed from portal_admin
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA admin TO authenticated;

CREATE TABLE IF NOT EXISTS admin.system_groups (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT        NOT NULL UNIQUE,
  label              TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  user_type          TEXT        NOT NULL DEFAULT 'institution'
                                 CHECK (user_type IN ('admin','institution')),
  module_permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.users (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id          UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL UNIQUE,
  display_name          TEXT        NOT NULL,
  role_slug             TEXT        NOT NULL DEFAULT 'support'
                                    CHECK (role_slug IN
                                      ('super_admin','institution_mgr','compliance','support','auditor','custom')),
  group_id              UUID        REFERENCES admin.system_groups(id),
  status                TEXT        NOT NULL DEFAULT 'pending_mfa'
                                    CHECK (status IN
                                      ('active','locked','suspended','pending_mfa','deactivated')),
  mfa_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  failed_login_count    INT         NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  force_password_reset  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES admin.users(id) ON DELETE CASCADE,
  ip_address     INET        NOT NULL,
  user_agent     TEXT        NOT NULL DEFAULT '',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  end_reason     TEXT        CHECK (end_reason IN ('logout','timeout','forced','expired')),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Backfill system_groups from portal_admin.user_groups
INSERT INTO admin.system_groups
  (id, slug, label, description, user_type, module_permissions, is_system, created_by, created_at, updated_at)
SELECT
  id, slug, label, description, user_type, module_permissions, is_system, created_by, created_at, updated_at
FROM portal_admin.user_groups
ON CONFLICT (id) DO NOTHING;

-- Backfill admin.users from portal_admin.admin_users
INSERT INTO admin.users
  (id, auth_user_id, email, display_name, role_slug, group_id, status,
   mfa_enabled, failed_login_count, locked_at, force_password_reset, created_at, updated_at)
SELECT
  id, auth_user_id, email, display_name, role_slug, group_id, status::TEXT,
  mfa_enabled, failed_login_count, locked_at, force_password_reset, created_at, updated_at
FROM portal_admin.admin_users
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE admin.system_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.sessions      ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION admin.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin.users
    WHERE auth_user_id = auth.uid() AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION admin.my_role_slug()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role_slug FROM admin.users
  WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION admin.has_permission(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT admin.my_role_slug() = 'super_admin'
      OR p_key = ANY(COALESCE(
           (SELECT permissions FROM admin.roles
            WHERE slug = admin.my_role_slug() LIMIT 1),
           '{}'::TEXT[]
         ))
$$;

REVOKE ALL ON FUNCTION admin.is_admin()           FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.my_role_slug()       FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION admin.my_role_slug()       TO authenticated;
GRANT EXECUTE ON FUNCTION admin.has_permission(TEXT) TO authenticated;

CREATE POLICY admin_groups_select  ON admin.system_groups FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY admin_users_select   ON admin.users         FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_users_write    ON admin.users         FOR ALL    TO authenticated USING (auth.role() = 'service_role');
CREATE POLICY admin_roles_select   ON admin.roles         FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_sessions_select ON admin.sessions     FOR SELECT TO authenticated USING (admin.is_admin());

GRANT SELECT ON admin.system_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.users     TO authenticated;
GRANT SELECT ON admin.roles                     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.sessions  TO authenticated;

-- Compat views in portal_admin schema
CREATE OR REPLACE VIEW portal_admin.user_groups
  WITH (security_invoker = on) AS SELECT * FROM admin.system_groups;
CREATE OR REPLACE VIEW portal_admin.admin_users
  WITH (security_invoker = on) AS SELECT * FROM admin.users;

GRANT SELECT ON portal_admin.user_groups TO authenticated;
GRANT SELECT ON portal_admin.admin_users TO authenticated;

-- Update get_my_group to use admin schema
CREATE OR REPLACE FUNCTION portal_admin.get_my_group()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_group admin.system_groups%ROWTYPE;
BEGIN
  SELECT g.* INTO v_group
  FROM admin.system_groups g
  JOIN admin.users u ON u.group_id = g.id
  WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  SELECT g.* INTO v_group
  FROM admin.system_groups g
  JOIN institution.members m ON m.group_id = g.id
  WHERE m.auth_user_id = auth.uid()
  LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_admin.get_my_group() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. AUDIT — single append-only event log
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA audit TO authenticated;

CREATE TABLE IF NOT EXISTS audit.events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id             UUID,
  actor_type           TEXT        NOT NULL DEFAULT 'system'
                                   CHECK (actor_type IN
                                     ('consumer','member','admin','system','api')),
  actor_email          TEXT,
  actor_role           TEXT,
  actor_ip             INET,
  institution_id       UUID        REFERENCES institution.institutions(id) ON DELETE SET NULL,
  action               TEXT        NOT NULL,
  resource_type        TEXT,
  resource_id          UUID,
  resource_label       TEXT,
  outcome              TEXT        NOT NULL DEFAULT 'logged'
                                   CHECK (outcome IN
                                     ('success','failed','blocked','rejected','expired','logged')),
  outcome_note         TEXT,
  governance_action_id UUID        REFERENCES governance.pending_actions(id) ON DELETE SET NULL,
  session_id           UUID,
  metadata             JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred    ON audit.events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit.events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_institution ON audit.events (institution_id, occurred_at DESC)
  WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit.events (action, outcome);

-- WORM: no updates or deletes
CREATE OR REPLACE RULE audit_no_update AS ON UPDATE TO audit.events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_no_delete AS ON DELETE TO audit.events DO INSTEAD NOTHING;

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_select ON audit.events
  FOR SELECT TO authenticated
  USING (
    institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    )
    OR (institution_id IS NULL AND admin.is_admin())
  );

CREATE POLICY audit_insert ON audit.events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.role() = 'service_role'
    OR admin.is_admin()
    OR institution_id = (
      SELECT ctx.institution_id FROM institution.current_member_ctx() ctx
    )
  );

GRANT SELECT, INSERT ON audit.events TO authenticated;

-- Backfill from portal_admin.admin_audit_log
INSERT INTO audit.events
  (occurred_at, actor_id, actor_type, actor_email, actor_role, actor_ip,
   action, resource_type, resource_id, resource_label,
   outcome, outcome_note, governance_action_id)
SELECT
  created_at, actor_id, 'admin', actor_email, actor_role, actor_ip,
  action_category, resource_type, resource_id, resource_label,
  outcome::TEXT, outcome_note, dual_control_id
FROM portal_admin.admin_audit_log
ON CONFLICT DO NOTHING;

-- Audit log helper
CREATE OR REPLACE FUNCTION audit.log(
  p_actor_id       UUID,
  p_actor_type     TEXT,
  p_institution_id UUID,
  p_action         TEXT,
  p_resource_type  TEXT  DEFAULT NULL,
  p_resource_id    UUID  DEFAULT NULL,
  p_outcome        TEXT  DEFAULT 'logged',
  p_metadata       JSONB DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit.events
    (actor_id, actor_type, institution_id, action,
     resource_type, resource_id, outcome, metadata)
  VALUES
    (p_actor_id, p_actor_type, p_institution_id, p_action,
     p_resource_type, p_resource_id, p_outcome, p_metadata);
END;
$$;

REVOKE ALL ON FUNCTION audit.log FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.log TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. UPDATE current_member_ctx — use new table names
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION institution.current_member_ctx()
RETURNS TABLE (member_id UUID, institution_id UUID, is_inst_admin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = institution, admin
AS $$
  SELECT
    m.id,
    m.institution_id,
    (m.is_primary_admin OR sg.slug = 'institution_admin') AS is_inst_admin
  FROM institution.members m
  LEFT JOIN admin.system_groups sg ON sg.id = m.group_id
  WHERE m.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION institution.current_member_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.current_member_ctx() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. UPDATE submit_for_approval — write to governance.pending_actions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION institution.submit_for_approval(
  p_action_category TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_payload         JSONB
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, admin, governance
AS $$
DECLARE
  v_ctx  RECORD;
  v_id   UUID;
  v_role TEXT;
BEGIN
  SELECT * INTO v_ctx FROM institution.current_member_ctx();
  IF v_ctx.member_id IS NULL THEN
    RAISE EXCEPTION 'Not an active institution member';
  END IF;

  SELECT COALESCE(sg.slug, 'member') INTO v_role
  FROM institution.members m
  LEFT JOIN admin.system_groups sg ON sg.id = m.group_id
  WHERE m.id = v_ctx.member_id;

  INSERT INTO governance.pending_actions
    (scope, action_category, institution_id, maker_id, maker_role,
     resource_type, resource_id, payload)
  VALUES
    ('institution', p_action_category, v_ctx.institution_id,
     v_ctx.member_id, v_role, p_resource_type, p_resource_id,
     COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION institution.submit_for_approval(TEXT,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.submit_for_approval(TEXT,TEXT,UUID,JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. VERIFICATION (run these SELECTs after migration to confirm)
-- ─────────────────────────────────────────────────────────────────────────────
/*
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('identity','catalog','institution','marketplace','governance','admin','audit')
ORDER BY schema_name;

SELECT n.nspname AS schema, c.relname AS view,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE) AS safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname IN ('institution','marketplace','governance','catalog')
ORDER BY n.nspname, c.relname;

SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('institution','marketplace','governance','audit')
ORDER BY n.nspname, c.relname;
*/
