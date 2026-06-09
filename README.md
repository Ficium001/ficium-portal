# Ficium Portal

**portal.ficium.net** — Single-page application serving all portal users from one URL.

---

## What this app is

Ficium is a reverse-banking marketplace where clients post financing needs and providers (banks, fintechs, insurers) bid. This portal is the **provider-facing and admin-facing** interface. Clients use a separate app (`ficium` repo, `app.ficium.net`).

One URL serves three user types, detected automatically after sign-in:

| User type | Who | After login lands at |
|---|---|---|
| **Institution analyst** | Bank employee — submits bids | `/dashboard` |
| **Institution admin** | Bank compliance officer — approves actions, manages team | `/dashboard` |
| **Ficium admin** | Internal Ficium staff — manages institutions, system | `/admin/dashboard` |

The login page at `/` never asks users which type they are. After authentication, the app looks them up in the database and redirects to the right portal silently.

---

## Architecture overview

```
portal.ficium.net  (one Vercel deployment, one React SPA)
│
├── /             ← UnifiedLogin — single entry point for all users
├── /register     ← Institution registration (public)
├── /onboarding   ← Post-registration document upload wizard
├── /pending      ← Onboarding status tracker (awaiting Ficium approval)
│
├── /dashboard    ─┐
├── /marketplace   │  Institution portal
├── /bids          │  Accessible to: admin, analyst, viewer, compliance roles
├── /approvals     │  Guard: InstitutionRoute (auth + membership + approved)
├── /products      │
├── /webhooks      │
├── /audit         │
├── /settings     ─┘
│
├── /admin/dashboard  ─┐
├── /admin/users       │  Ficium internal admin portal
├── /admin/roles       │  Accessible to: super_admin, institution_mgr,
├── /admin/dual-control│  compliance, support, auditor (role-gated nav)
├── /admin/sessions    │  Guard: AdminRoute (auth + admin_users record + status)
├── /admin/audit       │
├── /admin/system     ─┘
```

### Auth flow

```
User visits portal.ficium.net
        │
        ▼
UnifiedLogin — enter email + password
        │
        ▼
supabase.auth.signInWithPassword()
        │
        ├─ auth fails → show error
        │
        ▼
detectUserType(auth_user_id):
  1. query portal_admin.admin_users → if found → /admin/dashboard
  2. query institution.institution_members → if found → /dashboard
  3. neither → sign out + "not provisioned" error
```

### Database schemas

The Supabase project contains three schemas:

```
public schema          — Ficium client app (requests, clients, etc.)
institution schema     — Institution portal data
  ├── institutions
  ├── institution_members
  ├── institution_products
  ├── pending_actions         ← institution-level maker-checker
  ├── audit_events            ← institution audit log
  ├── marketplace_requests    ← view of open client requests
  └── ...

portal_admin schema    — Ficium internal admin
  ├── admin_users             ← Ficium staff accounts
  ├── admin_roles             ← role definitions + permissions
  ├── admin_sessions          ← session tracking (IP, user agent)
  ├── admin_dual_control_actions ← four-eyes queue (WORM-adjacent)
  └── admin_audit_log         ← WORM audit trail (no UPDATE/DELETE)
```

### Dual-control model

Both portals enforce dual-control on material actions, but they are separate systems:

| | Institution portal | Admin portal |
|---|---|---|
| Table | `institution.pending_actions` | `portal_admin.admin_dual_control_actions` |
| Scope | Bids, webhooks, API keys, team | Users, roles, sessions, system config |
| Self-approval | Blocked (application + RPC) | Blocked (DB constraint + RPC) |
| Audit | `institution.audit_events` | `portal_admin.admin_audit_log` (WORM) |
| TTL | 8 hours | 8 hours |

---

## Source layout

