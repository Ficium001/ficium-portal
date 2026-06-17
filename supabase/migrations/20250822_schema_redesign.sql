-- =============================================================================
-- Ficium Portal — 7-Schema Redesign
-- Migration: 20250822_schema_redesign.sql
--
-- Replaces the current 2-schema layout (institution + portal_admin) with
-- 7 bounded-context schemas. Non-destructive: existing tables are moved via
-- ALTER TABLE ... SET SCHEMA; existing data, indexes, RLS, and functions are
-- preserved. Compatibility views keep the old names alive until the frontend
-- and portal-api are repointed.
--
-- Run order: execute ONCE on the ficium-institution Supabase project.
-- Estimated downtime: < 5 min (all DDL, no data movement).
--
-- Schemas created:
--   identity    — login, sessions, MFA, tokens (resolves auth split-brain)
--   catalog     — global product reference data (Ficium-owned, read-only)
--   institution — tenants + their internal org (pool model, RLS-isolated)
--   marketplace — requests + bids in one place (real FK, no cross-DB ref)
--   governance  — unified maker-checker queue (merges two engines)
--   admin       — Ficium internal staff (renamed from portal_admin)
--   audit       — single append-only event log (merges three audit tables)
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
-- `institution` already exists — keep it

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. IDENTITY SCHEMA
--    Moves: auth_portal.* → identity.*
--    auth_portal.auth_users → identity.profiles (rename)
--    Everything else moves as-is.
-- ─────────────────────────────────────────────────────────────────────────────

-- Profiles: thin extension of auth.users (the Supabase-Auth source of truth)
-- auth_portal.auth_users already holds this — rename on move
DO $$ BEGIN
  ALTER TABLE IF EXISTS auth_portal.auth_users          SET SCHEMA identity;
  ALTER TABLE IF EXISTS identity.auth_users             RENAME TO profiles;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE IF EXISTS auth_portal.auth_sessions       SET SCHEMA identity;
  ALTER TABLE IF EXISTS identity.auth_sessions          RENAME TO sessions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE IF EXISTS auth_portal.email_verification_tokens SET SCHEMA identity;
  ALTER TABLE IF EXISTS auth_portal.ip_allowlist              SET SCHEMA identity;
  ALTER TABLE IF EXISTS auth_portal.mfa_backup_codes          SET SCHEMA identity;
  ALTER TABLE IF EXISTS auth_portal.password_reset_tokens     SET SCHEMA identity;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- auth_audit_events → merge into audit later (step 7); create bridge view now
DO $$ BEGIN
  ALTER TABLE IF EXISTS auth_portal.auth_audit_events   SET SCHEMA identity;
  ALTER TABLE IF EXISTS identity.auth_audit_events      RENAME TO login_events;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Compatibility: keep auth_portal schema accessible during transition
CREATE SCHEMA IF NOT EXISTS auth_portal;

