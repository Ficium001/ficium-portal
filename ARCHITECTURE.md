# Ficium Platform — Architecture

_Last updated: 15 June 2026_

This document is the system of record for how the Ficium platform fits together: the services, how they authenticate, where data lives, and how a request flows end to end. It reflects the **currently deployed** state, not an aspirational design.

---

## 1. What Ficium is

Ficium is a **reverse banking marketplace**. Individuals and businesses post financial requests (loans, deposits, FX, trade finance); banks and fintechs compete to fulfil them. There are two distinct products:

| Product | Audience | Purpose |
|---------|----------|---------|
| **Ficium App** | Consumers (public) | Post requests, receive and compare provider bids |
| **Ficium Portal** | Institutions + Ficium staff | Bid on requests, manage products, run maker‑checker approvals, administer the platform |

The App and the Portal are separate frontends backed by separate data stores. They communicate over REST when the Portal needs live marketplace data from the App.

---

## 2. Services at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│                          FICIUM PORTAL                            │
│              (React SPA — Vercel — ficium-portal.vercel.app)      │
│                                                                   │
│   Auth: ficium-auth (RS256 JWT in sessionStorage)                 │
│   Data: ficium-portal-api (institution data, RLS)                 │
│         institution Supabase (cross-project reads: marketplace)   │
└───────────┬───────────────────────────────┬──────────────────────┘
            │                               │
            │ POST /auth/login              │ GET /institutions/me
            │ (credentials → RS256 JWT)     │ (Bearer JWT → data)
            ▼                               ▼
┌────────────────────────┐      ┌──────────────────────────────────┐
│      ficium-auth       │      │       ficium-portal-api          │
│  (FastAPI — Railway)   │      │      (FastAPI — Railway)         │
│                        │      │                                  │
│  • Argon2id passwords  │      │  • Verifies JWT via JWKS         │
│  • RS256 JWT issuance  │      │  • Sets request.jwt.claims       │
│  • JWKS endpoint       │◄─────┤  • Queries with RLS enforced     │
│  • MFA, sessions       │ JWKS │  • Maker-checker RPCs            │
│  • Redis (rate limit,  │      │                                  │
│    session store)      │      │                                  │
└───────────┬────────────┘      └──────────────┬───────────────────┘
            │                                  │
            ▼                                  ▼