```
src/
├── app/
│   └── routes.tsx              ← All routes, lazy imports, error boundary
│
├── shared/
│   ├── pages/
│   │   └── UnifiedLogin.tsx    ← Single entry point, user-type detection
│   ├── lib/
│   │   ├── supabase.ts         ← Supabase client factory (schema-scoped clients)
│   │   ├── auth.ts             ← signIn / signUp / signOut
│   │   ├── format.ts           ← formatDistanceToNow, formatRate, formatAmount
│   │   └── audit.ts            ← Client-side audit helper
│   ├── ui/                     ← Low-level atoms (Button, Field, Input, Select)
│   └── components/
│       ├── RegisterShell.tsx
│       └── RequestChat.tsx     ← Real-time chat stub
│
├── institution/                ← Institution portal module
│   ├── auth/pages/             ← Register, Pending, Onboarding
│   ├── components/
│   │   ├── InstitutionRoute.tsx         ← Route guard
│   │   ├── InstitutionPortalShell.tsx   ← Layout: sidebar, topbar, status bar
│   │   └── primitives/index.tsx         ← Shared UI atoms (KpiCard, DataTable…)
│   ├── dashboard/pages/
│   ├── marketplace/pages/ + components/  ← RequestDetailDrawer, BidModal
│   ├── bids/pages/
│   ├── approvals/pages/
│   ├── products/pages/
│   ├── webhooks/pages/
│   ├── audit/pages/
│   ├── settings/pages/
│   ├── hooks/
│   │   └── useInstitution.ts   ← All TanStack Query hooks for institution data
│   ├── lib/
│   │   ├── institutionSupabase.ts  ← institution schema client
│   │   └── utils.ts                ← Re-exports from shared/lib/format
│   └── types/
│       └── institution.ts      ← All institution TypeScript types
│
└── admin/                      ← Ficium internal admin module
    ├── auth/pages/             ← (legacy — now routes to UnifiedLogin)
    ├── components/
    │   ├── AdminRoute.tsx          ← Route guard
    │   ├── AdminPortalShell.tsx    ← Dark layout + session guard + keyboard nav
    │   └── primitives/index.tsx    ← Dark-theme UI atoms (AKpiCard, ADataTable…)
    ├── dashboard/pages/
    ├── users/pages/            ← Full lifecycle: create, suspend, unlock, reset…
    ├── roles/pages/            ← Role + permission matrix, custom role builder
    ├── dual-control/pages/     ← Four-eyes queue, payload diff, approve/reject
    ├── sessions/pages/         ← Live session monitor, force-terminate
    ├── audit/pages/            ← WORM log, CSV export
    ├── system/pages/           ← Platform health metrics
    ├── hooks/
    │   └── useAdmin.ts         ← All TanStack Query hooks + dual-control mutations
    ├── lib/
    │   └── adminSupabase.ts    ← portal_admin schema client
    └── types/
        └── admin.ts            ← All admin types + PERMISSION_CATALOGUE + ROLE_PERMISSIONS
```

---

## User roles and access

### Institution portal roles

Assigned per-user in `institution.institution_members.role`:

| Role | What they can do |
|---|---|
| `admin` | Everything: approve dual-control actions, manage team, configure products/webhooks |
| `analyst` | Submit bids (enters maker-checker), view marketplace, view bids |
| `viewer` | Read-only: dashboard, marketplace, bids, audit log |
| `compliance` | Audit log access, read-only portal |

Nav items are hidden if the institution's modules don't include the required feature flag (e.g. `marketplace` module required for Marketplace and Bids).

### Admin portal roles (portal_admin schema)

| Role | Permissions |
|---|---|
| `super_admin` | All 24 permissions |
| `institution_mgr` | View/approve/suspend institutions, manage modules, dual-control approve |
| `compliance` | Read-only: institutions, audit, sessions |
| `support` | View users, unlock accounts, reset passwords, force logout |
| `auditor` | Audit log and dual-control queue read-only |
| `custom` | Any subset of the 24 permissions, defined in `admin_roles` table |

The admin nav hides items the logged-in admin's role doesn't have permission for.

---

## Getting started (development)

### Prerequisites

- Node.js 20+
- A Ficium Supabase project with the institution and portal_admin schemas applied

### Setup

```bash
git clone https://github.com/Ficium001/ficium-portal
cd ficium-portal
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_APP_VERSION=0.1.0
```

```bash
npm install
npm run dev          # http://localhost:5173
```

