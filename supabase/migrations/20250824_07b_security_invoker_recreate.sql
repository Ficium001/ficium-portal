-- =============================================================================
-- Migration 07b — Recreate all compat views WITH (security_invoker = on)
-- ALTER VIEW SET didn't persist — DROP and recreate with the option inline
-- =============================================================================

-- ── institution ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS institution.institutions;
CREATE VIEW institution.institutions
  WITH (security_invoker = on) AS SELECT * FROM institution.institution;
GRANT SELECT ON institution.institutions TO authenticated;

DROP VIEW IF EXISTS institution.institution_members;
CREATE VIEW institution.institution_members
  WITH (security_invoker = on) AS
  SELECT m.*, m.auth_user_id AS user_id,
    CASE WHEN m.active THEN 'active' ELSE 'deactivated' END AS status
  FROM institution.member m;
GRANT SELECT ON institution.institution_members TO authenticated;

DROP VIEW IF EXISTS institution.groups;
CREATE VIEW institution.groups
  WITH (security_invoker = on) AS SELECT * FROM institution."group";
GRANT SELECT ON institution.groups TO authenticated;

DROP VIEW IF EXISTS institution.institution_api_keys;
CREATE VIEW institution.institution_api_keys
  WITH (security_invoker = on) AS SELECT * FROM institution.api_key;
GRANT SELECT ON institution.institution_api_keys TO authenticated;

DROP VIEW IF EXISTS institution.institution_bids;
CREATE VIEW institution.institution_bids
  WITH (security_invoker = on) AS SELECT * FROM marketplace.bid;
GRANT SELECT ON institution.institution_bids TO authenticated;

DROP VIEW IF EXISTS institution.institution_product_config;
CREATE VIEW institution.institution_product_config
  WITH (security_invoker = on) AS SELECT * FROM institution.product_config;
GRANT SELECT ON institution.institution_product_config TO authenticated;

DROP VIEW IF EXISTS institution.institution_webhooks;
CREATE VIEW institution.institution_webhooks
  WITH (security_invoker = on) AS SELECT * FROM institution.webhook;
GRANT SELECT ON institution.institution_webhooks TO authenticated;

DROP VIEW IF EXISTS institution.pending_actions_v;
CREATE VIEW institution.pending_actions_v
  WITH (security_invoker = on) AS
  SELECT * FROM governance.action WHERE scope = 'institution';
GRANT SELECT ON institution.pending_actions_v TO authenticated;

-- ── marketplace ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS marketplace.my_bids;
CREATE VIEW marketplace.my_bids
WITH (security_invoker = on) AS
SELECT
  b.id, b.request_id, b.institution_id,
  b.rate, b.rate_type, b.amount_offered, b.term_months,
  b.conditions, b.fee_structure, b.status, b.submitted_via,
  b.submitted_at, b.expires_at, b.created_at,
  r.product_id,
  r.amount            AS requested_amount,
  r.currency,
  r.term_months       AS requested_term_months,
  r.status            AS request_status,
  r.bid_window_closes_at,
  r.consumer_ref,
  p.label             AS product_label,
  pf.label            AS product_family_label
FROM marketplace.bid             b
JOIN marketplace.request         r  ON r.id  = b.request_id
JOIN catalog.product             p  ON p.id  = r.product_id
JOIN catalog.product_family      pf ON pf.id = p.family_id;
GRANT SELECT ON marketplace.my_bids TO authenticated;

-- ── portal_admin ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS portal_admin.admin_dual_control_actions_v;
CREATE VIEW portal_admin.admin_dual_control_actions_v
  WITH (security_invoker = on) AS
  SELECT * FROM governance.action WHERE scope = 'platform';
GRANT SELECT ON portal_admin.admin_dual_control_actions_v TO authenticated;

DROP VIEW IF EXISTS portal_admin.admin_users_v;
CREATE VIEW portal_admin.admin_users_v
  WITH (security_invoker = on) AS SELECT * FROM admin.user;
GRANT SELECT ON portal_admin.admin_users_v TO authenticated;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT n.nspname AS schema, c.relname AS view,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE) AS safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname IN ('institution','marketplace','portal_admin')
ORDER BY n.nspname, c.relname;
