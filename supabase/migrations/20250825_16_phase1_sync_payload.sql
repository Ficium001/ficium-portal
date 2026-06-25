-- =============================================================================
-- Migration 16: Phase 1 sync payload
--
-- Replaces the skeletal ingest_app_request with a version that:
--   1. Anonymises consumer_id — deterministic MD5-UUID, never the real UUID
--   2. Strips raw purpose text from params (was a PII vector)
--   3. Populates params  with bidding-context fields (loan_purpose, collateral,
--      ltv_pct, max_rate) — enough to price, nothing to identify
--   4. Populates metadata with Ficium-attested Phase 1 attributes (kyc_verified,
--      income_band, dsr, scores, risk_tier) — the platform's verified dossier
-- =============================================================================

-- Drop old signature (purpose text was the 6th param — different from new sig)
DROP FUNCTION IF EXISTS marketplace.ingest_app_request(
    uuid, uuid, text, numeric, integer, text, numeric, timestamptz, text, timestamptz
);

-- New function — no raw PII, Phase 1 attributes via p_phase1 jsonb
CREATE OR REPLACE FUNCTION marketplace.ingest_app_request(
    p_app_request_id    uuid,
    p_consumer_id       uuid,
    p_app_product_type  text,
    p_amount            numeric,
    p_term_months       integer,
    p_max_rate          numeric,
    p_deadline          timestamptz,
    p_status            text,
    p_created_at        timestamptz,
    p_phase1            jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, catalog, public
AS $$
DECLARE
    v_product_id    uuid;
    v_status        text;
    v_close_at      timestamptz;
    v_anon_id       uuid;
BEGIN
    v_product_id := catalog.product_id_for_app_type(p_app_product_type);
    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'No catalog product for app type: %', p_app_product_type;
    END IF;

    -- Deterministic anonymised UUID — one-way, consistent across re-syncs.
    -- Same consumer always maps to the same anon ID so bid matching still works.
    -- The real UUID is never written to the Portal DB.
    v_anon_id := md5(p_consumer_id::text || ':ficium-anon-v1:')::uuid;

    v_status := CASE p_status
        WHEN 'open'      THEN 'bidding'
        WHEN 'accepted'  THEN 'accepted'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'expired'   THEN 'expired'
        WHEN 'closed'    THEN 'expired'
        ELSE 'bidding'
    END;

    v_close_at := COALESCE(p_deadline, p_created_at + interval '48 hours');

    INSERT INTO marketplace.request (
        id, consumer_id, consumer_ref, product_id,
        country, currency, amount, term_months,
        params, status,
        bid_window_opens_at, bid_window_closes_at,
        idempotency_key, source, metadata, created_at
    ) VALUES (
        p_app_request_id,
        v_anon_id,
        LEFT(v_anon_id::text, 8),
        v_product_id,
        'MU', 'MUR',
        p_amount,
        COALESCE(p_term_months, 12),

        -- params: bidding context — what the bank needs to price.
        -- No PII, no raw purpose text, no location.
        jsonb_strip_nulls(jsonb_build_object(
            'app_product_type', p_app_product_type,
            'max_rate',         p_max_rate,
            'loan_purpose',     p_phase1 -> 'loan_purpose',
            'collateral_type',  p_phase1 -> 'collateral_type',
            'collateral_sub',   p_phase1 -> 'collateral_sub',
            'ltv_pct',          p_phase1 -> 'ltv_pct'
        )),

        v_status,
        p_created_at,
        v_close_at,
        p_app_request_id::text,
        'app',

        -- metadata: Ficium-attested Phase 1 verified attributes.
        -- Banks receive these as platform guarantees, not self-reported data.
        jsonb_strip_nulls(jsonb_build_object(
            'ficium_attested',      true,
            'kyc_verified',         p_phase1 -> 'kyc_verified',
            'employment_status',    p_phase1 -> 'employment_status',
            'income_band',          p_phase1 -> 'income_band',
            'income_verified',      p_phase1 -> 'income_verified',
            'dsr_current_pct',      p_phase1 -> 'dsr_current_pct',
            'dsr_post_pct',         p_phase1 -> 'dsr_post_pct',
            'net_worth_band',       p_phase1 -> 'net_worth_band',
            'has_existing_loans',   p_phase1 -> 'has_existing_loans',
            'health_score',         p_phase1 -> 'health_score',
            'risk_score',           p_phase1 -> 'risk_score',
            'affordability_score',  p_phase1 -> 'affordability_score',
            'risk_tier',            p_phase1 -> 'risk_tier'
        )),

        p_created_at
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
        -- Re-anonymise any legacy rows that stored the real UUID
        consumer_id          = EXCLUDED.consumer_id,
        consumer_ref         = EXCLUDED.consumer_ref,
        status               = EXCLUDED.status,
        amount               = EXCLUDED.amount,
        term_months          = EXCLUDED.term_months,
        params               = EXCLUDED.params,
        metadata             = EXCLUDED.metadata,
        bid_window_closes_at = EXCLUDED.bid_window_closes_at,
        updated_at           = now();

    RETURN p_app_request_id;
END;
$$;

COMMENT ON FUNCTION marketplace.ingest_app_request IS
    'Mirror one open consumer request from the App DB into the Portal marketplace. '
    'consumer_id is anonymised (MD5-UUID with salt) — the real UUID is never stored here. '
    'params carries bidding context; metadata carries Ficium-attested Phase 1 attributes.';
