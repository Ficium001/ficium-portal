# Ficium Portal — Installation & Deployment Guide

A from‑scratch runbook to stand up the full Portal stack: database, ficium‑auth, ficium‑portal‑api, and the frontend. Follow the steps in order — later services depend on earlier ones.

_Last updated: 15 June 2026_

---

## Overview

You will deploy, in this order:

1. **Database** (Supabase Postgres) — schemas for auth and institution data
2. **ficium-auth** (Railway + Redis) — issues RS256 tokens
3. **ficium-portal-api** (Railway) — serves institution data, verifies tokens
4. **ficium-portal** (Vercel) — the frontend

Total time for a clean setup: ~45 minutes.

---

## Prerequisites

- Supabase account + project
- Railway account
- Vercel account
- GitHub access to `Ficium001/ficium-auth`, `ficium-portal-api`, `ficium-portal`
- Python 3.12 locally (to generate RSA keys)

---

## Step 1 — Database (Supabase)

1. Create (or open) the Supabase project. Note the **project ref** (e.g. `egwobcajdlragubtkpqp`).

2. **Apply the auth schema.** In the Supabase SQL editor, run:
   ```
   ficium-auth/migrations/001_auth_portal_schema.sql
   ```
   This creates the `auth_portal` schema (`auth_users`, `auth_sessions`, MFA, token, and audit tables). Idempotent.

3. **Apply the institution + admin schemas.** From `ficium-portal/supabase/migrations/`, run in filename order:
   ```
   20250801_portal_admin_schema.sql
   20250802_user_groups.sql
   20250812_institutions_approval.sql
   20250813 … 20250820 (the fix + phase2 + maker-checker migrations)
   ```

