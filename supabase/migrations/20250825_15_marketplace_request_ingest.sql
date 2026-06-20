-- Migration 15 — marketplace.ingest_app_request: upsert an app-DB request into
-- marketplace.request, idempotent on the app request id (shared as PK and
-- idempotency_key). Maps product_type via catalog.product_id_for_app_type.
-- No consumer PII copied (only consumer_id uuid + truncated consumer_ref).
-- SECURITY DEFINER, service-only (REVOKEd from PUBLIC). Called by the
-- portal-api POST /marketplace/sync-requests endpoint.
-- See git / DB for the full body applied via apply_migration.

CREATE OR REPLACE FUNCTION marketplace.ingest_app_request(
  p_app_request_id uuid, p_consumer_id uuid, p_app_product_type text,
  p_amount numeric, p_term_months integer, p_purpose text, p_max_rate numeric,
  p_decision_deadline timestamptz, p_status text, p_created_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = marketplace, catalog, public AS $$
DECLARE v_product_id uuid; v_status text; v_close_at timestamptz;
BEGIN
  v_product_id := catalog.product_id_for_app_type(p_app_product_type);
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'No catalog product resolves for app type %', p_app_product_type;
  END IF;
  v_status := CASE p_status
    WHEN 'open' THEN 'bidding' WHEN 'accepted' THEN 'accepted'
    WHEN 'cancelled' THEN 'cancelled' WHEN 'expired' THEN 'expired'
    WHEN 'closed' THEN 'expired' ELSE 'bidding' END;
  v_close_at := COALESCE(p_decision_deadline, p_created_at + interval '48 hours');
  INSERT INTO marketplace.request (
    id, consumer_id, consumer_ref, product_id, country, currency,
    amount, term_months, params, status, bid_window_opens_at, bid_window_closes_at,
    idempotency_key, source, created_at
  ) VALUES (
    p_app_request_id, p_consumer_id, LEFT(p_consumer_id::text, 8), v_product_id,
    'MU', 'MUR', p_amount, COALESCE(p_term_months, 12),
    jsonb_strip_nulls(jsonb_build_object('purpose', p_purpose, 'max_rate', p_max_rate,
      'app_product_type', p_app_product_type)),
    v_status, p_created_at, v_close_at, p_app_request_id::text, 'app', p_created_at
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    status = EXCLUDED.status, amount = EXCLUDED.amount,
    term_months = EXCLUDED.term_months, params = EXCLUDED.params,
    bid_window_closes_at = EXCLUDED.bid_window_closes_at, updated_at = now();
  RETURN p_app_request_id;
END; $$;
REVOKE ALL ON FUNCTION marketplace.ingest_app_request(uuid,uuid,text,numeric,integer,text,numeric,timestamptz,text,timestamptz) FROM PUBLIC;
