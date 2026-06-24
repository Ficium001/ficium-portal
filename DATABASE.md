# Ficium Portal — Database

_Last updated: 24 June 2026_

This document describes the **currently deployed** database that backs the
Portal: the schemas, the tenancy and security model, the maker-checker
machinery, and the portability story. It is the current-state companion to
`supabase/SCHEMA_DESIGN.md` (which is the target-state design rationale). Where
the two differ, **this document wins** for "what is live today."

The canonical DDL is `supabase/migrations/20250823_ficium_schema_v2.sql`
("DEFINITIVE DATABASE SCHEMA v2.0"). Everything after it is incremental
hardening, RLS fixes, and the compat-view retirement (migration 12).

---

## 1. Shape of the database

A single Postgres instance (Supabase project `egwobcajdlragubtkpqp`) hosting
**seven bounded-context schemas**, one owner per schema:

| Schema | Owns | Written by | Read by |
|--------|------|------------|---------|
| `identity` | Profiles, MFA, IP allowlist, reset/verification tokens, login events | Auth layer | Each user (own row) |
| `catalog` | Global product reference data + modules (platform-owned) | Platform admin | Everyone |
| `institution` | Tenants and their internal org (members, groups, config, webhooks, KYB) | Tenant admins (maker-checker) | Tenant members (own tenant) |
| `marketplace` | Requests, bids, bid lifecycle, acceptances | Consumers + tenants | Both sides (scoped) |
| `governance` | Unified maker-checker / dual-control action queue | Any actor | Approvers (scoped) |
| `admin` | Ficium internal staff, roles, sessions, system group templates | Super admin | Admin staff |
| `audit` | One immutable, append-only event log | All (via trigger) | Compliance / admin |

`portal_admin` still exists as a **thin RPC-compatibility layer**. Its function
bodies were refactored in migration 12 to read the v2 tables (`institution.*`,
`governance.*`), so the API surface (`get_my_group`, `get_institutions`, the
dual-control RPCs) is stable while the storage underneath is v2. It is a
deliberate seam, not dead weight — see §6.

> Table names are **singular nouns**, unprefixed: `institution.member`, not
> `institution.institution_members`. The schema already provides the namespace.

---

## 2. Conventions (enforced across every table)

These are invariants, not guidelines:

- **UUID primary keys** (`gen_random_uuid()`), except natural-key lookups
  (`catalog.country.code`, `catalog.currency.code`, `catalog.regulator.code`,
  `catalog.module.key`).
- **`created_at` / `updated_at`** on every mutable table; `updated_at` driven by
  a `set_updated_at()` trigger.
- **Money is `NUMERIC(20,6)`** — never floating point anywhere near a monetary
  value.
- **Enums are `CHECK` constraints, not Postgres `ENUM` types** — far cheaper to
  extend without a migration lock.
- **JSONB for genuinely extensible config**; typed columns for anything you need
  to query or index.
- **Secrets are never stored in plaintext** — `key_hash` / `secret` columns hold
  hashes only.
- **Cross-schema reads go through `SECURITY DEFINER` functions** that own the
  boundary — application code never reaches across a schema with RLS disabled.

---

## 3. Multi-tenancy and row-level security

The platform is **pool-model multi-tenant**: all tenants share tables,
segregated by `institution_id` with forced RLS. The schema-per-tenant path is
preserved (no global state bleeds into tenant rows) but not currently taken.

Every tenant-scoped table satisfies all three:

1. **`institution_id NOT NULL`.**
2. **RLS `ENABLE` + `FORCE`** — `FORCE` matters: it applies the policy even to
   the table owner, so a `SECURITY DEFINER` function cannot accidentally leak
   across tenants.
3. **Composite indexes lead with `institution_id`.**

### The recursion-safe context function

RLS policies resolve the caller's tenant and role through
`institution.current_member_ctx()` (`SECURITY DEFINER`). Doing the member
lookup inside a definer function — rather than a subquery against
`institution.member` inside the policy itself — is what avoids the classic
"policy on a table that queries the same table" infinite-recursion trap.
`current_member_ctx()` reads `auth.uid()` (from `request.jwt.claims`) and
returns the member id, institution id, and effective module set.

### A cross-tenant write guard

`institution.enforce_member_group_tenant()` is a trigger that blocks assigning a
member to a group belonging to a different institution — regardless of the write
path (API, RPC, or direct SQL). Defence in depth on top of the RLS policies.

---

## 4. The schemas in detail

### `identity`
`profile` (PK → `auth.users`, `status` ∈ active/locked/suspended/deactivated),
`mfa_backup_code`, `ip_allowlist`, `password_reset_token`,
`email_verification_token`, `login_event` (outcome ∈ success/failed/blocked/…).
Rooted on `auth.users` so existing Supabase auth helpers resolve; see §6 for the
ficium-auth interplay and the known split-brain.

### `catalog` (platform-owned, read-mostly)
`regulator`, `country`, `currency` (natural-key lookups); `product_family` →
`product` → (`product_parameter`, `product_rate_model`, `product_sla`,
`product_eligibility`, `product_document`); `module` (`side` ∈
institution/admin/both). No RLS — `GRANT SELECT` to `authenticated`, writes
restricted to platform admin. Per-tenant overrides live in
`institution.product_config` and FK **up** to `catalog.product`.

