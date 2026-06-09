# Ficium Portal — Architecture

> Last updated: August 2025  
> Scope: `ficium-portal` repository only. For the client app (`ficium`), see that repo's ARCHITECTURE.md.

---

## 1. System context

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FICIUM PLATFORM                             │
│                                                                     │
│  ┌──────────────────┐        ┌──────────────────────────────────┐  │
│  │  ficium (client) │        │  ficium-portal (this repo)       │  │
│  │  app.ficium.net  │        │  portal.ficium.net               │  │
│  │                  │        │                                  │  │
│  │  Individual      │        │  Institution analysts  ─────┐   │  │
│  │  clients post    │        │  Institution admins    ─────┤   │  │
│  │  financing       │        │  Ficium internal admins ───┘   │  │
│  │  requests        │        │  (all detected at login)        │  │
│  └────────┬─────────┘        └──────────────┬───────────────────┘  │
│           │                                 │                       │
│           └────────────┬────────────────────┘                       │
│                        ▼                                            │
│              ┌─────────────────┐                                    │
│              │    Supabase     │                                    │
│              │  PostgreSQL     │                                    │
│              │  ├─ public      │  ← client app data               │
│              │  ├─ institution │  ← institution portal data        │
│              │  └─ portal_admin│  ← admin portal data             │
│              └─────────────────┘                                    │
│                                                                     │
│              ┌─────────────────┐                                    │
│              │  ficium-rating  │  Railway (FastAPI)                │
│              │  engine         │  ML credit scoring                │
│              └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Application architecture

### 2.1 Single-page application

Ficium Portal is a React 19 SPA built with Vite. One HTML file is served for every URL; React Router handles client-side routing. This means:

- One Vercel deployment, one build artifact
- One set of environment variables
- One Supabase project connection
- All code is split by route (lazy imports) — users only download code for pages they access

### 2.2 User detection flow

```
GET portal.ficium.net/*
        │
        ▼
  React SPA loads
        │
        ▼
  UnifiedLogin (/login or /)
  ┌─────────────────────────────────┐
  │  Enter email + password         │
  │  supabase.auth.signInWithPassword│
  └──────────┬──────────────────────┘
             │
    ┌────────▼──────────┐
    │  detectUserType() │
    │                   │
    │  1. query         │
    │  portal_admin.    │──→ found → /admin/dashboard
    │  admin_users      │
    │                   │
    │  2. query         │
    │  institution.     │──→ found → /dashboard
    │  institution_     │
    │  members          │
    │                   │
    │  3. neither       │──→ sign out + error
    └───────────────────┘
```

No URL prefix, no user-type selector, no separate login pages. The system determines access from the database.

### 2.3 Module structure

The codebase is split into three modules under `src/`:

```
src/
├── shared/          Pure utilities, shared clients, UnifiedLogin
├── institution/     Institution portal (all /dashboard etc. routes)
└── admin/           Admin portal (all /admin/* routes)
```

Each module is self-contained: its own types, hooks, Supabase client, UI primitives, and pages. Cross-module imports are only allowed for:
- `shared/lib/supabase.ts` (schema client factory)
- `shared/lib/format.ts` (formatting utilities)
- `shared/pages/UnifiedLogin.tsx` (imports both institution and admin clients)

### 2.4 Supabase client architecture

```typescript
// shared/lib/supabase.ts
const supabase = createClient(url, key, {
  auth: { storageKey: 'ficium-portal-auth' }  // one auth session
})

export function db(schema: string): SupabaseClient {
  // Returns schema-scoped client sharing the same auth session
}

export const institutionDb = db('institution')   // institution module uses this
export const adminDb       = db('portal_admin')  // admin module uses this
```

One Supabase project, one auth session, multiple schema clients. RLS policies on each schema enforce what authenticated users can see.

---

## 3. Institution portal

### 3.1 Route guard

`InstitutionRoute` verifies before rendering any protected page:

1. Supabase session exists
2. `institution.institution_members` record exists for this auth user
3. `institutions.suspended_at` is null
4. `institutions.approved` is true → if not, redirect to `/pending`

### 3.2 Role-based access

Institution roles are stored in `institution.institution_members.role`:

```
admin     → can approve pending_actions, manage team, configure products/webhooks
analyst   → can submit bids (maker), view marketplace
viewer    → read-only across all pages
compliance→ audit log access
```

Pages and nav items are hidden based on institution `modules` array (feature flags per institution): a bank without the `marketplace` module cannot see the Marketplace or Bids pages regardless of role.

### 3.3 Institution-level dual control

Every material write creates a `pending_action` record. A second admin (not the maker) approves it in the Approvals page. The RPC `submit_for_approval()` enforces:

- Caller must be an authenticated institution member
- Self-approval blocked (application layer + RPC check)
- All actions appended to `institution.audit_events`
- TTL: 8 hours (cron or manual `expire_pending_actions()` call)

