-- =============================================================================
-- Ficium Migration 03/06 — identity schema
-- Builds identity.* tables. No removal of auth_portal.* tables.
-- Backfills identity.profile from existing auth.users.
-- Frontend impact: NONE
-- =============================================================================

-- Shared trigger (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

GRANT USAGE ON SCHEMA identity TO authenticated;

-- ── identity.profile ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity.profile (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL UNIQUE,
  display_name          TEXT        NOT NULL DEFAULT '',
  phone                 TEXT,
  avatar_url            TEXT,
  preferred_locale      TEXT        NOT NULL DEFAULT 'en',
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','locked','suspended','deactivated')),
  mfa_totp_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  mfa_totp_verified_at  TIMESTAMPTZ,
  failed_login_count    INT         NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,
  locked_reason         TEXT,
  force_password_reset  BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER identity_profile_updated_at
  BEFORE UPDATE ON identity.profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from existing auth.users
INSERT INTO identity.profile (id, email, display_name, created_at)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'display_name', split_part(email,'@',1)),
  created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── identity.mfa_backup_code ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity.mfa_backup_code (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  TEXT        NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identity_mfa_backup
  ON identity.mfa_backup_code (user_id) WHERE used_at IS NULL;

-- ── identity.ip_allowlist ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity.ip_allowlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cidr       CIDR        NOT NULL,
  label      TEXT        NOT NULL DEFAULT '',
  created_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cidr)
);

-- ── identity.password_reset_token ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity.password_reset_token (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identity_reset
  ON identity.password_reset_token (user_id) WHERE used_at IS NULL;

-- ── identity.email_verification_token ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity.email_verification_token (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── identity.login_event (WORM) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity.login_event (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email          TEXT,
  ip             INET,
  user_agent     TEXT,
  country        TEXT,
  city           TEXT,
  outcome        TEXT        NOT NULL
                             CHECK (outcome IN ('success','failed','blocked',
                               'mfa_required','mfa_failed','ip_blocked','account_locked')),
  failure_reason TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identity_login_user ON identity.login_event (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_login_at   ON identity.login_event (occurred_at DESC);

DO $$ BEGIN
  CREATE RULE identity_login_event_no_update AS ON UPDATE TO identity.login_event DO INSTEAD NOTHING;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE RULE identity_login_event_no_delete AS ON DELETE TO identity.login_event DO INSTEAD NOTHING;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE identity.profile                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.mfa_backup_code          ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.ip_allowlist             ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.password_reset_token     ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.email_verification_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.login_event              ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY identity_profile_own ON identity.profile              FOR SELECT USING (id = auth.uid());                  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY identity_mfa_own     ON identity.mfa_backup_code      FOR SELECT USING (user_id = auth.uid());              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY identity_ip_own      ON identity.ip_allowlist          FOR SELECT USING (user_id = auth.uid());              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY identity_reset_own   ON identity.password_reset_token  FOR SELECT USING (user_id = auth.uid());              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY identity_verify_own  ON identity.email_verification_token FOR SELECT USING (user_id = auth.uid());           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY identity_login_own   ON identity.login_event           FOR SELECT USING (user_id = auth.uid());              EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA identity TO authenticated;

-- ── Auto-create profile on new auth.users row ────────────────────────────────
CREATE OR REPLACE FUNCTION identity.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = identity AS $$
BEGIN
  INSERT INTO identity.profile (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION identity.handle_new_user();
