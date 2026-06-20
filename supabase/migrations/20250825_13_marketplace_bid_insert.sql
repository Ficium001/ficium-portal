-- =============================================================================
-- Migration 13 — enable institution bid submission (was fully blocked).
-- POST /marketplace/bids runs via tenant_conn (authenticated), but marketplace.bid
-- had no INSERT grant and no INSERT policy — every bid submission failed with 403.
-- Institutions are the bidders; this is the core marketplace write path.
--
-- Grant INSERT + add an INSERT policy scoped so an institution can only insert
-- bids under its own institution_id (via current_member_ctx). Verified: legit
-- bid succeeds, cross-tenant bid blocked by WITH CHECK, full bid loop works
-- (submit → my_bids → public consumer endpoint).
-- =============================================================================

GRANT INSERT ON marketplace.bid TO authenticated;

DROP POLICY IF EXISTS marketplace_bid_insert ON marketplace.bid;
CREATE POLICY marketplace_bid_insert ON marketplace.bid
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id = (
      SELECT ctx.institution_id
      FROM institution.current_member_ctx()
        ctx(member_id, institution_id, is_admin, member_role, modules)
    )
  );