### 3.4 Data flow (example: bid submission)

```
Analyst clicks "Submit bid"
        │
        ▼
BidModal form validates
        │
        ▼
useSubmitBid().mutateAsync()
        │
        ▼
institutionDb.rpc('submit_for_approval', {
  p_action_category: 'bid.submit',
  p_payload: { rate, amount, term, ... }
})
        │
        ▼
pending_actions row created (status: pending)
        │
        ▼
Approvals page shows action to institution admin
        │
        ▼
Admin approves → execute_action() RPC → bid placed on marketplace
All steps written to audit_events
```

---

## 4. Admin portal

### 4.1 Route guard

`AdminRoute` verifies before rendering:

1. Supabase session exists
2. `portal_admin.admin_users` record exists with `status = 'active'`
3. Account not locked, suspended, or deactivated

Session `last_active_at` is updated on every route change.

### 4.2 Permission model

24 granular permission keys across 6 categories. Each role has a fixed permission set (system roles) or a custom set (custom roles). The admin nav dynamically hides items the user's role cannot access.

```
Permission key format:  resource:action
Examples:
  users:create          users:suspend      users:unlock
  users:reset_password  users:role_change  users:deactivate
  roles:create          roles:edit         roles:delete
  institutions:approve  institutions:suspend
  dual_control:approve  audit:export       sessions:terminate
  system:config
```

`super_admin` has `permissions = ['*']` — all permission checks pass.

### 4.3 Admin dual control

Every write in the admin portal goes through `portal_admin.admin_submit_dual_control()`. No action executes immediately.

```
Admin initiates action (e.g. suspend user)
        │
        ▼
useAdminMutation().mutateAsync(payload)
        │
        ▼
adminDb.rpc('admin_submit_dual_control', {
  action_category: 'user.suspend',
  risk: 'high',
  resource_type: 'admin_user',
  payload: { admin_user_id, suspension_reason }
})
        │
        ▼
admin_dual_control_actions row created
  maker_id = caller
  maker_ip = session IP
  status = 'pending'
  expires_at = now + 8h
        │
        ▼
Second admin (checker ≠ maker) sees it in Dual Control page
        │
        ▼
admin_approve_dual_control(action_id)
  → validates checker ≠ maker (DB constraint blocks this)
  → validates has_permission('dual_control:approve')
  → calls _execute_dual_control_action(action_id)
  → dispatches by action_category
  → updates admin_users / admin_sessions as appropriate
  → writes to admin_audit_log
```

### 4.4 WORM audit log

`portal_admin.admin_audit_log` is truly append-only:

```sql
CREATE RULE audit_log_no_update AS ON UPDATE TO portal_admin.admin_audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO portal_admin.admin_audit_log DO INSTEAD NOTHING;
```

Even with service role access, UPDATE and DELETE silently do nothing. Only INSERT is permitted. This is not RLS — it's a Postgres RULE, which operates below the RLS layer.

### 4.5 Session tracking

Every admin login creates an `admin_sessions` row recording IP address, user agent, city, and country. The shell sends a heartbeat every 60 seconds to update `last_active_at`. Sessions are terminated:

- On user logout (`end_reason: logout`)
- On idle timeout in the shell (`end_reason: timeout`)
- By a second admin via the Sessions page (`end_reason: forced`, via dual-control)

---

## 5. Security controls summary

| Control | Institution portal | Admin portal |
|---|---|---|
| Authentication | Supabase JWT | Supabase JWT |
| MFA | Optional | Required (TOTP) |
| Session idle timeout | 5 min warn / 5 min force | 8 min warn / 10 min force |
| Failed login lockout | n/a (Supabase handles) | 5 attempts → auto-lock (DB trigger) |
| Dual control | ✓ institution.pending_actions | ✓ admin_dual_control_actions |
| Self-approval block | Application layer | Application + DB constraint |
| Audit trail | institution.audit_events | portal_admin.admin_audit_log |
| Audit immutability | RLS (no update/delete policies) | Postgres RULE (no update/delete) |
| IP logging | n/a | ✓ sessions + dual_control |
| Row-level security | ✓ all tables | ✓ all tables |
| Schema isolation | institution schema | portal_admin schema |

---

## 6. Data architecture

### 6.1 Institution schema (key tables)

```
institution.institutions           — institution master record
institution.institution_members    — users and their roles
institution.pending_actions        — dual-control queue
institution.audit_events           — append-only audit log
institution.institution_products   — product catalogue with rate limits
institution.institution_webhooks   — webhook endpoints
institution.marketplace_requests   — VIEW: open client requests
institution.my_bids                — VIEW: institution's bids
```

### 6.2 portal_admin schema

