# Ficium Portal — Installation & Deployment

A from-scratch runbook to stand up the full Portal stack: database, ficium-auth, ficium-portal-api, and the frontend. Follow the steps in order — later services depend on earlier ones.

_Last updated: 27 June 2026_

---

## Overview

Deploy in this order:

1. **Database** (Supabase Postgres) — auth + institution schemas
2. **ficium-auth** (Railway + Redis) — issues RS256 tokens
3. **ficium-portal-api** (Railway) — serves institution data, verifies tokens
4. **ficium-portal** (Vercel) — the frontend

Total time for a clean setup: ~45 minutes.

---

## Prerequisites

- Supabase account with the institution project (`egwobcajdlragubtkpqp` in production)
- Railway account
- Vercel account
- GitHub access to `Ficium001/ficium-auth`, `ficium-portal-api`, `ficium-portal`
- Python 3.12 locally (to generate RSA keys)

---

## Step 1 — Database (Supabase)

### 1a. Apply the auth schema

In the Supabase SQL editor, run:

```
ficium-auth/migrations/001_auth_portal_schema.sql
```

Creates the `auth_portal` schema (`auth_users`, `auth_sessions`, MFA, tokens, audit). Idempotent.

### 1b. Apply the institution + portal schemas

From `ficium-portal/supabase/migrations/`, run in filename order:

```
20250801_portal_admin_schema.sql
20250802_user_groups.sql
20250812_institutions_approval.sql
20250813_fix_get_institutions.sql
20250814_fix_get_institutions_jsonb.sql
20250815_fix_registration_permissions.sql
20250816_fix_member_policy_recursion.sql
20250817_default_member_group.sql
20250818_institution_groups_phase2.sql
20250819_pending_actions_maker_checker.sql
20250820_fix_get_my_group_active_col.sql
20250821_institution_bids_marketplace.sql
20250822_schema_redesign.sql
20250823_ficium_schema_v2.sql
20250824_01_schemas_and_catalog.sql
20250824_02_admin_schema.sql
20250824_03_identity_schema.sql
20250824_04_institution_v2.sql
20250824_04b_institution_v2_fix.sql
20250824_05_marketplace_schema.sql
20250824_06_governance_and_audit.sql
20250824_07_fix_view_security.sql
20250824_07b_security_invoker_recreate.sql
20250824_07c_view_owner.sql
20250825_08_cleanup_and_harden.sql
20250825_08e_member_updated_at_and_backfill.sql
20250825_09_authenticated_grants.sql
20250825_10_catalog_read_policies.sql
20250825_11_app_schema_usage.sql
20250825_12_refactor_off_compat_views.sql
20250825_13_marketplace_bid_insert.sql
20250825_14_seed_catalog_products.sql
20250825_15_marketplace_request_ingest.sql
20250825_16_phase1_sync_payload.sql
```

### 1c. Apply portal-api DB files

From `ficium-portal-api/db/`, run in order:

```
001_workflow.sql             — workflow/maker-checker helpers
003_expiry_notify.sql        — close_expired_windows() + pg_net dispatch
004_accept_bid_reveal.sql    — accept_bid() returns bid financials
```

> **Do NOT run `db/000_auth_shim.sql` on Supabase.** That is for non-Supabase Postgres only — Supabase already provides `auth.*` natively.

### 1d. Get the pooler connection string

Settings → Database → Connection string → **Transaction pooler** tab:

```
postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

URL-encode any special characters in the password (`@` → `%40`). The username must be `postgres.<ref>`, not `postgres`.

### 1e. Configure Vault secrets (for pg_net notification triggers)

```sql
-- Run in Supabase SQL editor on the App DB (wixfhjlsjkiwfvqewvmt)
-- Required for the bid_notify trigger to reach ficium-portal-api
SELECT vault.create_secret(
  'https://ficium-portal-api-production.up.railway.app',
  'portal_api_url'
);
SELECT vault.create_secret('<APP_SERVICE_SECRET>', 'app_service_secret');
```

---

## Step 2 — ficium-auth (Railway)

### 2a. Generate RSA keypair

```bash
cd ficium-auth
python scripts/generate_rsa_keys.py
# → prints JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (full PEM blocks)
```

Copy both — you'll paste them into Railway.

### 2b. Create Railway service

New Project → Deploy from GitHub → `Ficium001/ficium-auth`. Railway builds the Dockerfile.

Add a **Redis service** to the same project.

### 2c. Set environment variables

```
ENV                   = production
DB_URL                = postgresql+asyncpg://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
REDIS_URL             = <from Railway Redis service>
REDIS_PASSWORD        = <from Railway Redis service>
JWT_PRIVATE_KEY       = <full PEM private key — multiline>
JWT_PUBLIC_KEY        = <full PEM public key — multiline>
JWT_ALGORITHM         = RS256
JWT_ISSUER            = ficium-auth
JWT_AUDIENCE          = authenticated
SUPABASE_URL          = https://<ref>.supabase.co
SUPABASE_SERVICE_KEY  = <service role key>
RESEND_API_KEY        = <resend key>
ALLOWED_ORIGINS       = https://ficium-portal.vercel.app,https://ficium.vercel.app
ALLOWED_ORIGIN_REGEX  = ^https://ficium-portal[a-z0-9.\-]*\.vercel\.app$
```

> **Critical:** do NOT set `SUPABASE_JWT_SECRET`. Its presence forces HS256; its absence enables RS256. The architecture requires RS256.

> **JWT_AUDIENCE:** must be `authenticated` (not `ficium-portal`). This matches `auth.role()` expectations in downstream RLS and what ficium-auth actually issues.

### 2d. Verify

```bash
curl https://ficium-auth-production.up.railway.app/health
# → {"status":"healthy","checks":{"database":true,"redis":true}}

