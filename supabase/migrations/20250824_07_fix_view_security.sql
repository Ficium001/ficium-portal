-- =============================================================================
-- Ficium Migration 07 — Set security_invoker on all compat views
-- Fixes the UNRESTRICTED flag on all views that showed safe = false
-- =============================================================================

-- institution compat views
ALTER VIEW institution.institutions              SET (security_invoker = on);
ALTER VIEW institution.institution_members       SET (security_invoker = on);
ALTER VIEW institution.groups                    SET (security_invoker = on);
ALTER VIEW institution.institution_api_keys      SET (security_invoker = on);
ALTER VIEW institution.institution_bids          SET (security_invoker = on);
ALTER VIEW institution.institution_product_config SET (security_invoker = on);
ALTER VIEW institution.institution_webhooks      SET (security_invoker = on);
ALTER VIEW institution.pending_actions_v         SET (security_invoker = on);

-- marketplace
ALTER VIEW marketplace.my_bids                  SET (security_invoker = on);

-- portal_admin compat views
ALTER VIEW portal_admin.admin_dual_control_actions_v SET (security_invoker = on);
ALTER VIEW portal_admin.admin_users_v                SET (security_invoker = on);

-- Verify
SELECT n.nspname AS schema, c.relname AS view,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE) AS safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname IN ('institution','marketplace','portal_admin','admin','catalog','governance','audit')
ORDER BY n.nspname, c.relname;