```
portal_admin.admin_users                  — Ficium staff accounts
portal_admin.admin_roles                  — role definitions
portal_admin.admin_sessions               — session tracking
portal_admin.admin_dual_control_actions   — four-eyes queue
portal_admin.admin_audit_log              — WORM audit trail
```

### 6.3 Supabase helper functions

Institution schema:
```sql
institution.submit_for_approval(p_action_category, p_resource_type, p_payload)
institution.approve_action(p_action_id)
institution.reject_action(p_action_id, p_note)
institution.expire_pending_actions()  -- run via pg_cron
```

portal_admin schema:
```sql
portal_admin.is_admin()
portal_admin.has_permission(p_key)
portal_admin.my_role_slug()
portal_admin.admin_submit_dual_control(...)
portal_admin.admin_approve_dual_control(p_action_id, p_note)
portal_admin.admin_reject_dual_control(p_action_id, p_note)
portal_admin._execute_dual_control_action(p_action_id)
portal_admin.expire_dual_control_actions()  -- run via pg_cron
```

---

## 7. Frontend architecture

### 7.1 State management

TanStack Query v5 for all server state. No Redux or Zustand. Query keys are defined in a `QK` registry at the top of each hooks file to keep invalidation predictable.

```typescript
// institution/hooks/useInstitution.ts
export const QK = {
  institution:  ['institution', 'me'],
  bids:         ['institution', 'bids'],
  marketplace:  ['institution', 'marketplace'],
  pendingActions: ['institution', 'pending-actions'],
  ...
}
```

### 7.2 Primitive component strategy

Each module has its own primitive layer:

- `institution/components/primitives/index.tsx` — light cream theme (KpiCard, DataTable, Modal, etc.)
- `admin/components/primitives/index.tsx` — dark navy theme (AKpiCard, ADataTable, AModal, etc.)

Pages import from their module's primitives. Pages are thin orchestrators — no inline component definitions, no business logic.

### 7.3 Code splitting

Every route is `lazy()`-wrapped. Vite splits by import boundary. The heaviest page chunk (InstitutionMarketplace) is ~24 KB gzip. Vendor libraries split into stable chunks (react, supabase, query, ui) that cache across deploys.

```
vendor-react.js     275 KB gzip:88 KB   — React + React DOM
vendor-supabase.js  200 KB gzip:51 KB   — Supabase client
vendor-ui.js        106 KB gzip:32 KB   — Lucide + form libs
vendor-query.js      43 KB gzip:13 KB   — TanStack Query
[per-page chunks]    2–25 KB gzip        — loaded on navigation
```

### 7.4 Error handling

A `ChunkErrorBoundary` wraps every lazy route. If a chunk fails to load (common after a deploy when the user has an old tab open), it reloads the page once automatically then shows a manual reload button.

---

## 8. Deployment architecture

```
GitHub (ficium-portal main branch)
        │
        ▼ (push / PR merge)
Vercel (automatic deploy)
        │
        ▼
portal.ficium.net (Vercel CDN)
  ├── / → dist/index.html (all routes → SPA)
  ├── /assets/* → immutable hashed JS/CSS chunks
  └── /_vercel/* → Vercel internals
```

**Vercel config** (`vercel.json`):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**No server-side rendering.** All API calls go directly from the browser to Supabase. There is no Next.js or edge function between the browser and the database.

---

## 9. pg_cron setup (recommended)

Schedule these functions in Supabase via pg_cron to keep the queues clean:

```sql
-- Expire institution pending actions every hour
SELECT cron.schedule('expire-institution-actions', '0 * * * *',
  'SELECT institution.expire_pending_actions()');

-- Expire admin dual-control actions every hour
SELECT cron.schedule('expire-admin-dc-actions', '0 * * * *',
  'SELECT portal_admin.expire_dual_control_actions()');

-- Clean up stale admin sessions nightly
SELECT cron.schedule('cleanup-admin-sessions', '0 2 * * *', $$
  UPDATE portal_admin.admin_sessions
  SET is_active = false, ended_at = now(), end_reason = 'expired'
  WHERE is_active = true AND last_active_at < now() - INTERVAL '24 hours'
$$);
```

---

## 10. Known gaps (pre-launch)

| Gap | Impact | Notes |
|---|---|---|
| `ficium.net` email domain not verified in Resend | Emails sent from `onboarding@resend.dev` | Verify domain in Resend dashboard |
| Admin MFA enforced at UI only | An admin could bypass TOTP if calling API directly | Enable Supabase MFA enforcement at project level |
| `institution_onboarding_prefs` table not in migration | `InstitutionOnboarding` step 3 upsert will fail | Add table to migration or create manually |
| `RequestChat` is a stub | Chat tab in request detail drawer shows placeholder | Wire to Supabase realtime on `requests.{id}` channel |
| No pg_cron scheduled | Expired actions accumulate | Set up cron jobs (Section 9) |
| No error monitoring | Unhandled exceptions invisible | Add Sentry before first institution user |