4. **Get the pooler connection string.** Settings → Database → Connection string → **Transaction pooler** tab. It looks like:
   ```
   postgresql://postgres.<ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
   Note the host region and that the username is `postgres.<ref>`. You'll need this twice.

> **On Supabase you do NOT run `db/000_auth_shim.sql`.** That shim is only for non‑Supabase Postgres (client cloud / on‑prem), where the `auth` schema and `authenticated` role don't already exist.

---

## Step 2 — ficium-auth (Railway)

1. **Generate an RSA keypair** locally:
   ```bash
   cd ficium-auth
   python scripts/generate_rsa_keys.py
   ```
   Copy the printed `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` (full PEM blocks).

2. **Create the Railway project.** New → Deploy from GitHub repo → `ficium-auth`. Railway builds the Dockerfile.

3. **Add a Redis service** to the same project.

4. **Set environment variables** on the ficium-auth service:
   ```
   ENV                  = production
   DB_URL               = postgresql+asyncpg://postgres.<ref>:<pw>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
   REDIS_URL            = <from the Railway Redis service>
   REDIS_PASSWORD       = <from the Railway Redis service>
   JWT_PRIVATE_KEY      = <PEM private key>
   JWT_PUBLIC_KEY       = <PEM public key>
   JWT_ALGORITHM        = RS256
   JWT_ISSUER           = ficium-auth
   JWT_AUDIENCE         = ficium-portal
   SUPABASE_URL         = https://<ref>.supabase.co
   SUPABASE_SERVICE_KEY = <service role key>
   RESEND_API_KEY       = <resend key>
   ALLOWED_ORIGINS      = https://ficium-portal.vercel.app
   ```
   > **Critical:** do NOT set `SUPABASE_JWT_SECRET`. Its presence forces HS256; its absence enables RS256, which the architecture requires.

5. **Verify:**
   ```bash
   curl https://ficium-auth-production.up.railway.app/health
   # → {"status":"healthy","checks":{"database":true,"redis":true}}

   curl https://ficium-auth-production.up.railway.app/.well-known/jwks.json
   # → {"keys":[{"kid":"ficium-auth-rs256-v1",...}]}
   ```

---

## Step 3 — ficium-portal-api (Railway)

1. In the **same Railway project**, add a new service → GitHub repo → `ficium-portal-api`.

2. **Set environment variables:**
   ```
   DATABASE_URL          = postgresql://postgres.<ref>:<pw>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
   AUTH_JWKS_URL         = https://ficium-auth-production.up.railway.app/.well-known/jwks.json
   AUTH_ISSUER           = ficium-auth
   AUTH_AUDIENCE         = ficium-portal
   ALLOWED_ORIGINS       = https://ficium-portal.vercel.app
   ALLOWED_ORIGIN_REGEX  = ^https://ficium-portal[a-z0-9\-]*\.vercel\.app$
   DEPLOYMENT_MODEL      = saas
   ```
   > URL‑encode special characters in the DB password (`@` → `%40`). Use the **transaction pooler (6543)**, username `postgres.<ref>`, exact pooler host from the dashboard.

3. **Generate a public domain.** Service → Settings → Networking → Generate Domain → set target port to **8000**.

4. **Verify:**
   ```bash
   curl https://ficium-portal-api-production.up.railway.app/health
   # → {"status":"ok","service":"ficium-portal-api",...}

   curl -i https://ficium-portal-api-production.up.railway.app/members/my-group
   # → 401 Missing bearer token   (proves the auth gate works)
   ```

5. **End‑to‑end token test:**
   ```bash
   TOKEN=$(curl -s -X POST https://ficium-auth-production.up.railway.app/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@ficium.mu","password":"<password>"}' \
     | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
   curl -s https://ficium-portal-api-production.up.railway.app/institutions/me \
     -H "Authorization: Bearer $TOKEN"
   # → {"user_type":"admin","approved":true,...}
   ```

---

## Step 4 — ficium-portal (Vercel)

1. Import the `ficium-portal` repo into Vercel.

2. **Set environment variables:**
   ```
   VITE_AUTH_URL                 = https://ficium-auth-production.up.railway.app
   VITE_PORTAL_API_URL           = https://ficium-portal-api-production.up.railway.app
   VITE_SUPABASE_URL             = https://<ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY = <anon key>
   ```

3. Build command is `npm run build` (already in `vercel.json` / `package.json`). Deploy.

4. **Verify:** open `https://ficium-portal.vercel.app`, log in with a provisioned user, confirm the dashboard loads.

> Commits to this repo must use `kishan.jeebun@ficium.net` as the git author email or Vercel rejects the build.

---

## Step 5 — Provision users

ficium‑auth users live in `auth_portal.auth_users` with **Argon2id** password hashes. Users migrated from Supabase Auth have bcrypt hashes and will not authenticate until re‑hashed.

To create or fix a test user, set an Argon2id hash directly (generate it with the same parameters ficium‑auth uses — `time_cost=3, memory_cost=65536, parallelism=4, hash_len=32`):

```sql
INSERT INTO auth_portal.auth_users (
  id, institution_id, email, email_verified, password_hash, role, is_active
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM institution.institutions LIMIT 1),
  'user@institution.mu',
  TRUE,
  '<argon2id hash>',
  'institution_admin',
  TRUE
);
```

Then assign the member to a group in `institution.institution_members` so the navigation resolves modules.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/.well-known/jwks.json` → 404 | JWKS route not deployed | Confirm `src/api/jwks.py` is wired into `main.py` |
| JWKS → `InvalidPadding` / `Unable to load PEM` | Malformed `JWT_PUBLIC_KEY` | Regenerate the keypair, re‑paste full PEM into Railway |
| `/institutions/me` → 401 "Invalid audience" | `AUTH_AUDIENCE` ≠ token `aud` | Set both to `ficium-portal` |
| `/institutions/me` → 500, log shows `tenant/user … not found` | Wrong pooler username/host | Use `postgres.<ref>` + exact pooler host (`aws-1-…`) |
| `/institutions/me` → 500, log shows `Network is unreachable` | Using direct connection (5432) | Switch to transaction pooler (6543) |
| `relation "…marketplace_requests" does not exist` | Querying a cross‑project view from portal‑api | Those reads belong on the Supabase client, not portal‑api |
| CORS blocked on preview URL | Preview origin not allowed | Set `ALLOWED_ORIGIN_REGEX` for Vercel previews |
| Login → "Incorrect email or password" for a known user | bcrypt hash from old Supabase Auth | Re‑hash the password as Argon2id |
| Vercel build fails `TS1294` / `erasableSyntaxOnly` | Parameter property / enum / namespace | Rewrite as explicit field assignment |
| Vercel build fails on unused import | `noUnusedLocals` under `tsc -b` | Remove the unused import |
| Vercel rejects deploy | Wrong git author email | Commit as `kishan.jeebun@ficium.net` |

---

## Service reference

| Service | URL |
|---------|-----|
| Portal | `https://ficium-portal.vercel.app` |
| ficium-auth | `https://ficium-auth-production.up.railway.app` |
| ficium-portal-api | `https://ficium-portal-api-production.up.railway.app` |