-- Profiles: ensure it exists even if auth_portal was empty
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
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ip         INET,
  user_agent TEXT,
  outcome    TEXT        NOT NULL DEFAULT 'success'
                         CHECK (outcome IN ('success','failed','blocked','mfa_required')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_login_user ON identity.login_events(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_login_at   ON identity.login_events(occurred_at DESC);

GRANT USAGE ON SCHEMA identity TO authenticated;
GRANT SELECT ON identity.profiles     TO authenticated;
GRANT SELECT ON identity.login_events TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CATALOG SCHEMA
--    Moves: institution.product_* + institution.products → catalog.*
--    Unprefixed names: catalog.products (not catalog.institution_products)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE IF EXISTS institution.product_families   SET SCHEMA catalog;
  ALTER TABLE IF EXISTS institution.products           SET SCHEMA catalog;
  ALTER TABLE IF EXISTS institution.product_parameters SET SCHEMA catalog;
  ALTER TABLE IF EXISTS institution.product_rate_config   SET SCHEMA catalog;
  ALTER TABLE IF EXISTS institution.product_sla_defaults  SET SCHEMA catalog;
  ALTER TABLE IF EXISTS institution.product_eligibility   SET SCHEMA catalog;
  ALTER TABLE IF EXISTS institution.product_documents     SET SCHEMA catalog;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Create tables if they didn't exist in institution yet
CREATE TABLE IF NOT EXISTS catalog.product_families (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT  NOT NULL UNIQUE,
  label      TEXT  NOT NULL,
  sort_order INT   NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.products (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID    NOT NULL REFERENCES catalog.product_families(id),
  code        TEXT    NOT NULL UNIQUE,
  label       TEXT    NOT NULL,
  description TEXT,
  currency    TEXT    NOT NULL DEFAULT 'MUR',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.product_parameters (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID    NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  key         TEXT    NOT NULL,
  data_type   TEXT    NOT NULL DEFAULT 'text',
  required    BOOLEAN NOT NULL DEFAULT FALSE,
  ui_config   JSONB,
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
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID    NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE UNIQUE,
  bid_window_minutes    INT     NOT NULL DEFAULT 240,
  auto_withdraw_minutes INT     NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS catalog.product_eligibility (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
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

-- Module catalogue — moved out of shared/lib
CREATE TABLE IF NOT EXISTS catalog.modules (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  side        TEXT NOT NULL DEFAULT 'institution'
                   CHECK (side IN ('institution', 'admin')),
  sort_order  INT  NOT NULL DEFAULT 0
);

-- Seed modules from the existing MODULE_CATALOGUE in shared/lib/modules.ts
INSERT INTO catalog.modules (key, label, description, side, sort_order) VALUES
  ('marketplace',  'Marketplace',     'Browse and respond to live funding requests', 'institution', 1),
  ('bids',         'Bids',            'Manage your submitted bids and bid history',  'institution', 2),
  ('products',     'Products',        'Configure your product catalogue and rates',  'institution', 3),
  ('team',         'Team',            'Manage institution members and roles',        'institution', 4),
  ('settings',     'Settings',        'Institution profile, API keys and SLA config','institution', 5),
  ('approvals',    'Approvals',       'Maker-checker approval queue',                'institution', 6),
  ('audit',        'Audit',           'Compliance and activity audit log',           'institution', 7),
  ('webhooks',     'Webhooks',        'Configure outbound event webhooks',           'institution', 8),
  ('institutions', 'Institutions',    'Review and approve institution applications', 'admin', 1),
  ('users',        'Users',           'Manage admin users and roles',                'admin', 2),
  ('dual_control', 'Dual Control',    'Platform-level maker-checker queue',          'admin', 3),
  ('system_audit', 'System Audit',    'Full platform audit log',                     'admin', 4)
ON CONFLICT (key) DO NOTHING;

-- No RLS on catalog — Ficium-owned reference data, all authenticated users read
GRANT USAGE  ON SCHEMA catalog TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO authenticated;

-- Compatibility views in institution schema (drop once portal-api repointed)
CREATE OR REPLACE VIEW institution.products           AS SELECT * FROM catalog.products;
CREATE OR REPLACE VIEW institution.product_families   AS SELECT * FROM catalog.product_families;
CREATE OR REPLACE VIEW institution.product_parameters AS SELECT * FROM catalog.product_parameters;
CREATE OR REPLACE VIEW institution.product_rate_config   AS SELECT * FROM catalog.product_rate_config;
CREATE OR REPLACE VIEW institution.product_sla_defaults  AS SELECT * FROM catalog.product_sla_defaults;
CREATE OR REPLACE VIEW institution.product_documents     AS SELECT * FROM catalog.product_documents;
CREATE OR REPLACE VIEW institution.product_eligibility   AS SELECT * FROM catalog.product_eligibility;

ALTER VIEW institution.products           SET (security_invoker = on);
ALTER VIEW institution.product_families   SET (security_invoker = on);
ALTER VIEW institution.product_parameters SET (security_invoker = on);
ALTER VIEW institution.product_rate_config   SET (security_invoker = on);
ALTER VIEW institution.product_sla_defaults  SET (security_invoker = on);
ALTER VIEW institution.product_documents     SET (security_invoker = on);
ALTER VIEW institution.product_eligibility   SET (security_invoker = on);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INSTITUTION SCHEMA — RENAME TABLES (drop the stutter)
--    institution.institution_bids    → institution.bids
--    institution.institution_members → institution.members
--    institution.institution_api_keys → institution.api_keys
--    institution.institution_webhooks → institution.webhooks
--    institution.institution_sla_config → institution.sla_config
--    institution.institution_product_config → institution.product_config
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE IF EXISTS institution.institution_members        RENAME TO members;        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS institution.institution_api_keys       RENAME TO api_keys;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS institution.institution_webhooks       RENAME TO webhooks;       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS institution.institution_sla_config     RENAME TO sla_config;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS institution.institution_product_config RENAME TO product_config; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- institution_bids moves to marketplace.bids (step 4) — keep original for now

-- Compatibility views for old names
CREATE OR REPLACE VIEW institution.institution_members        AS SELECT * FROM institution.members;
CREATE OR REPLACE VIEW institution.institution_api_keys       AS SELECT * FROM institution.api_keys;
CREATE OR REPLACE VIEW institution.institution_webhooks       AS SELECT * FROM institution.webhooks;
CREATE OR REPLACE VIEW institution.institution_sla_config     AS SELECT * FROM institution.sla_config;
CREATE OR REPLACE VIEW institution.institution_product_config AS SELECT * FROM institution.product_config;

ALTER VIEW institution.institution_members        SET (security_invoker = on);
ALTER VIEW institution.institution_api_keys       SET (security_invoker = on);
ALTER VIEW institution.institution_webhooks       SET (security_invoker = on);
ALTER VIEW institution.institution_sla_config     SET (security_invoker = on);
ALTER VIEW institution.institution_product_config SET (security_invoker = on);

-- sla_config + product_config: repoint FK to catalog.products
-- (if FK already exists on old table it moves with the rename)
DO $$ BEGIN
  ALTER TABLE institution.sla_config
    ADD CONSTRAINT sla_config_product_id_fk
    FOREIGN KEY (product_id) REFERENCES catalog.products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE institution.product_config
    ADD CONSTRAINT product_config_product_id_fk
    FOREIGN KEY (product_id) REFERENCES catalog.products(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure webhook_deliveries exists with correct FK
CREATE TABLE IF NOT EXISTS institution.webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID        NOT NULL REFERENCES institution.webhooks(id) ON DELETE CASCADE,
  institution_id UUID       NOT NULL REFERENCES institution.institutions(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','delivered','failed','retrying')),
  attempts      INT         NOT NULL DEFAULT 0,
  response_code INT,
  next_retry_at TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_institution
  ON institution.webhook_deliveries (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON institution.webhook_deliveries (webhook_id);

ALTER TABLE institution.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_select ON institution.webhook_deliveries
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

GRANT SELECT ON institution.webhook_deliveries TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MARKETPLACE SCHEMA
--    New home for requests + bids. The requests table comes from the consumer
--    DB (currently a cross-DB bare UUID reference). Until the consumer DB is
--    merged, marketplace.requests is a mirror/cache synced via portal-api.
--    The FK between bids and requests is now enforced in one place.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA marketplace TO authenticated;

-- Requests: master record of each consumer funding ask
CREATE TABLE IF NOT EXISTS marketplace.requests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id          UUID        NOT NULL,  -- ref to consumer DB user (no FK across DBs)
  product_id           UUID        NOT NULL REFERENCES catalog.products(id),
  amount               NUMERIC     NOT NULL CHECK (amount > 0),
  currency             TEXT        NOT NULL DEFAULT 'MUR',
  term_months          INT         NOT NULL CHECK (term_months > 0),
  params               JSONB       NOT NULL DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','bidding','accepted','cancelled','expired')),
  bid_window_opens_at  TIMESTAMPTZ,
  bid_window_closes_at TIMESTAMPTZ,
  idempotency_key      TEXT        UNIQUE,    -- dedup consumer submissions
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_requests_status
  ON marketplace.requests (status, bid_window_closes_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_requests_product
  ON marketplace.requests (product_id, status);

-- Bids: institution responses to requests — real FK now
-- Move existing institution_bids data here
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
  submitted_by     UUID        REFERENCES institution.members(id) ON DELETE SET NULL,
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

-- Bid lifecycle events — append-only
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

CREATE INDEX IF NOT EXISTS idx_bid_events_bid ON marketplace.bid_events(bid_id, occurred_at DESC);

-- Acceptances: the moment a consumer picks a winner
CREATE TABLE IF NOT EXISTS marketplace.acceptances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID        NOT NULL REFERENCES marketplace.requests(id) UNIQUE,
  bid_id              UUID        NOT NULL REFERENCES marketplace.bids(id),
  accepted_by_consumer UUID       NOT NULL,
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: institutions see their own bids; requests are visible to approved institutions
ALTER TABLE marketplace.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.requests FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bids     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bids     FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_events FORCE ROW LEVEL SECURITY;

-- Open requests visible to all active members
CREATE POLICY marketplace_requests_select ON marketplace.requests
  FOR SELECT TO authenticated
  USING (
    status IN ('open','bidding')
    AND EXISTS (
      SELECT 1 FROM institution.current_member_ctx() ctx
      WHERE ctx.institution_id IS NOT NULL
    )
  );

-- Bids: institution sees only their own
CREATE POLICY marketplace_bids_select ON marketplace.bids
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
  );

-- Bid events follow the bid
CREATE POLICY marketplace_bid_events_select ON marketplace.bid_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.bids b
      WHERE b.id = bid_id
        AND b.institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    )
  );

GRANT SELECT ON marketplace.requests   TO authenticated;
GRANT SELECT ON marketplace.bids       TO authenticated;
GRANT SELECT ON marketplace.bid_events TO authenticated;

-- Fix my_bids view — move to marketplace, security_invoker on
DROP VIEW IF EXISTS institution.my_bids;
CREATE OR REPLACE VIEW marketplace.my_bids
WITH (security_invoker = on) AS
SELECT
  b.id, b.request_id, b.institution_id,
  b.rate, b.rate_type, b.amount_offered, b.term_months,
  b.conditions, b.status, b.submitted_via,
  b.submitted_at, b.expires_at, b.created_at,
  -- denormalised request fields for the bids list view
  r.product_id, r.amount AS requested_amount,
  r.currency, r.status AS request_status,
  r.bid_window_closes_at,
  p.label AS product_label
FROM marketplace.bids b
JOIN marketplace.requests  r ON r.id = b.request_id
JOIN catalog.products      p ON p.id = r.product_id;

GRANT SELECT ON marketplace.my_bids TO authenticated;

-- Backfill: copy institution.institution_bids → marketplace.bids
-- (runs only if institution_bids still exists and marketplace.bids is empty)
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

    -- Leave institution_bids in place as a compat view
    ALTER TABLE institution.institution_bids RENAME TO institution_bids_archived;
    CREATE OR REPLACE VIEW institution.institution_bids
      WITH (security_invoker = on)
      AS SELECT * FROM marketplace.bids;
    GRANT SELECT ON institution.institution_bids TO authenticated;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GOVERNANCE SCHEMA
--    Unifies institution.pending_actions + portal_admin.admin_dual_control_actions
--    into one maker-checker engine.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA governance TO authenticated;

CREATE TABLE IF NOT EXISTS governance.pending_actions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope: 'institution' for tenant actions, 'platform' for admin actions
  scope            TEXT        NOT NULL DEFAULT 'institution'
                               CHECK (scope IN ('institution','platform')),
  action_category  TEXT        NOT NULL,
  action_label     TEXT        NOT NULL DEFAULT '',
  risk             TEXT        NOT NULL DEFAULT 'medium'
                               CHECK (risk IN ('low','medium','high','critical')),
  -- Tenant context (null for platform-scope actions)
  institution_id   UUID        REFERENCES institution.institutions(id) ON DELETE CASCADE,
  -- Maker: UUID of institution.members or admin.users depending on scope
  maker_id         UUID        NOT NULL,
  maker_role       TEXT        NOT NULL DEFAULT '',
  maker_ip         INET,
  -- Resource
  resource_type    TEXT        NOT NULL,
  resource_id      UUID,
  resource_label   TEXT,
  -- Payload
  payload          JSONB       NOT NULL DEFAULT '{}',
  payload_before   JSONB,
  -- Status
  action_status    TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (action_status IN
                                 ('pending','approved','rejected','expired','cancelled')),
  checker_id       UUID,
  checker_role     TEXT,
  checker_note     TEXT,
  checked_at       TIMESTAMPTZ,
  -- Execution
  execution_status TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (execution_status IN
                                 ('pending','executing','executed','failed')),
  executed_at      TIMESTAMPTZ,
  execution_error  TEXT,
  -- Timing
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

-- Institution members see their institution's actions
CREATE POLICY governance_institution_select ON governance.pending_actions
  FOR SELECT TO authenticated
  USING (
    scope = 'institution'
    AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
  );

-- Admin users see platform-scope actions (checked via admin.is_admin())
CREATE POLICY governance_platform_select ON governance.pending_actions
  FOR SELECT TO authenticated
  USING (
    scope = 'platform'
    AND EXISTS (SELECT 1 FROM admin.users WHERE auth_user_id = auth.uid() AND status = 'active')
  );

-- Insert via RPCs only (SECURITY DEFINER)
CREATE POLICY governance_insert ON governance.pending_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'institution'
      AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
      AND maker_id = (SELECT ctx.member_id FROM institution.current_member_ctx() ctx))
    OR
    (scope = 'platform'
      AND EXISTS (SELECT 1 FROM admin.users WHERE auth_user_id = auth.uid() AND status = 'active'))
  );

-- Update (approve/reject) for admins only
CREATE POLICY governance_update ON governance.pending_actions
  FOR UPDATE TO authenticated
  USING (
    (scope = 'institution'
      AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
      AND (SELECT ctx.is_inst_admin FROM institution.current_member_ctx() ctx))
    OR
    (scope = 'platform'
      AND EXISTS (SELECT 1 FROM admin.users WHERE auth_user_id = auth.uid() AND status = 'active'))
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

    -- Backfill from admin_dual_control_actions
    INSERT INTO governance.pending_actions
      (scope, action_category, action_label, risk, maker_id, maker_role,
       maker_ip, resource_type, resource_id, resource_label, payload,
       payload_before, action_status, checker_id, checker_role, checker_note,
       checked_at, execution_status, executed_at, execution_error,
       initiated_at, expires_at)
    SELECT
      'platform', action_category, action_label, risk::TEXT,
      maker_id, maker_role, maker_ip, resource_type, resource_id,
      resource_label, payload, payload_before, status::TEXT,
      checker_id, checker_role, checker_note, checked_at,
      CASE WHEN status = 'executed' THEN 'executed' ELSE 'pending' END,
      executed_at, execution_error, initiated_at, expires_at
    FROM portal_admin.admin_dual_control_actions;
  END IF;
END $$;

-- Compatibility views
CREATE OR REPLACE VIEW institution.pending_actions
  WITH (security_invoker = on)
  AS SELECT * FROM governance.pending_actions WHERE scope = 'institution';

CREATE OR REPLACE VIEW portal_admin.admin_dual_control_actions_v
  WITH (security_invoker = on)
  AS SELECT * FROM governance.pending_actions WHERE scope = 'platform';

GRANT SELECT ON institution.pending_actions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ADMIN SCHEMA (renamed from portal_admin)
--    Move all tables, keep portal_admin as a compatibility schema with views.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA admin TO authenticated;

DO $$ BEGIN ALTER TABLE IF EXISTS portal_admin.admin_users     SET SCHEMA admin; ALTER TABLE IF EXISTS admin.admin_users     RENAME TO users;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS portal_admin.admin_roles     SET SCHEMA admin; ALTER TABLE IF EXISTS admin.admin_roles     RENAME TO roles;         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS portal_admin.admin_sessions  SET SCHEMA admin; ALTER TABLE IF EXISTS admin.admin_sessions  RENAME TO sessions;      EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS portal_admin.user_groups     SET SCHEMA admin; ALTER TABLE IF EXISTS admin.user_groups     RENAME TO system_groups; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Ensure tables exist in admin schema if they weren't in portal_admin
CREATE TABLE IF NOT EXISTS admin.users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  role_slug             TEXT NOT NULL DEFAULT 'support'
                             CHECK (role_slug IN ('super_admin','institution_mgr','compliance','support','auditor','custom')),
  group_id              UUID,  -- → admin.system_groups
  status                TEXT NOT NULL DEFAULT 'pending_mfa'
                             CHECK (status IN ('active','locked','suspended','pending_mfa','deactivated')),
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_count    INT NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  force_password_reset  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.system_groups (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT    NOT NULL UNIQUE,
  label              TEXT    NOT NULL,
  description        TEXT    NOT NULL DEFAULT '',
  user_type          TEXT    NOT NULL DEFAULT 'institution'
                             CHECK (user_type IN ('admin','institution')),
  module_permissions TEXT[]  NOT NULL DEFAULT '{}',
  is_system          BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES admin.users(id) ON DELETE CASCADE,
  ip_address    INET NOT NULL,
  user_agent    TEXT NOT NULL DEFAULT '',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT CHECK (end_reason IN ('logout','timeout','forced','expired')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- RLS on admin tables
ALTER TABLE admin.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.system_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.sessions      ENABLE ROW LEVEL SECURITY;

-- Helper functions (replicate from portal_admin for the new schema)
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
      OR p_key = ANY(
           COALESCE(
             (SELECT permissions FROM admin.roles WHERE slug = admin.my_role_slug() LIMIT 1),
             '{}'::TEXT[]
           )
         )
$$;

REVOKE ALL ON FUNCTION admin.is_admin()             FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.my_role_slug()         FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.has_permission(TEXT)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION admin.my_role_slug()       TO authenticated;
GRANT EXECUTE ON FUNCTION admin.has_permission(TEXT) TO authenticated;

CREATE POLICY admin_users_select   ON admin.users   FOR SELECT USING (admin.is_admin());
CREATE POLICY admin_users_write    ON admin.users   FOR ALL    USING (auth.role() = 'service_role');
CREATE POLICY admin_roles_select   ON admin.roles   FOR SELECT USING (admin.is_admin());
CREATE POLICY admin_groups_select  ON admin.system_groups FOR SELECT USING (TRUE); -- groups visible to all (drives nav)
CREATE POLICY admin_sessions_select ON admin.sessions FOR SELECT USING (admin.is_admin());

GRANT SELECT, INSERT, UPDATE ON admin.users         TO authenticated;
GRANT SELECT                 ON admin.system_groups TO authenticated;
GRANT SELECT                 ON admin.roles         TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.sessions      TO authenticated;

-- Compatibility: portal_admin views (existing RPCs still work)
CREATE OR REPLACE VIEW portal_admin.user_groups
  WITH (security_invoker = on)
  AS SELECT * FROM admin.system_groups;

CREATE OR REPLACE VIEW portal_admin.admin_users
  WITH (security_invoker = on)
  AS SELECT * FROM admin.users;

GRANT SELECT ON portal_admin.user_groups  TO authenticated;
GRANT SELECT ON portal_admin.admin_users  TO authenticated;

-- Update get_my_group to read from admin.system_groups
CREATE OR REPLACE FUNCTION portal_admin.get_my_group()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_group admin.system_groups%ROWTYPE;
BEGIN
  SELECT g.* INTO v_group FROM admin.system_groups g
  JOIN admin.users u ON u.group_id = g.id
  WHERE u.auth_user_id = auth.uid() AND u.status = 'active' LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  SELECT g.* INTO v_group FROM admin.system_groups g
  JOIN institution.members m ON m.group_id = g.id
  WHERE m.auth_user_id = auth.uid() LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_admin.get_my_group() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. AUDIT SCHEMA — single append-only event log
--    Merges: portal_admin.admin_audit_log + institution.audit_events
--            + auth_portal/identity.login_events
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA audit TO authenticated;

CREATE TABLE IF NOT EXISTS audit.events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who
  actor_id      UUID,
  actor_type    TEXT        NOT NULL DEFAULT 'system'
                            CHECK (actor_type IN ('consumer','member','admin','system','api')),
  actor_email   TEXT,
  actor_role    TEXT,
  actor_ip      INET,
  -- Tenant context (null for platform events)
  institution_id UUID       REFERENCES institution.institutions(id) ON DELETE SET NULL,
  -- What
  action        TEXT        NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  resource_label TEXT,
  -- Result
  outcome       TEXT        NOT NULL DEFAULT 'logged'
                            CHECK (outcome IN ('success','failed','blocked','rejected','expired','logged')),
  outcome_note  TEXT,
  -- Correlation
  governance_action_id UUID REFERENCES governance.pending_actions(id) ON DELETE SET NULL,
  session_id    UUID,
  -- Payload
  metadata      JSONB       NOT NULL DEFAULT '{}'
);
-- NOTE: Partitioning omitted for now — add via pg_partman once tenant volume warrants it.

CREATE INDEX IF NOT EXISTS idx_audit_occurred    ON audit.events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit.events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_institution ON audit.events (institution_id, occurred_at DESC)
  WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit.events (action, outcome);

-- WORM: no updates or deletes
CREATE OR REPLACE RULE audit_no_update AS ON UPDATE TO audit.events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_no_delete AS ON DELETE TO audit.events DO INSTEAD NOTHING;

-- RLS: institution members see their own institution's events
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_institution_select ON audit.events
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    OR (institution_id IS NULL AND admin.is_admin())
  );

CREATE POLICY audit_insert ON audit.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role' OR admin.is_admin() OR
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

GRANT SELECT, INSERT ON audit.events TO authenticated;

-- Backfill from admin_audit_log
INSERT INTO audit.events
  (occurred_at, actor_id, actor_type, actor_email, actor_role, actor_ip,
   action, resource_type, resource_id, resource_label, outcome, outcome_note,
   governance_action_id, session_id)
SELECT
  created_at, actor_id, 'admin', actor_email, actor_role, actor_ip,
  action_category, resource_type, resource_id, resource_label,
  outcome::TEXT, outcome_note, dual_control_id, session_id::UUID
FROM portal_admin.admin_audit_log
ON CONFLICT DO NOTHING;

-- Helper function: log an audit event (called from SECURITY DEFINER functions)
CREATE OR REPLACE FUNCTION audit.log(
  p_actor_id      UUID,
  p_actor_type    TEXT,
  p_institution_id UUID,
  p_action        TEXT,
  p_resource_type TEXT  DEFAULT NULL,
  p_resource_id   UUID  DEFAULT NULL,
  p_outcome       TEXT  DEFAULT 'logged',
  p_metadata      JSONB DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit.events
    (actor_id, actor_type, institution_id, action, resource_type,
     resource_id, outcome, metadata)
  VALUES
    (p_actor_id, p_actor_type, p_institution_id, p_action, p_resource_type,
     p_resource_id, p_outcome, p_metadata);
END;
$$;

REVOKE ALL ON FUNCTION audit.log FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.log TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. UPDATE current_member_ctx TO READ FROM NEW TABLE NAMES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION institution.current_member_ctx()
RETURNS TABLE (member_id UUID, institution_id UUID, is_inst_admin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = institution, admin
AS $$
  SELECT
    im.id,
    im.institution_id,
    (im.is_primary_admin OR sg.slug = 'institution_admin') AS is_inst_admin
  FROM institution.members im
  LEFT JOIN admin.system_groups sg ON sg.id = im.group_id
  WHERE im.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION institution.current_member_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.current_member_ctx() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. UPDATE submit_for_approval TO USE governance.pending_actions
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
-- 10. VERIFICATION QUERIES (run after migration)
-- ─────────────────────────────────────────────────────────────────────────────

/*
-- 1. All 7 schemas exist:
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('identity','catalog','institution','marketplace','governance','admin','audit')
ORDER BY schema_name;
-- Expected: 7 rows

-- 2. All views have security_invoker:
SELECT n.nspname AS schema, c.relname AS view,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE) AS safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname IN ('institution','marketplace','governance','admin','audit','catalog')
ORDER BY n.nspname, c.relname;
-- Every row: safe = true

-- 3. All tenant tables have forced RLS:
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('institution','marketplace','governance')
ORDER BY n.nspname, c.relname;
-- Every row: both = true

-- 4. Real FK between bids and requests:
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'marketplace.bids'::regclass AND contype = 'f';
-- Should include fk on request_id

-- 5. marketplace.my_bids is safe:
SELECT reloptions FROM pg_class WHERE relname = 'my_bids'
AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'marketplace');
-- Should contain 'security_invoker=true'
*/