┌────────────────────────┐      ┌──────────────────────────────────┐
│   auth_portal schema   │      │     institution schema           │
│   (Supabase Postgres)  │      │     (same Supabase Postgres)     │
│                        │      │                                  │
│  • auth_users          │      │  • institutions                  │
│  • auth_sessions       │      │  • institution_members           │
│  • mfa_backup_codes     │      │  • groups                        │
│  • password_reset_*    │      │  • pending_actions               │
│  • auth_audit_events   │      │  • portal_admin.* (RPCs)         │
└────────────────────────┘      └──────────────────────────────────┘
```

**Three deployable services**, all live:

1. **ficium-auth** — authentication service. Issues RS256 JWTs, owns the `auth_portal` schema, runs on Railway with Redis.
2. **ficium-portal-api** — portable data API. Verifies ficium‑auth tokens against the JWKS, queries the `institution` schema with row‑level security enforced, exposes the maker‑checker RPCs. Runs on Railway.
3. **ficium-portal** — the React SPA. Deployed on Vercel. Authenticates against ficium‑auth, reads institution data from ficium‑portal‑api, and reads cross‑project marketplace data directly from the institution Supabase project.

---

## 3. Authentication architecture (RS256 + JWKS)

Authentication moved off Supabase Auth onto a self‑owned service, **ficium-auth**. This is the load‑bearing architectural decision of the platform.

### Why RS256 (asymmetric) and not HS256 (shared secret)

- **ficium-auth** holds the **private key** and is the only service that can mint tokens.
- **ficium-portal-api** (and any future consumer) verifies tokens with the **public key**, fetched from ficium‑auth's JWKS endpoint. No shared secret ever leaves ficium‑auth.
- Adding a new token consumer requires zero secret distribution — it just reads the public JWKS.

### The JWKS endpoint

`ficium-auth` exposes its public key at:

```
GET https://ficium-auth-production.up.railway.app/.well-known/jwks.json
```

Response:
```json
{
  "keys": [{
    "kty": "RSA", "use": "sig", "alg": "RS256",
    "kid": "ficium-auth-rs256-v1",
    "n": "…", "e": "AQAB"
  }]
}
```

`ficium-portal-api` fetches and caches this on startup; every incoming token's `kid` header is matched against it to verify the signature.

### Token claims

Each access token carries:

| Claim | Meaning |
|-------|---------|
| `sub` | The user's id (= `auth_users.id` = `institution_members.auth_user_id`) |
| `iss` | `ficium-auth` |
| `aud` | `ficium-portal` |
| `role` | `authenticated` (Supabase‑compatible — lets `auth.uid()` work in RLS) |
| `user_role` | Application role: `super_admin`, `institution_admin`, etc. |
| `institution_id` | The user's institution (placeholder UUID for platform admins) |
| `email` | Used by the Portal shell to display the user's name |
| `session_id`, `deployment`, `jti`, `iat`, `exp` | Session + standard JWT bookkeeping |

### The Supabase‑compatibility trick

The Portal's entire data‑access security model — RLS policies, `current_member_ctx()`, the maker‑checker functions — resolves the caller through `auth.uid()`, which reads the `request.jwt.claims` GUC. On Supabase, PostgREST sets that GUC. Off PostgREST, **ficium-portal-api sets it itself** per request:

```sql
SELECT set_config('request.jwt.claims', '<verified JWT payload>', true);
```

Because the token's `sub` and `role` claims mirror what Supabase Auth would have issued, **every existing RLS policy and SECURITY DEFINER function works unchanged.** This is why the migration required no rewrite of the database security layer.

> Note: `ficium-portal-api` does **not** issue `SET LOCAL ROLE authenticated`. Supabase's transaction pooler (pgbouncer) resets session state between transactions and the pooler user cannot switch roles. RLS policies check `auth.uid()` (which reads the GUC), not `current_role`, so this is correct and matches how PostgREST itself behaves.

---

## 4. Request lifecycle (end to end)

A user loading their institution dashboard:

1. **Login.** The SPA posts credentials to `ficium-auth` `POST /auth/login`. ficium‑auth verifies the Argon2id password hash, issues an RS256 access token (+ refresh cookie), and stores the access token in `sessionStorage`.
2. **Route guard.** `PortalRoute` reads the token locally, then calls `ficium-portal-api` `GET /institutions/me` with `Authorization: Bearer <token>`.
3. **Token verification.** ficium‑portal‑api matches the token's `kid` to the cached JWKS, verifies the RS256 signature, and checks `iss` / `aud` / `exp`.
4. **Gate decision.** For platform admins it returns immediately by role. For institution users it opens a tenant‑scoped DB session, sets `request.jwt.claims`, and queries `institution.institutions` under RLS to return `approved` / `suspended` / `pending` status.
5. **Shell + nav.** `PortalShell` calls `GET /members/my-group` to resolve the user's module permissions (via the `portal_admin.get_my_group()` SECURITY DEFINER RPC) and renders the navigation accordingly.
6. **Marketplace data.** `useMarketplace` and `useMyBids` read directly from the institution Supabase project (cross‑project marketplace views), not from ficium‑portal‑api.

---

## 5. Data ownership & multi-tenancy

The platform is **multi-tenant SaaS**. Every provider/institution is segregated:

- Every tenant‑scoped table carries `institution_id NOT NULL`.
- RLS is **enabled and FORCED** on tenant tables, scoped to the caller's institution via `current_member_ctx()`.
- Composite indexes lead with `institution_id`.
- A cross‑tenant guard trigger blocks assigning a member to another institution's group, regardless of write path.

### Schema map

| Schema | Owner | Contents |
|--------|-------|----------|
| `auth_portal` | ficium-auth | users, sessions, MFA, password‑reset & verification tokens, auth audit |
| `institution` | ficium-portal-api | institutions, members, groups, pending_actions |
| `portal_admin` | ficium-portal-api | admin RPCs, dual‑control actions, `get_my_group`, `get_institutions` |

---

## 6. Deployment topology

| Service | Platform | URL |
|---------|----------|-----|
| ficium-portal | Vercel | `ficium-portal.vercel.app` |
| ficium-auth | Railway | `ficium-auth-production.up.railway.app` |
| ficium-portal-api | Railway | `ficium-portal-api-production.up.railway.app` |
| Postgres + Auth tables | Supabase | project `egwobcajdlragubtkpqp` (institution) |
| Redis | Railway | private service, attached to ficium-auth |

### Deployment models supported

`ficium-portal-api` is built to be **portable** across three models:

1. **SaaS** (current) — Supabase Postgres, shared multi‑tenant.
2. **Client cloud** — the institution's own managed Postgres.
3. **On‑premises** — Postgres inside the institution's network.

For non‑Supabase Postgres, the `db/000_auth_shim.sql` script recreates the `auth.uid()` / `auth.jwt()` helpers and the `authenticated` role that Supabase provides natively, so the same RLS policies run unchanged. (On Supabase this shim is skipped — the platform owns those objects.)

---

## 7. Connection details that matter

These are the non‑obvious operational facts that have bitten us:

- **Supabase direct connection (port 5432) is blocked** from external IPs on the free plan. `ficium-portal-api` connects via the **transaction pooler (port 6543)** using `psycopg2` (not asyncpg, which requires a direct connection).
- The pooler host is region‑specific: `aws-1-ap-southeast-1.pooler.supabase.com`. The pooler **username** must be `postgres.<project-ref>`, not plain `postgres`.
- **Git authorship:** all commits must use `kishan.jeebun@ficium.net` as the author email, or Vercel blocks the deployment.
- **`tsc -b` strictness:** Vercel's build enforces `noUnusedLocals` and `erasableSyntaxOnly`. No parameter properties, enums, or namespaces; no unused imports. Local `tsc --noEmit` is laxer, so a clean local check can still fail on Vercel.
- **Vercel Hobby plan** caps serverless functions at 12.

---

## 8. Current migration status

The platform has moved from "all Supabase Auth + PostgREST" to "self‑owned ficium‑auth + ficium‑portal‑api," in stages:

| Stage | Scope | Status |
|-------|-------|--------|
| 1–2 | ficium-auth (RS256, JWKS), ficium-portal-api scaffolding | ✅ Done |
| 3 | PortalRoute + useMyInstitution → portal-api | ✅ Done |
| 4 | Institution hooks → portal-api | ✅ Done |
| 4b | Login, shell, useMyGroup → ficium-auth; marketplace/bids/products kept on Supabase (cross‑project) | ✅ Done |
| 4c | `GroupsTab`, `InstitutionUsers` (groups CRUD + user provisioning) → portal-api | ⏳ Pending |
| 5 | Admin dashboard tree → portal-api | ⏳ Pending |

### Why marketplace/bids/products stay on Supabase

These read data that lives in the **Ficium App's** Supabase project (consumer requests, live bids), not the institution project. They are cross‑project reads and correctly use the Supabase client directly; they were never meant to route through ficium‑portal‑api.