### Database migrations

Run in order on your Supabase project (SQL editor or CLI):

```bash
# 1. Institution schema (if not already applied from the main ficium repo)
#    This schema is shared — apply only once across both apps.
supabase/migrations/20250701_institution_schema.sql

# 2. Admin schema
supabase/migrations/20250801_portal_admin_schema.sql
```

The admin migration creates the `portal_admin` schema, all tables, RLS policies, RPCs, and seeds the 5 system roles. Run it once; it's idempotent (uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`).

### Creating the first admin user

After running the migration, create the first `super_admin` manually:

```sql
-- 1. Create auth user via Supabase dashboard or CLI
-- 2. Then run:
INSERT INTO portal_admin.admin_users (
  auth_user_id, email, display_name, role_slug, status,
  mfa_enabled, force_password_reset, created_by
) VALUES (
  '<auth-user-uuid>',
  'admin@ficium.mu',
  'Ficium Admin',
  'super_admin',
  'active',
  false,   -- set to true after MFA is configured
  true,    -- force password reset on first login
  '<auth-user-uuid>'
);
```

All subsequent admin users are created through the admin portal UI (via dual-control).

---

## Deployment (Vercel)

```
Framework:     Vite
Build command: npm run build
Output dir:    dist
Domain:        portal.ficium.net
```

Environment variables to set in Vercel:

```
VITE_SUPABASE_URL              (your Supabase project URL)
VITE_SUPABASE_PUBLISHABLE_KEY  (your anon/publishable key)
VITE_APP_VERSION               (e.g. 1.0.0)
```

The app is a pure SPA — add a rewrite rule in Vercel so all paths serve `index.html`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Security model

### Authentication

- All auth via Supabase Auth (JWT, httpOnly session cookie where possible)
- Session storage key: `ficium-portal-auth` (institution and admin share one Supabase project and one auth session)
- Session idle timeout: institution portal 5 min warning / forced at 5 min; admin portal 8 min warning / forced at 10 min
- Admin accounts lock after 5 consecutive failed login attempts (DB trigger)
- MFA: institution users — optional; admin users — enforced (TOTP via Supabase MFA)

### Dual control

Every material write action in both portals creates a pending action record. A second user (not the maker) must approve before execution. Self-approval is blocked at both the application layer and the database constraint layer (`CHECK (checker_id != maker_id)`).

### Audit trail

- Institution: `institution.audit_events` — append-only enforced by RLS (no `UPDATE`/`DELETE` policies)
- Admin: `portal_admin.admin_audit_log` — append-only enforced by Postgres `RULE` (`audit_log_no_update`, `audit_log_no_delete`) plus RLS

Both logs record actor identity, IP address, resource ID, state before/after, and outcome. CSV export available in both portals.

### Row-level security

Every table has RLS enabled. Helper functions (`is_admin()`, `has_permission()`, `my_role_slug()`) gate access. Schema clients are scoped (`db('institution')`, `db('portal_admin')`) — no cross-schema data leakage via the frontend.

---

## Key design decisions

**Why one app?** Simpler to maintain, one deploy, one Vercel project, one set of environment variables. The user-type detection on login adds ~200ms but eliminates the need to maintain separate domains, CORS configs, and deploy pipelines.

**Why the admin portal has a dark theme?** Visual separation from the analyst portal signals elevated privilege context to the user — a human factor control. Misclicking into admin actions is less likely when the UI looks different.

**Why dual-control everywhere?** FSC Mauritius requires four-eyes on material financial system actions. Implementing it at the database level (not just UI) means it can't be bypassed by API calls.

**Why no localStorage for session?** Supabase uses its own secure storage. We don't add another layer. The `ficium-portal-auth` key differentiates from the client app's session if both are open.

**Why is the admin `dual_control_actions` table separate from `institution.pending_actions`?** Different risk profiles, different expiry logic, different executor functions. Mixing them would make the RLS and audit trail harder to reason about and audit.

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon key |
| `VITE_APP_VERSION` | No | Shown in admin login footer |

---

## Scripts

```bash
npm run dev        # Start dev server on :5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```