### `institution` (tenant data)
`institution` (type, country → `catalog.country`, regulator, deployment_model,
onboarding_stage, compliance/approval status), `member`, `group`
(`module_permissions text[]`, system vs custom), `api_key` (`key_hash` only),
`webhook` + `webhook_delivery`, `product_config`, `kyb_document`. Every table:
`institution_id NOT NULL`, RLS ENABLE + FORCE, `institution_id`-leading indexes.

### `marketplace` (the matching core)
`request` → `bid` (real FK `bid.request_id → request.id`), `bid_event`
(append-only state transitions, protected by
`marketplace.block_bid_event_mutation`), `acceptance`. `ingest_app_request()`
brings consumer-side requests into the marketplace context. Bids carry an
idempotency key to dedupe API submissions.

### `governance` (unified maker-checker)
`action` — one queue for both tenant ("institution" scope) and platform
("platform" scope) privileged mutations. `governance.submit()` enqueues;
`institution.approve_action()` / `reject_action()` decide; `_execute_action()`
applies the change with a `CASE` on action category and writes the audit row.
`expire_stale_actions()` ages out undecided actions.

### `admin` (Ficium internal)
`user`, `role`, `session`, `system_group` (the platform-defined **group
templates** — `institution_admin`, `super_admin`, etc.). Helpers: `is_admin()`,
`has_permission()`, `my_role_slug()`, `get_my_group()`.

### `audit` (immutable log)
`event` (occurred_at, actor + actor_type, institution_id nullable, action,
resource, outcome, metadata jsonb, ip, user_agent). `audit.log()` writes;
`audit.block_mutation()` is an `UPDATE`/`DELETE` trigger that enforces WORM
semantics. Append-only is a compliance requirement (BOM/FSC review), not a
nicety.

---

## 5. Group resolution (the part that confuses)

A member's effective module permissions resolve in this order:

1. `institution.member.custom_group_id` → the tenant's own custom group **wins**.
2. else `institution.member.system_group_id` → an `admin.system_group` template.
3. else the empty module set.

The Portal shell reads the resolved set via the `get_my_group()` RPC and renders
navigation from it. This is the single source of truth for what a user can see.

---

## 6. Auth model and the known split-brain

Two facts coexist and you must hold both:

- **Tokens** are minted by **ficium-auth** (RS256, Argon2id, MFA) and verified
  by `ficium-portal-api`, which sets `request.jwt.claims` per request so
  `auth.uid()` resolves. See `ARCHITECTURE.md` §3.
- **The `identity` schema roots `profile` on `auth.users`** (Supabase Auth's
  table), and ficium-auth additionally owns an `auth_portal.*` schema.

That is the **identity split-brain** flagged in `SCHEMA_DESIGN.md` §"identity"
and addressed by ADR-002 (identity backfill). **Open item:** pick one source of
truth — ficium-auth as root (retire `auth.users` dependence) or Supabase Auth as
root (retire `auth_portal`) — and migrate before broad onboarding. Do not run
both indefinitely. Until resolved, the `sub` claim is kept identical across both
identity spaces so RLS resolves correctly.

---

## 7. Portability (lift-and-shift)

`ficium-portal-api` is built to run against three database substrates without a
schema rewrite: Supabase (SaaS, current), the client's managed Postgres, or
on-prem Postgres. The portability seam is **`db/000_auth_shim.sql`** (in the
`ficium-portal-api` repo): on non-Supabase Postgres it recreates the
`auth.uid()` / `auth.jwt()` helpers and the `authenticated` role that Supabase
provides natively, so **every RLS policy and `SECURITY DEFINER` function in this
schema runs unchanged**. On Supabase the shim is skipped. This is why the schema
carries no Supabase-specific coupling beyond those two helpers.

---

## 8. Migrations

SQL migrations live in `supabase/migrations/`, applied in filename order. The
meaningful checkpoints:

- `20250823_ficium_schema_v2.sql` — the definitive v2 schema (start here).
- `20250824_*` — schemas + catalog, admin, identity, institution v2,
  marketplace, governance/audit, view-security hardening.
- `20250825_08_cleanup_and_harden.sql` — drops the superseded
  `institution.product_*` tables (moved to `catalog`) and legacy audit/webhook
  tables.
- `20250825_12_refactor_off_compat_views.sql` — repoints all functions onto v2
  tables and **drops the 10 compatibility views**. This migration also fixed a
  live bug where approve/reject read the old `institution.pending_actions` while
  submissions landed in `governance.action`, so every approval failed with
  "Action not found."

Run migrations in the Supabase SQL editor (or via the API) in order. For a
non-Supabase target, apply `db/000_auth_shim.sql` first.

---

## 9. Open items (tracked)

- **Resolve the identity split-brain** (§6) before broad onboarding — ADR-002.
- **Re-hash migrated bcrypt users to Argon2id** (carried over from the auth
  migration).
- **`institution.pending_actions`** is superseded by `governance.action`;
  confirm it carries no remaining reads and drop it.
- **`portal_admin.*`** is intentionally retained as a compat RPC layer; fold it
  into `admin.*` only once the admin frontend tree is fully migrated.
