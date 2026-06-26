# Ficium Portal — DB Migrations (Institution DB)

Target database: **Supabase Institution DB** (`egwobcajdlragubtkpqp` · `ap-southeast-1`)

All migrations are applied via the **Supabase SQL editor** in filename order. They are idempotent where possible.

> Additional DB files that must also be applied to this DB live in `ficium-portal-api/db/` — see the portal-api repo for `001_workflow.sql`, `003_expiry_notify.sql`, and `004_accept_bid_reveal.sql`.

---

## Run order

| File | Purpose |
|------|---------|
| `20250801_portal_admin_schema.sql` | `portal_admin` schema — initial admin tables |
| `20250802_user_groups.sql` | Group model for institution staff |
| `20250812_institutions_approval.sql` | Institution approval state |
| `20250813_fix_get_institutions.sql` | Fix `get_institutions()` RPC |
| `20250814_fix_get_institutions_jsonb.sql` | Fix JSONB return type |
| `20250815_fix_registration_permissions.sql` | RLS grants for registration flow |
| `20250816_fix_member_policy_recursion.sql` | Fix RLS infinite recursion on member policies |
| `20250817_default_member_group.sql` | Auto-assign default group on member creation |
| `20250818_institution_groups_phase2.sql` | Group Phase 2 — module access control |
| `20250819_pending_actions_maker_checker.sql` | `governance.action` table — maker-checker queue |
| `20250820_fix_get_my_group_active_col.sql` | Fix `active` column reference in `get_my_group()` |
| `20250821_institution_bids_marketplace.sql` | Bid tables (pre-v2, superseded by v2 schema) |
| `20250822_schema_redesign.sql` | Schema redesign — bounded contexts |
| `20250823_ficium_schema_v2.sql` | v2 schema base |
| `20250824_01_schemas_and_catalog.sql` | `catalog.*` schema + product families + products |
| `20250824_02_admin_schema.sql` | `admin.*` schema |
| `20250824_03_identity_schema.sql` | `identity.*` schema |
| `20250824_04_institution_v2.sql` | `institution.*` v2 — institutions, members, groups |
| `20250824_04b_institution_v2_fix.sql` | Fix institution v2 constraints |
| `20250824_05_marketplace_schema.sql` | `marketplace.*` — request, bid, bid_acceptance, pipeline |
| `20250824_06_governance_and_audit.sql` | `governance.*` + `audit.*` schemas |
| `20250824_07_fix_view_security.sql` | SECURITY INVOKER on views |
| `20250824_07b_security_invoker_recreate.sql` | Recreate views with correct security |
| `20250824_07c_view_owner.sql` | Fix view ownership |
| `20250825_08_cleanup_and_harden.sql` | RLS hardening, index cleanup |
| `20250825_08e_member_updated_at_and_backfill.sql` | Add `updated_at` to member + backfill |
| `20250825_09_authenticated_grants.sql` | Grants for `authenticated` role |
| `20250825_10_catalog_read_policies.sql` | RLS read policies on catalog |
| `20250825_11_app_schema_usage.sql` | App schema usage grants |
| `20250825_12_refactor_off_compat_views.sql` | Remove compatibility views |
| `20250825_13_marketplace_bid_insert.sql` | Bid insert policies + `marketplace.bid` hardening |
| `20250825_14_seed_catalog_products.sql` | Seed product catalogue (credit_card, mortgage, etc.) |
| `20250825_15_marketplace_request_ingest.sql` | `marketplace.ingest_app_request()` function |
| `20250825_16_phase1_sync_payload.sql` | Phase 1 sync payload enrichment |

### After: portal-api DB files (same DB)

Run these from `ficium-portal-api/db/` on this same database:

| File | Purpose |
|------|---------|
| `001_workflow.sql` | Workflow/maker-checker helpers |
| `003_expiry_notify.sql` | `close_expired_windows()` — fires `request-expired` pg_net on expiry |
| `004_accept_bid_reveal.sql` | `accept_bid()` — adds rate/amount/term to return payload |

> **Do NOT run `db/000_auth_shim.sql` on Supabase.** That is for non-Supabase Postgres only.

---

## Schema map

| Schema | Tables | Owner |
|--------|--------|-------|
| `auth_portal` | `auth_users`, `auth_sessions`, `mfa_*`, `password_reset_*`, `auth_audit_events` | ficium-auth |
| `catalog` | `product_family`, `product`, `module` | Ficium platform |
| `institution` | `institution`, `member`, `group`, `pipeline_template`, `pipeline_stage_def`, `institution_sla_config` | Institution admins (maker-checker) |
| `marketplace` | `request`, `bid`, `bid_acceptance`, `bid_benefit`, `bid_event`, `loan_pipeline`, `pipeline_stage_instance`, `acceptance` | Platform |
| `governance` | `action` | Maker-checker workflow |
| `bid_notify` | `dispatch()`, `on_bid_insert()` | pg_net trigger — fires bid-notify Vercel handler |
| `audit` | `event` | Append-only audit log |
| `admin` | Admin config tables | Ficium platform admin |
| `portal_admin` | Admin RPCs | ficium-portal-api |

---

## Key functions

| Function | Schema | Purpose |
|---|---|---|
| `ingest_app_request()` | `marketplace` | Sync consumer request from App DB |
| `accept_bid(request_id, bid_id, consumer_id, phase2_pii)` | `marketplace` | Atomic bid acceptance — accepts winner, rejects others, writes PII, creates pipeline |
| `close_expired_windows()` | `marketplace` | Close expired bid windows; fires `request-expired` pg_net for zero-bid requests |
| `create_pipeline_from_acceptance()` | `marketplace` | Auto-create loan pipeline from institution template on acceptance |
| `submit_for_approval()` | `governance` | Queue an action for maker-checker |
| `approve_action()` | `governance` | Approve + execute (checker) |
| `reject_action()` | `governance` | Reject (checker) |
| `get_my_group()` | `portal_admin` | Resolve authenticated member's group + modules |
| `dispatch(bid_id)` | `bid_notify` | Fire pg_net → Vercel `/api/internal` { action: bid-notify } |

---

## RLS design

Every institution-scoped table:
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- Policies key on `institution_id` resolved via `auth.uid()` → `institution.member.user_id`
- `service_role` has unrestricted access
- Marketplace tables are visible to the owning institution only

The `bid_notify.*` functions run as `SECURITY DEFINER` so they can read vault secrets and fire pg_net from within RLS-enforced sessions.

---

## Non-Supabase (on-prem) load order

1. `ficium-portal-api/db/000_auth_shim.sql` — recreates `auth.uid()`, `auth.jwt()`, `authenticated`/`anon` roles
2. All `supabase/migrations/*.sql` files in filename order
3. `ficium-portal-api/db/001_workflow.sql`
4. `ficium-portal-api/db/003_expiry_notify.sql`
5. `ficium-portal-api/db/004_accept_bid_reveal.sql`
