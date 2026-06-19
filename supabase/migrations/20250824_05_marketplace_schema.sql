-- =============================================================================
-- Ficium Migration 05/06 — marketplace schema
-- Creates marketplace.request, bid, bid_event, acceptance.
-- Backfills from institution.institution_bids.
-- Compat view keeps institution.institution_bids working.
-- Frontend impact: NONE
-- =============================================================================

GRANT USAGE ON SCHEMA marketplace TO authenticated;

-- ── marketplace.request ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace.request (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id          UUID         NOT NULL,
  consumer_ref         TEXT,
  product_id           UUID         NOT NULL REFERENCES catalog.product(id),
  country              CHAR(2)      NOT NULL DEFAULT 'MU' REFERENCES catalog.country(code),
  currency             CHAR(3)      NOT NULL DEFAULT 'MUR' REFERENCES catalog.currency(code),
  amount               NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  term_months          INT          NOT NULL CHECK (term_months > 0),
  params               JSONB        NOT NULL DEFAULT '{}',
  status               TEXT         NOT NULL DEFAULT 'open'
                                    CHECK (status IN ('open','bidding','accepted','cancelled','expired','withdrawn')),
  bid_window_opens_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  bid_window_closes_at TIMESTAMPTZ  NOT NULL DEFAULT now() + INTERVAL '4 hours',
  auto_close_at        TIMESTAMPTZ,
  winning_bid_id       UUID,
  accepted_at          TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT,
  idempotency_key      TEXT         NOT NULL UNIQUE,
  source               TEXT         NOT NULL DEFAULT 'app'
                                    CHECK (source IN ('app','api','referral')),
  metadata             JSONB        NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (bid_window_closes_at > bid_window_opens_at)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_request_status  ON marketplace.request (status, bid_window_closes_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_request_product ON marketplace.request (product_id, status);
CREATE INDEX IF NOT EXISTS idx_marketplace_request_consumer ON marketplace.request (consumer_id, status);
CREATE OR REPLACE TRIGGER marketplace_request_updated_at
  BEFORE UPDATE ON marketplace.request
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── marketplace.bid ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace.bid (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID         NOT NULL REFERENCES marketplace.request(id) ON DELETE RESTRICT,
  institution_id   UUID         NOT NULL REFERENCES institution.institution(id),
  submitted_by     UUID         REFERENCES institution.member(id) ON DELETE SET NULL,
  rate             NUMERIC(8,4) NOT NULL CHECK (rate >= 0),
  rate_type        TEXT         NOT NULL DEFAULT 'fixed'
                                CHECK (rate_type IN ('fixed','variable')),
  rate_valid_days  INT,
  amount_offered   NUMERIC(20,6) NOT NULL CHECK (amount_offered > 0),
  term_months      INT          NOT NULL CHECK (term_months > 0),
  conditions       JSONB        NOT NULL DEFAULT '{}',
  fee_structure    JSONB        NOT NULL DEFAULT '{}',
  status           TEXT         NOT NULL DEFAULT 'submitted'
                                CHECK (status IN ('draft','submitted','under_review','accepted','rejected','expired','withdrawn')),
  submitted_via    TEXT         NOT NULL DEFAULT 'portal'
                                CHECK (submitted_via IN ('portal','api','webhook','core_banking')),
  submitted_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  withdrawn_at     TIMESTAMPTZ,
  withdraw_reason  TEXT,
  rejected_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  response_time_ms INT,
  idempotency_key  TEXT,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (institution_id, request_id),
  UNIQUE (institution_id, request_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_bid_institution ON marketplace.bid (institution_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_bid_request     ON marketplace.bid (request_id, status);
CREATE INDEX IF NOT EXISTS idx_marketplace_bid_expiry      ON marketplace.bid (status, expires_at) WHERE status = 'submitted';
CREATE OR REPLACE TRIGGER marketplace_bid_updated_at
  BEFORE UPDATE ON marketplace.bid
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- winning_bid FK (now that bid table exists)
DO $$ BEGIN
  ALTER TABLE marketplace.request
    ADD CONSTRAINT request_winning_bid_fk
    FOREIGN KEY (winning_bid_id) REFERENCES marketplace.bid(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── marketplace.bid_event (WORM) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace.bid_event (
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
CREATE INDEX IF NOT EXISTS idx_bid_event_bid ON marketplace.bid_event (bid_id, occurred_at DESC);

-- WORM via trigger (not RULE — rules block ON CONFLICT inserts)
CREATE OR REPLACE FUNCTION marketplace.block_bid_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'marketplace.bid_event is append-only';
END;
$$;

DROP TRIGGER IF EXISTS bid_event_no_update ON marketplace.bid_event;
CREATE TRIGGER bid_event_no_update
  BEFORE UPDATE ON marketplace.bid_event
  FOR EACH ROW EXECUTE FUNCTION marketplace.block_bid_event_mutation();

DROP TRIGGER IF EXISTS bid_event_no_delete ON marketplace.bid_event;
CREATE TRIGGER bid_event_no_delete
  BEFORE DELETE ON marketplace.bid_event
  FOR EACH ROW EXECUTE FUNCTION marketplace.block_bid_event_mutation();

-- ── marketplace.acceptance ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace.acceptance (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           UUID        NOT NULL REFERENCES marketplace.request(id) UNIQUE,
  bid_id               UUID        NOT NULL REFERENCES marketplace.bid(id) UNIQUE,
  accepted_by_consumer UUID        NOT NULL,
  acceptance_method    TEXT        NOT NULL DEFAULT 'app'
                                   CHECK (acceptance_method IN ('app','api','agent')),
  terms_version        TEXT,
  ip                   INET,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  accepted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE marketplace.request    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.request    FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid        ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid        FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_event  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.bid_event  FORCE ROW LEVEL SECURITY;
ALTER TABLE marketplace.acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.acceptance FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY marketplace_request_select ON marketplace.request
    FOR SELECT TO authenticated
    USING (status IN ('open','bidding') AND EXISTS (
      SELECT 1 FROM institution.current_member_ctx() ctx WHERE ctx.institution_id IS NOT NULL
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY marketplace_bid_select ON marketplace.bid
    FOR SELECT TO authenticated
    USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY marketplace_bid_event_select ON marketplace.bid_event
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM marketplace.bid b
      JOIN institution.current_member_ctx() ctx ON ctx.institution_id = b.institution_id
      WHERE b.id = bid_id
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY marketplace_acceptance_select ON marketplace.acceptance
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM marketplace.bid b
      JOIN institution.current_member_ctx() ctx ON ctx.institution_id = b.institution_id
      WHERE b.id = bid_id
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON marketplace.request    TO authenticated;
GRANT SELECT ON marketplace.bid        TO authenticated;
GRANT SELECT ON marketplace.bid_event  TO authenticated;
GRANT SELECT ON marketplace.acceptance TO authenticated;

-- ── my_bids view (security_invoker — fixes the UNRESTRICTED flag) ─────────────
DROP VIEW IF EXISTS institution.my_bids;
CREATE OR REPLACE VIEW marketplace.my_bids
WITH (security_invoker = on) AS
SELECT
  b.id, b.request_id, b.institution_id,
  b.rate, b.rate_type, b.amount_offered, b.term_months,
  b.conditions, b.fee_structure, b.status, b.submitted_via,
  b.submitted_at, b.expires_at, b.created_at,
  r.product_id,
  r.amount          AS requested_amount,
  r.currency,
  r.term_months     AS requested_term_months,
  r.status          AS request_status,
  r.bid_window_closes_at,
  r.consumer_ref,
  p.label           AS product_label,
  pf.label          AS product_family_label
FROM marketplace.bid             b
JOIN marketplace.request         r  ON r.id  = b.request_id
JOIN catalog.product             p  ON p.id  = r.product_id
JOIN catalog.product_family      pf ON pf.id = p.family_id;

GRANT SELECT ON marketplace.my_bids TO authenticated;

-- ── Backfill from institution.institution_bids ────────────────────────────────
-- Only runs if institution_bids is still a real table (not a view) and marketplace.bid is empty
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'institution' AND table_name = 'institution_bids'
      AND table_type = 'BASE TABLE'
  ) THEN
    -- Need a placeholder request row for any orphan bids (no request_id in old table)
    -- Insert bids that have a request_id mapping (from portal-api synced data)
    -- Orphan bids are skipped — they'll be cleaned up manually
    INSERT INTO marketplace.bid
      (id, request_id, institution_id, rate, rate_type, amount_offered,
       term_months, conditions, status, submitted_via, submitted_at, created_at)
    SELECT
      b.id,
      b.request_id,
      b.institution_id,
      b.rate,
      COALESCE(b.rate_type, 'fixed'),
      b.amount_offered,
      b.term_months,
      COALESCE(b.conditions, '{}'),
      b.status,
      COALESCE(b.submitted_via, 'portal'),
      b.submitted_at,
      b.created_at
    FROM institution.institution_bids b
    WHERE b.request_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM marketplace.request r WHERE r.id = b.request_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- institution_bids is a real table — rename it to archive, then create compat view
DO $$ BEGIN
  ALTER TABLE institution.institution_bids RENAME TO institution_bids_archive;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_table  THEN NULL; END $$;

-- Now safe to create compat view over marketplace.bid
CREATE OR REPLACE VIEW institution.institution_bids
  WITH (security_invoker = on)
  AS SELECT * FROM marketplace.bid;
GRANT SELECT ON institution.institution_bids TO authenticated;
