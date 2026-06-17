-- =============================================================================
-- FICIUM — DEFINITIVE DATABASE SCHEMA v2.0
-- =============================================================================
-- Bank-grade, multi-tenant, reverse-banking marketplace.
-- Designed for: correctness first, performance second, flexibility third.
--
-- TENANCY MODEL
--   Pool model with forced RLS. Every tenant table carries institution_id NOT NULL.
--   Schema-per-tenant migration path preserved: no global state bleeds into
--   institution rows. Catalog and governance are platform-owned, never duplicated.
--
-- SCHEMAS (7 bounded contexts — one owner per schema)
--   identity     — who you are          (auth layer, profiles, MFA, sessions)
--   catalog      — what we sell         (products, eligibility, rate models)
--   institution  — who our clients are  (tenants, members, groups, config)
--   marketplace  — the transaction core (requests, bids, matching, lifecycle)
--   governance   — controlled mutations (maker-checker, dual control, workflows)
--   admin        — Ficium internal ops  (staff, roles, permissions)
--   audit        — what happened        (immutable append-only event log)
--
-- CONVENTIONS
--   • Tables named as singular nouns, unprefixed (schema provides namespace)
--   • Every table: id UUID PK, created_at, updated_at where mutable
--   • Every tenant table: institution_id NOT NULL, RLS ENABLE + FORCE
--   • Indexes lead with institution_id on tenant tables
--   • All money in NUMERIC(20,6) — no floats near money, ever
--   • Enums as CHECK constraints not PG enums (easier to extend)
--   • JSONB for extensible config; typed columns for queryable fields
--   • SECURITY DEFINER functions own cross-schema reads (no RLS bypass)
--   • No application-level secrets stored (key_hash only, never plaintext)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BOOTSTRAP
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS institution;
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS audit;

-- Shared updated_at trigger function (used across all schemas)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 1: IDENTITY
-- Single source of truth for who is logged in.
-- Supabase auth.users is the root; identity.profile extends it.
-- All other schemas reference auth.users.id — never email strings.
-- ─────────────────────────────────────────────────────────────────────────────

-- Profile: one row per auth.users row, created on first login via trigger
CREATE TABLE identity.profile (
  id                    UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT         NOT NULL UNIQUE,
  display_name          TEXT         NOT NULL DEFAULT '',
  phone                 TEXT,
  avatar_url            TEXT,
  preferred_locale      TEXT         NOT NULL DEFAULT 'en',
  status                TEXT         NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active','locked','suspended','deactivated')),
  mfa_totp_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
  mfa_totp_verified_at  TIMESTAMPTZ,
  failed_login_count    INT          NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  locked_reason         TEXT,
  force_password_reset  BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER identity_profile_updated_at
  BEFORE UPDATE ON identity.profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MFA backup codes (hashed, one-time-use)
CREATE TABLE identity.mfa_backup_code (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   TEXT        NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON identity.mfa_backup_code (user_id) WHERE used_at IS NULL;

-- IP allowlist (per user, CIDR ranges)
CREATE TABLE identity.ip_allowlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cidr        CIDR        NOT NULL,
  label       TEXT        NOT NULL DEFAULT '',
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cidr)
);

