-- =============================================================================
-- Migration 07c — Transfer view ownership to authenticated role
-- In Supabase, views owned by `postgres` bypass RLS (BYPASSRLS privilege).
-- security_invoker=on has no effect when the owner is postgres.
-- Solution: alter view owner to `authenticated` so RLS applies correctly.
-- =============================================================================

-- institution compat views
ALTER VIEW institution.institutions               OWNER TO authenticated;
ALTER VIEW institution.institution_members        OWNER TO authenticated;
ALTER VIEW institution.groups                     OWNER TO authenticated;
ALTER VIEW institution.institution_api_keys       OWNER TO authenticated;
ALTER VIEW institution.institution_bids           OWNER TO authenticated;
ALTER VIEW institution.institution_product_config OWNER TO authenticated;
ALTER VIEW institution.institution_webhooks       OWNER TO authenticated;
ALTER VIEW institution.pending_actions_v          OWNER TO authenticated;

-- marketplace
ALTER VIEW marketplace.my_bids                   OWNER TO authenticated;

-- portal_admin
ALTER VIEW portal_admin.admin_dual_control_actions_v OWNER TO authenticated;
ALTER VIEW portal_admin.admin_users_v                OWNER TO authenticated;

-- Verify: reloptions should now show security_invoker=true
-- AND relowner should be authenticated
SELECT
  n.nspname                                                        AS schema,
  c.relname                                                        AS view,
  COALESCE(c.reloptions @> ARRAY['security_invoker=true'], FALSE)  AS security_invoker,
  pg_get_userbyid(c.relowner)                                      AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname IN ('institution','marketplace','portal_admin')
ORDER BY n.nspname, c.relname;