curl https://ficium-auth-production.up.railway.app/.well-known/jwks.json
# → {"keys":[{"kid":"ficium-auth-rs256-v1","kty":"RSA",...}]}
```

---

## Step 3 — ficium-portal-api (Railway)

### 3a. Create Railway service

In the same Railway project, add a new service → GitHub → `Ficium001/ficium-portal-api`.

### 3b. Set environment variables

```
DATABASE_URL          = postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
APP_DATABASE_URL      = postgresql://postgres.<app-ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
APP_SERVICE_SECRET    = <shared secret — same value set in Vercel + Supabase Vault>
AUTH_JWKS_URL         = https://ficium-auth-production.up.railway.app/.well-known/jwks.json
AUTH_ISSUER           = ficium-auth
AUTH_AUDIENCE         = authenticated
ALLOWED_ORIGINS       = https://ficium-portal.vercel.app,https://ficium.vercel.app
ALLOWED_ORIGIN_REGEX  = ^https://ficium-portal[a-z0-9.\-]*\.vercel\.app$
DEPLOYMENT_MODEL      = saas
```

> `APP_DATABASE_URL` connects to the **App DB** (`wixfhjlsjkiwfvqewvmt`) for marketplace sync and Phase 2 PII fetch.

### 3c. Generate public domain

Service → Settings → Networking → Generate Domain → target port **8000**.

### 3d. Verify

```bash
curl https://ficium-portal-api-production.up.railway.app/health
# → {"status":"ok","env":"production","model":"saas"}

curl -i https://ficium-portal-api-production.up.railway.app/members/my-group
# → 401 Missing bearer token   ← auth gate confirmed

# End-to-end token test
TOKEN=$(curl -s -X POST https://ficium-auth-production.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@institution.mu","password":"<password>"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

curl -s https://ficium-portal-api-production.up.railway.app/institutions/me \
  -H "Authorization: Bearer $TOKEN"
# → {"user_type":"institution_admin","approved":true,...}
```

---

## Step 4 — ficium-portal (Vercel)

### 4a. Import repo

Import `Ficium001/ficium-portal` into Vercel.

### 4b. Set environment variables

```
VITE_AUTH_URL                  = https://ficium-auth-production.up.railway.app
VITE_PORTAL_API_URL            = https://ficium-portal-api-production.up.railway.app
VITE_SUPABASE_URL              = https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY  = <anon key>
```

### 4c. Deploy and verify

Build command: `npm run build` · Output: `dist/`

Open `https://ficium-portal.vercel.app` → log in → confirm dashboard loads.

> **Git authorship:** commits must use `kishan.jeebun@ficium.net` as git author or Vercel rejects the build.

---

## Step 5 — Provision institution users

ficium-auth users live in `auth_portal.auth_users` with Argon2id password hashes.

To create a test user, generate an Argon2id hash (parameters: `time_cost=3, memory_cost=65536, parallelism=4, hash_len=32`) and insert directly:

```sql
-- Run on institution Supabase DB
INSERT INTO auth_portal.auth_users (
  id, institution_id, email, email_verified,
  password_hash, role, is_active
) VALUES (
  gen_random_uuid(),
  '<institution_id from institution.institution>',
  'user@institution.mu',
  TRUE,
  '<argon2id hash>',
  'institution_admin',
  TRUE
);
```

Then ensure the user has a row in `institution.member` with a group assignment so navigation modules resolve.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| JWKS → 404 | JWKS route not wired | Check `src/api/jwks.py` is in `main.py` |
| JWKS → `InvalidPadding` | Malformed `JWT_PUBLIC_KEY` | Regenerate keypair, re-paste full PEM into Railway |
| `/institutions/me` → 401 "Invalid audience" | `AUTH_AUDIENCE` mismatch | Set both ficium-auth and portal-api to `authenticated` |
| `/institutions/me` → 500 pooler error | Wrong username/host | Use `postgres.<ref>` + exact pooler host |
| pg_net not reaching portal-api | Vault secrets not set | Run vault secret SQL on App DB |
| Bid notification not firing | `trg_bid_notify` missing | Apply `ficium-portal-api/db/003_expiry_notify.sql` on Portal DB |
| CORS blocked on Vercel preview | Preview origin not in allowlist | Set `ALLOWED_ORIGIN_REGEX` on both Railway services |
| Login → "Incorrect password" for known user | bcrypt hash from old Supabase Auth | Re-hash password as Argon2id |
| Vercel build fails `erasableSyntaxOnly` | Enum/namespace in `api/*.ts` | Replace with `const` objects |
| Vercel deploy rejected | Wrong git author | Commit as `kishan.jeebun@ficium.net` |

---

## Service URLs (production)

| Service | URL |
|---|---|
| Ficium Portal | `https://ficium-portal.vercel.app` |
| Ficium App | `https://ficium.vercel.app` |
| ficium-auth | `https://ficium-auth-production.up.railway.app` |
| ficium-portal-api | `https://ficium-portal-api-production.up.railway.app` |
| Institution DB | `egwobcajdlragubtkpqp.supabase.co` (ap-southeast-1) |
| App DB | `wixfhjlsjkiwfvqewvmt.supabase.co` (ap-south-1) |
