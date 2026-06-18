-- =============================================================================
-- Ficium Migration 01/06 — Create new schemas + catalog
-- Safe to run: only CREATEs, no touches to existing tables
-- Frontend impact: NONE
-- =============================================================================

-- New schemas (existing ones untouched)
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS audit;

-- Shared trigger (safe even if it exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── catalog.regulator ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.regulator (
  code       TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  country    TEXT        NOT NULL,
  website    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO catalog.regulator (code, name, country) VALUES
  ('BOM', 'Bank of Mauritius',              'MU'),
  ('FSC', 'Financial Services Commission',  'MU'),
  ('RBI', 'Reserve Bank of India',          'IN'),
  ('MAS', 'Monetary Authority of Singapore','SG')
ON CONFLICT (code) DO NOTHING;

-- ── catalog.country ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.country (
  code     CHAR(2) PRIMARY KEY,
  name     TEXT    NOT NULL,
  currency CHAR(3) NOT NULL,
  active   BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO catalog.country (code, name, currency) VALUES
  ('MU','Mauritius',     'MUR'),
  ('IN','India',         'INR'),
  ('SG','Singapore',     'SGD'),
  ('ZA','South Africa',  'ZAR'),
  ('KE','Kenya',         'KES'),
  ('GB','United Kingdom','GBP')
ON CONFLICT (code) DO NOTHING;

-- ── catalog.currency ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.currency (
  code           CHAR(3) PRIMARY KEY,
  name           TEXT    NOT NULL,
  symbol         TEXT    NOT NULL,
  decimal_places INT     NOT NULL DEFAULT 2
);
INSERT INTO catalog.currency (code, name, symbol) VALUES
  ('MUR','Mauritian Rupee','Rs'),
  ('USD','US Dollar',      '$'),
  ('EUR','Euro',           '€'),
  ('GBP','British Pound',  '£'),
  ('INR','Indian Rupee',   '₹')
ON CONFLICT (code) DO NOTHING;

-- ── catalog.product_family ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product_family (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT        NOT NULL,
  description TEXT       NOT NULL DEFAULT '',
  icon       TEXT,
  sort_order INT         NOT NULL DEFAULT 0,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER catalog_product_family_updated_at
  BEFORE UPDATE ON catalog.product_family
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO catalog.product_family (code, label, sort_order) VALUES
  ('home_loan',     'Home Loan',      1),
  ('personal_loan', 'Personal Loan',  2),
  ('vehicle_loan',  'Vehicle Loan',   3),
  ('business_loan', 'Business Loan',  4),
  ('education_loan','Education Loan', 5),
  ('credit_card',   'Credit Card',    6),
  ('deposit',       'Deposit',        7),
  ('savings',       'Savings',        8)
ON CONFLICT (code) DO NOTHING;

-- ── catalog.product ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID         NOT NULL REFERENCES catalog.product_family(id),
  code            TEXT         NOT NULL UNIQUE,
  label           TEXT         NOT NULL,
  description     TEXT         NOT NULL DEFAULT '',
  currency        CHAR(3)      NOT NULL DEFAULT 'MUR' REFERENCES catalog.currency(code),
  min_amount      NUMERIC(20,6),
  max_amount      NUMERIC(20,6),
  min_term_months INT,
  max_term_months INT,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order      INT          NOT NULL DEFAULT 0,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
);
CREATE INDEX IF NOT EXISTS idx_catalog_product_family ON catalog.product (family_id, active);
CREATE OR REPLACE TRIGGER catalog_product_updated_at
  BEFORE UPDATE ON catalog.product
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── catalog.product_parameter ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product_parameter (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID    NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
  key        TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  data_type  TEXT    NOT NULL DEFAULT 'text'
                     CHECK (data_type IN ('text','number','boolean','date','select','multiselect')),
  required   BOOLEAN NOT NULL DEFAULT FALSE,
  options    JSONB,
  validation JSONB,
  sort_order INT     NOT NULL DEFAULT 0,
  UNIQUE (product_id, key)
);

-- ── catalog.product_rate_model ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product_rate_model (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE UNIQUE,
  rate_type   TEXT NOT NULL DEFAULT 'fixed'
                   CHECK (rate_type IN ('fixed','variable','range','tiered')),
  min_rate    NUMERIC(8,4),
  max_rate    NUMERIC(8,4),
  rate_unit   TEXT NOT NULL DEFAULT 'percent_per_annum',
  compounding TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (compounding IN ('daily','monthly','quarterly','annually','none')),
  config      JSONB NOT NULL DEFAULT '{}'
);

-- ── catalog.product_sla ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product_sla (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE UNIQUE,
  bid_window_minutes    INT  NOT NULL DEFAULT 240 CHECK (bid_window_minutes > 0),
  auto_withdraw_minutes INT  NOT NULL DEFAULT 300 CHECK (auto_withdraw_minutes > 0),
  min_bids_required     INT  NOT NULL DEFAULT 1,
  max_bids_allowed      INT
);

-- ── catalog.product_eligibility ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product_eligibility (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID    NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
  country    CHAR(2) REFERENCES catalog.country(code),
  rules      JSONB   NOT NULL DEFAULT '{}',
  description TEXT   NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── catalog.product_document ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.product_document (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID    NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
  doc_key            TEXT    NOT NULL,
  label              TEXT    NOT NULL,
  description        TEXT    NOT NULL DEFAULT '',
  required           BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_mime_types TEXT[]  NOT NULL DEFAULT '{}',
  max_size_bytes     INT,
  sort_order         INT     NOT NULL DEFAULT 0,
  UNIQUE (product_id, doc_key)
);

-- ── catalog.module ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.module (
  key        TEXT    PRIMARY KEY,
  label      TEXT    NOT NULL,
  description TEXT   NOT NULL DEFAULT '',
  side       TEXT    NOT NULL DEFAULT 'institution'
                     CHECK (side IN ('institution','admin','both')),
  icon       TEXT,
  path       TEXT,
  sort_order INT     NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO catalog.module (key, label, description, side, path, sort_order) VALUES
  ('marketplace',  'Marketplace',  'Browse and respond to live funding requests', 'institution', '/marketplace',   1),
  ('bids',         'Bids',         'Manage submitted bids and bid history',       'institution', '/bids',          2),
  ('products',     'Products',     'Configure your product catalogue and rates',  'institution', '/products',      3),
  ('approvals',    'Approvals',    'Maker-checker approval queue',                'institution', '/approvals',     4),
  ('team',         'Team',         'Manage institution members and roles',        'institution', '/settings/team', 5),
  ('settings',     'Settings',     'Profile, API keys and SLA configuration',    'institution', '/settings',      6),
  ('audit',        'Audit',        'Compliance and activity audit log',           'institution', '/audit',         7),
  ('webhooks',     'Webhooks',     'Configure outbound event webhooks',           'institution', '/webhooks',      8),
  ('institutions', 'Institutions', 'Review and approve institution applications', 'admin', '/institutions',       1),
  ('admin_users',  'Users',        'Manage Ficium admin users and roles',        'admin', '/users',               2),
  ('dual_control', 'Dual Control', 'Platform-level maker-checker queue',         'admin', '/dual-control',        3),
  ('system_audit', 'System Audit', 'Full platform audit log',                    'admin', '/audit',               4),
  ('catalog_mgmt', 'Catalog',      'Manage products, families and eligibility',  'admin', '/catalog',             5)
ON CONFLICT (key) DO NOTHING;

-- No RLS on catalog — Ficium-owned reference data
GRANT USAGE ON SCHEMA catalog TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO authenticated;