-- Password reset tokens (hashed)
CREATE TABLE identity.password_reset_token (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON identity.password_reset_token (user_id) WHERE used_at IS NULL;

-- Email verification tokens
CREATE TABLE identity.email_verification_token (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Login event log (security-grade, immutable)
CREATE TABLE identity.login_event (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT,                                  -- captured at login time
  ip          INET,
  user_agent  TEXT,
  country     TEXT,
  city        TEXT,
  outcome     TEXT        NOT NULL
                          CHECK (outcome IN ('success','failed','blocked',
                                             'mfa_required','mfa_failed',
                                             'ip_blocked','account_locked')),
  failure_reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON identity.login_event (user_id, occurred_at DESC);
CREATE INDEX ON identity.login_event (occurred_at DESC);
-- WORM
CREATE RULE identity_login_event_no_update AS ON UPDATE TO identity.login_event DO INSTEAD NOTHING;
CREATE RULE identity_login_event_no_delete AS ON DELETE TO identity.login_event DO INSTEAD NOTHING;

-- RLS: users see only their own identity data
ALTER TABLE identity.profile              ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.mfa_backup_code      ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.ip_allowlist         ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.password_reset_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.email_verification_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.login_event          ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_profile_own        ON identity.profile              FOR SELECT USING (id = auth.uid());
CREATE POLICY identity_mfa_own            ON identity.mfa_backup_code      FOR SELECT USING (user_id = auth.uid());
CREATE POLICY identity_ip_own             ON identity.ip_allowlist          FOR SELECT USING (user_id = auth.uid());
CREATE POLICY identity_reset_own          ON identity.password_reset_token  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY identity_verify_own         ON identity.email_verification_token FOR SELECT USING (user_id = auth.uid());
CREATE POLICY identity_login_own          ON identity.login_event           FOR SELECT USING (user_id = auth.uid());

GRANT USAGE ON SCHEMA identity TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA identity TO authenticated;

-- Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION identity.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = identity AS $$
BEGIN
  INSERT INTO identity.profile (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION identity.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 2: CATALOG
-- Platform-owned reference data. Ficium controls this, not tenants.
-- Read-only to authenticated users. Written only by platform admins.
-- No RLS (it's public reference data); restricted by GRANT.
-- ─────────────────────────────────────────────────────────────────────────────

-- Regulators lookup
CREATE TABLE catalog.regulator (
  code        TEXT        PRIMARY KEY,               -- 'BOM', 'FSC', 'RBI', 'MAS'
  name        TEXT        NOT NULL,
  country     TEXT        NOT NULL,
  website     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO catalog.regulator (code, name, country) VALUES
  ('BOM', 'Bank of Mauritius',         'MU'),
  ('FSC', 'Financial Services Commission', 'MU'),
  ('RBI', 'Reserve Bank of India',     'IN'),
  ('MAS', 'Monetary Authority of Singapore', 'SG')
ON CONFLICT (code) DO NOTHING;

-- Country lookup
CREATE TABLE catalog.country (
  code        CHAR(2)     PRIMARY KEY,               -- ISO 3166-1 alpha-2
  name        TEXT        NOT NULL,
  currency    CHAR(3)     NOT NULL,                  -- ISO 4217
  active      BOOLEAN     NOT NULL DEFAULT TRUE
);

INSERT INTO catalog.country (code, name, currency) VALUES
  ('MU', 'Mauritius',   'MUR'),
  ('IN', 'India',       'INR'),
  ('SG', 'Singapore',   'SGD'),
  ('ZA', 'South Africa','ZAR'),
  ('KE', 'Kenya',       'KES'),
  ('GB', 'United Kingdom','GBP')
ON CONFLICT (code) DO NOTHING;

-- Currency lookup
CREATE TABLE catalog.currency (
  code        CHAR(3)     PRIMARY KEY,
  name        TEXT        NOT NULL,
  symbol      TEXT        NOT NULL,
  decimal_places INT      NOT NULL DEFAULT 2
);

INSERT INTO catalog.currency (code, name, symbol) VALUES
  ('MUR', 'Mauritian Rupee', 'Rs'),
  ('USD', 'US Dollar',       '$'),
  ('EUR', 'Euro',            '€'),
  ('GBP', 'British Pound',   '£'),
  ('INR', 'Indian Rupee',    '₹')
ON CONFLICT (code) DO NOTHING;

-- Product families (home loan, personal loan, etc.)
CREATE TABLE catalog.product_family (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  icon        TEXT,
  sort_order  INT         NOT NULL DEFAULT 0,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER catalog_product_family_updated_at
  BEFORE UPDATE ON catalog.product_family
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO catalog.product_family (code, label, sort_order) VALUES
  ('home_loan',      'Home Loan',       1),
  ('personal_loan',  'Personal Loan',   2),
  ('vehicle_loan',   'Vehicle Loan',    3),
  ('business_loan',  'Business Loan',   4),
  ('education_loan', 'Education Loan',  5),
  ('credit_card',    'Credit Card',     6),
  ('deposit',        'Deposit',         7),
  ('savings',        'Savings',         8)
ON CONFLICT (code) DO NOTHING;

-- Products (specific variants within a family)
CREATE TABLE catalog.product (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID        NOT NULL REFERENCES catalog.product_family(id),
  code            TEXT        NOT NULL UNIQUE,
  label           TEXT        NOT NULL,
  description     TEXT        NOT NULL DEFAULT '',
  currency        CHAR(3)     NOT NULL DEFAULT 'MUR' REFERENCES catalog.currency(code),
  min_amount      NUMERIC(20,6),
  max_amount      NUMERIC(20,6),
  min_term_months INT,
  max_term_months INT,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order      INT         NOT NULL DEFAULT 0,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount),
  CHECK (min_term_months IS NULL OR max_term_months IS NULL OR min_term_months <= max_term_months)
);
CREATE INDEX ON catalog.product (family_id, active);
CREATE TRIGGER catalog_product_updated_at
  BEFORE UPDATE ON catalog.product
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Product parameters (dynamic fields per product — drives the request form)
CREATE TABLE catalog.product_parameter (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  data_type   TEXT        NOT NULL DEFAULT 'text'
                          CHECK (data_type IN ('text','number','boolean','date','select','multiselect')),
  required    BOOLEAN     NOT NULL DEFAULT FALSE,
  options     JSONB,                                 -- for select/multiselect
  validation  JSONB,                                 -- min/max/regex/etc
  sort_order  INT         NOT NULL DEFAULT 0,
  UNIQUE (product_id, key)
);
CREATE INDEX ON catalog.product_parameter (product_id);

-- Product rate model (how interest/returns are structured)
CREATE TABLE catalog.product_rate_model (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID    NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE UNIQUE,
  rate_type       TEXT    NOT NULL DEFAULT 'fixed'
                          CHECK (rate_type IN ('fixed','variable','range','tiered')),
  min_rate        NUMERIC(8,4),
  max_rate        NUMERIC(8,4),
  rate_unit       TEXT    NOT NULL DEFAULT 'percent_per_annum',
  compounding     TEXT    NOT NULL DEFAULT 'monthly'
                          CHECK (compounding IN ('daily','monthly','quarterly','annually','none')),
  config          JSONB   NOT NULL DEFAULT '{}'      -- tiered bands, floors, caps, etc.
);

-- Product SLA defaults (overridable per institution)
CREATE TABLE catalog.product_sla (
  id                    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID  NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE UNIQUE,
  bid_window_minutes    INT   NOT NULL DEFAULT 240  CHECK (bid_window_minutes > 0),
  auto_withdraw_minutes INT   NOT NULL DEFAULT 300  CHECK (auto_withdraw_minutes > 0),
  min_bids_required     INT   NOT NULL DEFAULT 1,
  max_bids_allowed      INT                         -- null = unlimited
);

-- Product eligibility rules (JSON rules engine — evaluated server-side)
CREATE TABLE catalog.product_eligibility (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID    NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
  country     CHAR(2) REFERENCES catalog.country(code),  -- null = all countries
  rules       JSONB   NOT NULL DEFAULT '{}',
  description TEXT    NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Required documents per product
CREATE TABLE catalog.product_document (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID    NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
  doc_key     TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  required    BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_mime_types TEXT[] NOT NULL DEFAULT '{}',
  max_size_bytes     INT,
  sort_order  INT     NOT NULL DEFAULT 0,
  UNIQUE (product_id, doc_key)
);

-- Platform modules (drives nav, permissions, feature gates)
CREATE TABLE catalog.module (
  key         TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  side        TEXT        NOT NULL DEFAULT 'institution'
                          CHECK (side IN ('institution','admin','both')),
  icon        TEXT,
  path        TEXT,                                  -- frontend route
  sort_order  INT         NOT NULL DEFAULT 0,
  active      BOOLEAN     NOT NULL DEFAULT TRUE
);

INSERT INTO catalog.module (key, label, description, side, path, sort_order) VALUES
  ('marketplace',   'Marketplace',   'Browse and respond to live funding requests', 'institution', '/marketplace',    1),
  ('bids',          'Bids',          'Manage submitted bids and bid history',       'institution', '/bids',           2),
  ('products',      'Products',      'Configure your product catalogue and rates',  'institution', '/products',       3),
  ('approvals',     'Approvals',     'Maker-checker approval queue',                'institution', '/approvals',      4),
  ('team',          'Team',          'Manage institution members and roles',        'institution', '/settings/team',  5),
  ('settings',      'Settings',      'Profile, API keys and SLA configuration',    'institution', '/settings',       6),
  ('audit',         'Audit',         'Compliance and activity audit log',           'institution', '/audit',          7),
  ('webhooks',      'Webhooks',      'Configure outbound event webhooks',           'institution', '/webhooks',       8),
  ('institutions',  'Institutions',  'Review and approve institution applications', 'admin',       '/institutions',   1),
  ('admin_users',   'Users',         'Manage Ficium admin users and roles',        'admin',       '/users',           2),
  ('dual_control',  'Dual Control',  'Platform-level maker-checker queue',         'admin',       '/dual-control',   3),
  ('system_audit',  'System Audit',  'Full platform audit log',                    'admin',       '/audit',           4),
  ('catalog_mgmt',  'Catalog',       'Manage products, families and eligibility',  'admin',       '/catalog',         5)
ON CONFLICT (key) DO NOTHING;

GRANT USAGE ON SCHEMA catalog TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 3: INSTITUTION
-- Everything scoped to a tenant (a bank/NBFC/insurer).
-- All tables: institution_id NOT NULL, RLS ENABLE + FORCE.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA institution TO authenticated;

-- Core institution record
CREATE TABLE institution.institution (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity
  name                  TEXT        NOT NULL,
  legal_name            TEXT        NOT NULL,
  institution_type      TEXT        NOT NULL
                                    CHECK (institution_type IN (
                                      'bank','nbfc','fintech','insurance',
                                      'investment_firm','micro_credit','cooperative','other')),
  -- Registration
  country               CHAR(2)     NOT NULL REFERENCES catalog.country(code),
  regulator             TEXT        REFERENCES catalog.regulator(code),
  reg_number            TEXT,
  tax_id                TEXT,
  incorporation_date    DATE,
  -- Contact
  primary_contact_name  TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  website               TEXT,
  logo_url              TEXT,
  -- Technical
  deployment_model      TEXT        NOT NULL DEFAULT 'portal'
                                    CHECK (deployment_model IN ('portal','api','hybrid')),
  timezone              TEXT        NOT NULL DEFAULT 'Indian/Mauritius',
  -- Lifecycle
  onboarding_stage      TEXT        NOT NULL DEFAULT 'applied'
                                    CHECK (onboarding_stage IN (
                                      'applied','under_review','kyb_pending',
                                      'approved','suspended','rejected','offboarded')),
  compliance_status     TEXT        NOT NULL DEFAULT 'not_submitted'
                                    CHECK (compliance_status IN (
                                      'not_submitted','under_review',
                                      'passed','failed','expired')),
  compliance_notes      TEXT,
  compliance_reviewed_at TIMESTAMPTZ,
  compliance_reviewed_by UUID       REFERENCES auth.users(id),
  approved              BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_at           TIMESTAMPTZ,
  approved_by           UUID        REFERENCES auth.users(id),
  suspended_at          TIMESTAMPTZ,
  suspended_by          UUID        REFERENCES auth.users(id),
  suspension_reason     TEXT,
  offboarded_at         TIMESTAMPTZ,
  -- Licensing
  modules               TEXT[]      NOT NULL DEFAULT '{}',
  -- Metadata
  notes                 TEXT,                        -- internal Ficium notes
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON institution.institution (onboarding_stage, approved);
CREATE INDEX ON institution.institution (country, institution_type);
CREATE TRIGGER institution_updated_at
  BEFORE UPDATE ON institution.institution
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE institution.institution ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.institution FORCE ROW LEVEL SECURITY;

-- System groups: platform-defined group templates (e.g. institution_admin, bank_officer)
-- These live in institution schema so members can FK to them
-- (admin.system_group is the canonical table; this is a forward reference resolved below)

-- Member: a user belonging to an institution
CREATE TABLE institution.member (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Group assignment (system template OR custom group — custom wins)
  system_group_id   UUID,                            -- → admin.system_group (FK added after admin schema)
  custom_group_id   UUID,                            -- → institution.group (FK added below)
  -- Role within institution (maker/checker for dual control)
  member_role       TEXT        NOT NULL DEFAULT 'maker'
                                CHECK (member_role IN ('maker','checker','viewer','api_operator')),
  is_primary_admin  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Status
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','suspended','deactivated','invited')),
  invited_by        UUID        REFERENCES auth.users(id),
  invited_at        TIMESTAMPTZ,
  activated_at      TIMESTAMPTZ,
  deactivated_at    TIMESTAMPTZ,
  -- Metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);
CREATE INDEX ON institution.member (institution_id, status);
CREATE INDEX ON institution.member (user_id);
CREATE TRIGGER institution_member_updated_at
  BEFORE UPDATE ON institution.member
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Custom groups: tenant-defined access groups (augments system groups)
CREATE TABLE institution.group (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  slug               TEXT        NOT NULL,
  label              TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  module_permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system          BOOLEAN     NOT NULL DEFAULT FALSE,  -- system-seeded defaults
  created_by         UUID        REFERENCES institution.member(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, slug)
);
CREATE INDEX ON institution.group (institution_id);
CREATE TRIGGER institution_group_updated_at
  BEFORE UPDATE ON institution.group
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add FK from member → group (now that group table exists)
ALTER TABLE institution.member
  ADD CONSTRAINT member_custom_group_fk
  FOREIGN KEY (custom_group_id) REFERENCES institution.group(id) ON DELETE SET NULL;

-- Cross-tenant guard: member can never be assigned another institution's group
CREATE OR REPLACE FUNCTION institution.enforce_member_group_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = institution AS $$
BEGIN
  IF NEW.custom_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM institution.group
      WHERE id = NEW.custom_group_id AND institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Cross-tenant group assignment blocked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_member_group_tenant
  BEFORE INSERT OR UPDATE OF custom_group_id ON institution.member
  FOR EACH ROW EXECUTE FUNCTION institution.enforce_member_group_tenant();

-- Per-institution product configuration (overrides catalog defaults)
CREATE TABLE institution.product_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  product_id      UUID        NOT NULL REFERENCES catalog.product(id),
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Rate overrides
  min_rate        NUMERIC(8,4),
  max_rate        NUMERIC(8,4),
  -- SLA overrides (null = use catalog default)
  bid_window_minutes    INT,
  auto_withdraw_minutes INT,
  -- Custom eligibility or conditions
  conditions      JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, product_id)
);
CREATE INDEX ON institution.product_config (institution_id, enabled);
CREATE TRIGGER institution_product_config_updated_at
  BEFORE UPDATE ON institution.product_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- API keys (hashed — plaintext never stored)
CREATE TABLE institution.api_key (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  label           TEXT        NOT NULL,
  key_prefix      TEXT        NOT NULL,              -- first 8 chars for display
  key_hash        TEXT        NOT NULL UNIQUE,       -- bcrypt/SHA-256 hash
  scopes          TEXT[]      NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  last_used_ip    INET,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID        REFERENCES institution.member(id),
  created_by      UUID        REFERENCES institution.member(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON institution.api_key (institution_id) WHERE revoked_at IS NULL;

-- Webhooks
CREATE TABLE institution.webhook (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  label           TEXT        NOT NULL,
  endpoint_url    TEXT        NOT NULL,
  signing_secret  TEXT        NOT NULL,              -- HMAC secret (encrypted at rest)
  event_types     TEXT[]      NOT NULL DEFAULT '{}',
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  retry_max       INT         NOT NULL DEFAULT 3,
  timeout_ms      INT         NOT NULL DEFAULT 5000,
  last_fired_at   TIMESTAMPTZ,
  last_status     TEXT,
  failure_count   INT         NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES institution.member(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON institution.webhook (institution_id, active);
CREATE TRIGGER institution_webhook_updated_at
  BEFORE UPDATE ON institution.webhook
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Webhook delivery log (append-only)
CREATE TABLE institution.webhook_delivery (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID        NOT NULL REFERENCES institution.webhook(id) ON DELETE CASCADE,
  institution_id  UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  event_id        UUID        NOT NULL,              -- idempotency key
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
  UNIQUE (webhook_id, event_id)                      -- dedup per event
);
CREATE INDEX ON institution.webhook_delivery (institution_id, status, next_retry_at)
  WHERE status IN ('pending','retrying');

-- KYB (Know Your Business) documents and verification
CREATE TABLE institution.kyb_document (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institution.institution(id) ON DELETE CASCADE,
  doc_type        TEXT        NOT NULL
                              CHECK (doc_type IN (
                                'certificate_of_incorporation','business_registration',
                                'regulator_license','tax_certificate','audited_accounts',
                                'aml_policy','beneficial_owner_declaration','other')),
  label           TEXT        NOT NULL,
  storage_path    TEXT        NOT NULL,              -- S3/storage path (not public URL)
  mime_type       TEXT        NOT NULL,
  file_size_bytes INT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','under_review','accepted','rejected')),
  rejection_reason TEXT,
  reviewed_by     UUID        REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  uploaded_by     UUID        REFERENCES institution.member(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON institution.kyb_document (institution_id, doc_type, status);

-- RLS on all institution tables
ALTER TABLE institution.institution     ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.institution     FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.member          ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.member          FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.group           ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.group           FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.product_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.product_config  FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.api_key         ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.api_key         FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook         ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook         FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.webhook_delivery FORCE ROW LEVEL SECURITY;
ALTER TABLE institution.kyb_document    ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.kyb_document    FORCE ROW LEVEL SECURITY;

-- Core context function (no recursion, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION institution.current_member_ctx()
RETURNS TABLE (
  member_id      UUID,
  institution_id UUID,
  is_admin       BOOLEAN,
  member_role    TEXT,
  modules        TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = institution, admin
AS $$
  SELECT
    m.id                                                      AS member_id,
    m.institution_id                                          AS institution_id,
    (m.is_primary_admin OR sg.slug = 'institution_admin')     AS is_admin,
    m.member_role                                             AS member_role,
    COALESCE(
      cg.module_permissions,    -- custom group wins
      sg.module_permissions,    -- fallback to system group
      '{}'::TEXT[]
    )                                                         AS modules
  FROM institution.member m
  LEFT JOIN institution.group      cg ON cg.id = m.custom_group_id
  LEFT JOIN admin.system_group     sg ON sg.id = m.system_group_id
  WHERE m.user_id = auth.uid()
    AND m.status  = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION institution.current_member_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution.current_member_ctx() TO authenticated;

-- RLS policies using ctx function
CREATE POLICY institution_select ON institution.institution
  FOR SELECT TO authenticated
  USING (id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY institution_insert ON institution.institution
  FOR INSERT TO authenticated WITH CHECK (TRUE);    -- self-registration

CREATE POLICY member_select ON institution.member
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY member_self_insert ON institution.member
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY group_select ON institution.group
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY product_config_select ON institution.product_config
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY api_key_select ON institution.api_key
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY webhook_select ON institution.webhook
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY webhook_delivery_select ON institution.webhook_delivery
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

CREATE POLICY kyb_document_select ON institution.kyb_document
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

GRANT SELECT, INSERT, UPDATE ON institution.institution      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON institution.member           TO authenticated;
GRANT SELECT, INSERT, UPDATE ON institution.group            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON institution.product_config   TO authenticated;
GRANT SELECT                 ON institution.api_key          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON institution.webhook          TO authenticated;
GRANT SELECT                 ON institution.webhook_delivery TO authenticated;
GRANT SELECT, INSERT         ON institution.kyb_document     TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 4: MARKETPLACE
-- The transaction core. Requests come from consumers; bids from institutions.
-- Real FK between bids and requests — the most important invariant in the system.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA marketplace TO authenticated;

-- Funding request (from consumer)
CREATE TABLE marketplace.request (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Consumer reference (cross-DB — no FK; consumer PII lives in consumer project)
  consumer_id           UUID        NOT NULL,
  consumer_ref          TEXT,                        -- display ref e.g. REQ-2025-001234
  -- Product
  product_id            UUID        NOT NULL REFERENCES catalog.product(id),
  country               CHAR(2)     NOT NULL REFERENCES catalog.country(code),
  currency              CHAR(3)     NOT NULL REFERENCES catalog.currency(code),
  amount                NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  term_months           INT         NOT NULL CHECK (term_months > 0),
  -- Consumer-supplied parameters (product-specific)
  params                JSONB       NOT NULL DEFAULT '{}',
  -- Lifecycle
  status                TEXT        NOT NULL DEFAULT 'open'
                                    CHECK (status IN (
                                      'open','bidding','accepted',
                                      'cancelled','expired','withdrawn')),
  -- Bid window
  bid_window_opens_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  bid_window_closes_at  TIMESTAMPTZ NOT NULL,
  auto_close_at         TIMESTAMPTZ,
  -- Outcome
  winning_bid_id        UUID,                        -- FK added after bids table
  accepted_at           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  -- Dedup
  idempotency_key       TEXT        NOT NULL UNIQUE,
  -- Metadata
  source                TEXT        NOT NULL DEFAULT 'app'
                                    CHECK (source IN ('app','api','referral')),
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (bid_window_closes_at > bid_window_opens_at)
);
CREATE INDEX ON marketplace.request (status, bid_window_closes_at);
CREATE INDEX ON marketplace.request (product_id, status);
CREATE INDEX ON marketplace.request (consumer_id, status);
CREATE TRIGGER marketplace_request_updated_at
  BEFORE UPDATE ON marketplace.request
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bid (from institution, in response to a request)
CREATE TABLE marketplace.bid (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Core reference — THE critical FK
  request_id        UUID        NOT NULL REFERENCES marketplace.request(id) ON DELETE RESTRICT,
  institution_id    UUID        NOT NULL REFERENCES institution.institution(id),
  submitted_by      UUID        REFERENCES institution.member(id) ON DELETE SET NULL,
  -- Bid terms
  rate              NUMERIC(8,4) NOT NULL CHECK (rate >= 0),
  rate_type         TEXT        NOT NULL DEFAULT 'fixed'
                                CHECK (rate_type IN ('fixed','variable')),
  rate_valid_days   INT,                             -- how long this rate is guaranteed
  amount_offered    NUMERIC(20,6) NOT NULL CHECK (amount_offered > 0),
  term_months       INT         NOT NULL CHECK (term_months > 0),
  conditions        JSONB       NOT NULL DEFAULT '{}',
  fee_structure     JSONB       NOT NULL DEFAULT '{}', -- origination/processing fees
  -- Lifecycle
  status            TEXT        NOT NULL DEFAULT 'submitted'
                                CHECK (status IN (
                                  'draft','submitted','under_review',
                                  'accepted','rejected','expired','withdrawn')),
  -- Submission context
  submitted_via     TEXT        NOT NULL DEFAULT 'portal'
                                CHECK (submitted_via IN ('portal','api','webhook','core_banking')),
  -- Timing
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  withdraw_reason   TEXT,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  -- Performance tracking
  response_time_ms  INT,
  -- Dedup
  idempotency_key   TEXT,
  -- Metadata
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One bid per institution per request (can revise via new draft)
  UNIQUE (institution_id, request_id),
  UNIQUE (institution_id, request_id, idempotency_key)
);
CREATE INDEX ON marketplace.bid (institution_id, status, submitted_at DESC);
CREATE INDEX ON marketplace.bid (request_id, status);
CREATE INDEX ON marketplace.bid (status, expires_at) WHERE status = 'submitted';
CREATE TRIGGER marketplace_bid_updated_at
  BEFORE UPDATE ON marketplace.bid
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add winning_bid FK now that bids table exists
ALTER TABLE marketplace.request
  ADD CONSTRAINT request_winning_bid_fk
  FOREIGN KEY (winning_bid_id) REFERENCES marketplace.bid(id) ON DELETE SET NULL;

-- Bid lifecycle event log (append-only — full audit trail of every state change)
CREATE TABLE marketplace.bid_event (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id      UUID        NOT NULL REFERENCES marketplace.bid(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  actor_id    UUID        REFERENCES auth.users(id),
  actor_type  TEXT        NOT NULL DEFAULT 'system'
                          CHECK (actor_type IN ('member','consumer','system','admin')),
  reason      TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON marketplace.bid_event (bid_id, occurred_at DESC);
-- WORM
CREATE RULE marketplace_bid_event_no_update AS ON UPDATE TO marketplace.bid_event DO INSTEAD NOTHING;
CREATE RULE marketplace_bid_event_no_delete AS ON DELETE TO marketplace.bid_event DO INSTEAD NOTHING;

-- Acceptance: formal record when consumer picks winning bid
CREATE TABLE marketplace.acceptance (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID        NOT NULL REFERENCES marketplace.request(id) UNIQUE,
  bid_id                UUID        NOT NULL REFERENCES marketplace.bid(id) UNIQUE,
  accepted_by_consumer  UUID        NOT NULL,        -- consumer user_id
  acceptance_method     TEXT        NOT NULL DEFAULT 'app'
                                    CHECK (acceptance_method IN ('app','api','agent')),
  terms_version         TEXT,                        -- T&C version accepted
  ip                    INET,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  accepted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE marketplace.request    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.request    FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid        ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid        FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_event  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_event  FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.acceptance FORCE ROW LEVEL SECURITY;

-- Institutions see open requests + their own bids
CREATE POLICY marketplace_request_select ON marketplace.request
  FOR SELECT TO authenticated
  USING (
    status IN ('open','bidding')
    AND EXISTS (
      SELECT 1 FROM institution.current_member_ctx() ctx
      WHERE ctx.institution_id IS NOT NULL
    )
  );

CREATE POLICY marketplace_bid_select ON marketplace.bid
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
  );

CREATE POLICY marketplace_bid_event_select ON marketplace.bid_event
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.bid b
      JOIN institution.current_member_ctx() ctx ON ctx.institution_id = b.institution_id
      WHERE b.id = bid_id
    )
  );

CREATE POLICY marketplace_acceptance_select ON marketplace.acceptance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.bid b
      JOIN institution.current_member_ctx() ctx ON ctx.institution_id = b.institution_id
      WHERE b.id = bid_id
    )
  );

GRANT SELECT ON marketplace.request    TO authenticated;
GRANT SELECT ON marketplace.bid        TO authenticated;
GRANT SELECT ON marketplace.bid_event  TO authenticated;
GRANT SELECT ON marketplace.acceptance TO authenticated;

-- Convenience view for institution bid list (replaces old my_bids)
CREATE OR REPLACE VIEW marketplace.my_bids
WITH (security_invoker = on) AS
SELECT
  b.id, b.request_id, b.institution_id,
  b.rate, b.rate_type, b.amount_offered, b.term_months,
  b.conditions, b.fee_structure, b.status, b.submitted_via,
  b.submitted_at, b.expires_at, b.created_at,
  r.product_id,
  r.amount        AS requested_amount,
  r.currency,
  r.term_months   AS requested_term_months,
  r.status        AS request_status,
  r.bid_window_closes_at,
  r.consumer_ref,
  p.label         AS product_label,
  pf.label        AS product_family_label
FROM marketplace.bid             b
JOIN marketplace.request         r  ON r.id  = b.request_id
JOIN catalog.product             p  ON p.id  = r.product_id
JOIN catalog.product_family      pf ON pf.id = p.family_id;

GRANT SELECT ON marketplace.my_bids TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 5: GOVERNANCE
-- Unified maker-checker / dual-control queue for ALL privileged actions.
-- One table, one executor pattern, one audit story.
-- Scope 'institution' = tenant action. Scope 'platform' = Ficium admin action.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA governance TO authenticated;

CREATE TABLE governance.action (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope
  scope            TEXT        NOT NULL DEFAULT 'institution'
                               CHECK (scope IN ('institution','platform')),
  -- Category drives the executor CASE
  category         TEXT        NOT NULL,             -- e.g. 'bid.submit', 'group.create'
  label            TEXT        NOT NULL DEFAULT '',
  risk             TEXT        NOT NULL DEFAULT 'medium'
                               CHECK (risk IN ('low','medium','high','critical')),
  -- Tenant context (null for platform actions)
  institution_id   UUID        REFERENCES institution.institution(id) ON DELETE CASCADE,
  -- Maker
  maker_id         UUID        NOT NULL,             -- member.id or admin.user.id
  maker_role       TEXT        NOT NULL DEFAULT '',
  maker_ip         INET,
  maker_user_agent TEXT,
  -- Resource
  resource_type    TEXT        NOT NULL,
  resource_id      UUID,
  resource_label   TEXT,
  -- Payload
  payload          JSONB       NOT NULL DEFAULT '{}',
  payload_before   JSONB,                            -- snapshot for rollback reference
  -- Status
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending','approved','rejected','expired','cancelled')),
  -- Checker
  checker_id       UUID,                             -- member.id or admin.user.id
  checker_role     TEXT,
  checker_note     TEXT,
  checker_ip       INET,
  checked_at       TIMESTAMPTZ,
  -- Execution
  execution_status TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (execution_status IN (
                                 'pending','executing','executed','failed','skipped')),
  executed_at      TIMESTAMPTZ,
  execution_error  TEXT,
  -- Timing
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Four-eyes: maker ≠ checker (sole-admin override handled in RPC)
  CONSTRAINT four_eyes CHECK (checker_id IS NULL OR checker_id != maker_id)
);

CREATE INDEX ON governance.action (institution_id, status, category)
  WHERE institution_id IS NOT NULL;
CREATE INDEX ON governance.action (scope, status)
  WHERE scope = 'platform';
CREATE INDEX ON governance.action (expires_at)
  WHERE status = 'pending';
CREATE INDEX ON governance.action (maker_id, created_at DESC);

CREATE TRIGGER governance_action_updated_at
  BEFORE UPDATE ON governance.action
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE governance.action ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.action FORCE ROW LEVEL SECURITY;

CREATE POLICY governance_inst_select ON governance.action
  FOR SELECT TO authenticated
  USING (
    scope = 'institution'
    AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
  );

CREATE POLICY governance_inst_insert ON governance.action
  FOR INSERT TO authenticated
  WITH CHECK (
    scope = 'institution'
    AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND maker_id = (SELECT ctx.member_id FROM institution.current_member_ctx() ctx)
  );

CREATE POLICY governance_inst_update ON governance.action
  FOR UPDATE TO authenticated
  USING (
    scope = 'institution'
    AND institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
    AND (SELECT ctx.is_admin FROM institution.current_member_ctx() ctx)
  );

GRANT SELECT, INSERT, UPDATE ON governance.action TO authenticated;

-- submit_for_approval RPC (frontend calls this)
CREATE OR REPLACE FUNCTION governance.submit(
  p_category      TEXT,
  p_resource_type TEXT,
  p_resource_id   UUID,
  p_payload       JSONB,
  p_label         TEXT DEFAULT '',
  p_risk          TEXT DEFAULT 'medium'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, governance, admin
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

  v_role := v_ctx.member_role;

  INSERT INTO governance.action
    (scope, category, label, risk, institution_id, maker_id, maker_role,
     resource_type, resource_id, payload)
  VALUES
    ('institution', p_category, COALESCE(p_label,''), p_risk,
     v_ctx.institution_id, v_ctx.member_id, v_role,
     p_resource_type, p_resource_id, COALESCE(p_payload,'{}'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Backward-compat alias (existing frontend calls submit_for_approval)
CREATE OR REPLACE FUNCTION institution.submit_for_approval(
  p_action_category TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_payload         JSONB
) RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT governance.submit(p_action_category, p_resource_type, p_resource_id, p_payload);
$$;

REVOKE ALL ON FUNCTION governance.submit FROM PUBLIC;
REVOKE ALL ON FUNCTION institution.submit_for_approval FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.submit TO authenticated;
GRANT EXECUTE ON FUNCTION institution.submit_for_approval TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 6: ADMIN
-- Ficium internal staff only. Zero overlap with institution data.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA admin TO authenticated;

-- System group templates (platform-defined; institution.member references these)
CREATE TABLE admin.system_group (
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
CREATE TRIGGER admin_system_group_updated_at
  BEFORE UPDATE ON admin.system_group
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO admin.system_group (slug, label, side, module_permissions, is_system) VALUES
  ('institution_admin',    'Institution Admin',    'institution',
    ARRAY['marketplace','bids','products','approvals','team','settings','audit','webhooks'], TRUE),
  ('bank_officer_approver','Bank Officer + Approval','institution',
    ARRAY['marketplace','bids','products','approvals'], TRUE),
  ('bank_officer',         'Bank Officer',         'institution',
    ARRAY['marketplace','bids','products'], TRUE),
  ('compliance',           'Compliance',           'institution',
    ARRAY['audit'], TRUE),
  ('it_admin',             'IT Admin',             'institution',
    ARRAY['settings','webhooks'], TRUE),
  ('super_admin',          'Super Admin',          'admin',
    ARRAY['*'], TRUE),
  ('institution_mgr',      'Institution Manager',  'admin',
    ARRAY['institutions','dual_control','system_audit'], TRUE),
  ('ficium_compliance',    'Ficium Compliance',    'admin',
    ARRAY['system_audit','institutions'], TRUE),
  ('ficium_support',       'Ficium Support',       'admin',
    ARRAY['institutions','system_audit'], TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Add FK from institution.member → admin.system_group (deferred — both tables now exist)
ALTER TABLE institution.member
  ADD CONSTRAINT member_system_group_fk
  FOREIGN KEY (system_group_id) REFERENCES admin.system_group(id) ON DELETE SET NULL;

-- Admin roles (fine-grained permission strings for Ficium staff)
CREATE TABLE admin.role (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  permissions TEXT[]      NOT NULL DEFAULT '{}',
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin.role (slug, label, permissions, is_system) VALUES
  ('super_admin',     'Super Admin',         ARRAY['*'],                                    TRUE),
  ('institution_mgr', 'Institution Manager', ARRAY['institutions:view','institutions:approve',
    'institutions:suspend','institutions:modules','dual_control:approve','audit:view'],      TRUE),
  ('compliance',      'Compliance Officer',  ARRAY['institutions:view','audit:view',
    'audit:export','dual_control:view'],                                                     TRUE),
  ('support',         'Support',             ARRAY['institutions:view','audit:view',
    'dual_control:view'],                                                                    TRUE),
  ('auditor',         'Auditor',             ARRAY['audit:view','audit:export'],             TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Admin users (Ficium staff)
CREATE TABLE admin.user (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id          UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL UNIQUE,
  display_name          TEXT        NOT NULL,
  role_id               UUID        NOT NULL REFERENCES admin.role(id),
  system_group_id       UUID        REFERENCES admin.system_group(id),
  status                TEXT        NOT NULL DEFAULT 'pending_mfa'
                                    CHECK (status IN (
                                      'active','locked','suspended','pending_mfa','deactivated')),
  mfa_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  mfa_verified_at       TIMESTAMPTZ,
  failed_login_count    INT         NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  locked_reason         TEXT,
  force_password_reset  BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  created_by            UUID        REFERENCES admin.user(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON admin.user (status);
CREATE TRIGGER admin_user_updated_at
  BEFORE UPDATE ON admin.user
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Admin sessions
CREATE TABLE admin.session (
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
CREATE INDEX ON admin.session (user_id, is_active);
CREATE INDEX ON admin.session (is_active, last_active_at) WHERE is_active = TRUE;

-- RLS
ALTER TABLE admin.system_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.role         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.user         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.session      ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION admin.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin.user WHERE auth_user_id = auth.uid() AND status = 'active'
  )
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

-- Auto-lock admin after 5 failed logins
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
CREATE TRIGGER admin_user_failed_login_lock
  BEFORE UPDATE OF failed_login_count ON admin.user
  FOR EACH ROW EXECUTE FUNCTION admin.check_failed_logins();

-- System groups visible to all authenticated (drives nav for both sides)
CREATE POLICY admin_system_group_select ON admin.system_group FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY admin_role_select         ON admin.role         FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_user_select         ON admin.user         FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_user_write          ON admin.user         FOR ALL    TO authenticated USING (auth.role() = 'service_role');
CREATE POLICY admin_session_select      ON admin.session      FOR SELECT TO authenticated USING (admin.is_admin());
CREATE POLICY admin_session_write       ON admin.session      FOR ALL    TO authenticated USING (admin.is_admin());

GRANT SELECT ON admin.system_group         TO authenticated;
GRANT SELECT ON admin.role                 TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.user TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.session TO authenticated;

-- Add governance platform policies now that admin schema exists
CREATE POLICY governance_platform_select ON governance.action
  FOR SELECT TO authenticated
  USING (scope = 'platform' AND admin.is_admin());

CREATE POLICY governance_platform_insert ON governance.action
  FOR INSERT TO authenticated
  WITH CHECK (scope = 'platform' AND admin.is_admin());

CREATE POLICY governance_platform_update ON governance.action
  FOR UPDATE TO authenticated
  USING (scope = 'platform' AND admin.has_permission('dual_control:approve'));

-- get_my_group: used by portal shell to resolve nav modules
CREATE OR REPLACE FUNCTION admin.get_my_group()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, institution AS $$
DECLARE v_group admin.system_group%ROWTYPE;
BEGIN
  -- Admin user path
  SELECT sg.* INTO v_group
  FROM admin.system_group sg
  JOIN admin.user u ON u.system_group_id = sg.id
  WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  -- Institution member path (system group)
  SELECT sg.* INTO v_group
  FROM admin.system_group sg
  JOIN institution.member m ON m.system_group_id = sg.id
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_group)::JSONB; END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION admin.get_my_group() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.get_my_group() TO authenticated;

-- Backward-compat: portal_admin.get_my_group still called by frontend
CREATE OR REPLACE FUNCTION portal_admin.get_my_group()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT admin.get_my_group()
$$;
GRANT EXECUTE ON FUNCTION portal_admin.get_my_group() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA 7: AUDIT
-- Single immutable append-only event log for the entire platform.
-- One row per significant event. WORM semantics (no UPDATE/DELETE).
-- Bank-grade: captures who, what, when, where, outcome, correlation.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA audit TO authenticated;

CREATE TABLE audit.event (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who
  actor_id             UUID,                         -- auth.users.id
  actor_type           TEXT        NOT NULL DEFAULT 'system'
                                   CHECK (actor_type IN
                                     ('consumer','member','admin','system','api')),
  actor_email          TEXT,                         -- captured at event time
  actor_role           TEXT,
  actor_ip             INET,
  actor_user_agent     TEXT,
  -- Tenant context
  institution_id       UUID        REFERENCES institution.institution(id) ON DELETE SET NULL,
  -- What
  action               TEXT        NOT NULL,         -- e.g. 'bid.submit', 'member.invite'
  resource_type        TEXT,                         -- e.g. 'bid', 'member'
  resource_id          UUID,
  resource_label       TEXT,
  -- Result
  outcome              TEXT        NOT NULL DEFAULT 'logged'
                                   CHECK (outcome IN
                                     ('success','failed','blocked','rejected','expired','logged')),
  outcome_note         TEXT,
  -- Correlation
  governance_action_id UUID        REFERENCES governance.action(id) ON DELETE SET NULL,
  session_id           UUID,
  request_id           TEXT,                         -- HTTP request ID for tracing
  -- Payload
  metadata             JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX ON audit.event (occurred_at DESC);
CREATE INDEX ON audit.event (actor_id, occurred_at DESC);
CREATE INDEX ON audit.event (institution_id, occurred_at DESC)
  WHERE institution_id IS NOT NULL;
CREATE INDEX ON audit.event (action, outcome);
CREATE INDEX ON audit.event (governance_action_id)
  WHERE governance_action_id IS NOT NULL;

-- WORM
CREATE RULE audit_event_no_update AS ON UPDATE TO audit.event DO INSTEAD NOTHING;
CREATE RULE audit_event_no_delete AS ON DELETE TO audit.event DO INSTEAD NOTHING;

ALTER TABLE audit.event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.event FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_inst_select ON audit.event
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
  );

CREATE POLICY audit_admin_select ON audit.event
  FOR SELECT TO authenticated
  USING (admin.is_admin());

CREATE POLICY audit_insert ON audit.event
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.role() = 'service_role'
    OR admin.is_admin()
    OR institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx)
  );

GRANT SELECT, INSERT ON audit.event TO authenticated;

-- audit.log() helper — called from SECURITY DEFINER functions throughout
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

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKWARD COMPATIBILITY LAYER
-- Shims so existing portal_admin.* calls still work during frontend migration.
-- Drop these once the frontend and portal-api are repointed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS portal_admin;

CREATE OR REPLACE VIEW portal_admin.user_groups
  WITH (security_invoker = on) AS SELECT * FROM admin.system_group;

CREATE OR REPLACE VIEW portal_admin.admin_users
  WITH (security_invoker = on) AS SELECT * FROM admin.user;

GRANT SELECT ON portal_admin.user_groups TO authenticated;
GRANT SELECT ON portal_admin.admin_users  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFAULT MEMBER GROUP TRIGGER
-- Assigns system_group_id on institution.member insert based on is_primary_admin.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION institution.assign_default_member_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, admin AS $$
BEGIN
  IF NEW.system_group_id IS NULL THEN
    IF NEW.is_primary_admin THEN
      SELECT id INTO NEW.system_group_id FROM admin.system_group WHERE slug = 'institution_admin';
    ELSE
      SELECT id INTO NEW.system_group_id FROM admin.system_group WHERE slug = 'bank_officer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_default_member_group ON institution.member;
CREATE TRIGGER trg_assign_default_member_group
  BEFORE INSERT ON institution.member
  FOR EACH ROW EXECUTE FUNCTION institution.assign_default_member_group();

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- 1. All 7 schemas:
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('identity','catalog','institution','marketplace','governance','admin','audit')
ORDER BY schema_name;

-- 2. RLS forced on all tenant tables:
SELECT n.nspname AS schema, c.relname AS table,
       c.relrowsecurity AS rls_on, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('institution','marketplace','governance','audit')
ORDER BY n.nspname, c.relname;

-- 3. All views are security_invoker:
SELECT n.nspname AS schema, c.relname AS view,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE) AS safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
ORDER BY n.nspname, c.relname;

-- 4. FK between bid and request (the critical invariant):
SELECT conname FROM pg_constraint
WHERE conrelid = 'marketplace.bid'::regclass AND contype = 'f'
  AND conname LIKE '%request%';

-- 5. my_bids view is security_invoker:
SELECT reloptions FROM pg_class
WHERE relname = 'my_bids'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'marketplace');
*/
