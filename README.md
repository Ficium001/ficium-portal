# ficium-portal

Institution-facing React SPA for the Ficium platform. Serves both institution users (banks, fintechs) and Ficium platform staff. One URL; the portal type is detected from the authenticated user.

**Production:** `ficium-portal.vercel.app` · **Stack:** React + Vite + TypeScript + Tailwind · **Auth:** ficium-auth RS256 JWT

---

## Quick start

```bash
npm install
cp .env.example .env
# set VITE_AUTH_URL, VITE_PORTAL_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

### Build

```bash
npm run build   # tsc -b && vite build
```

> Always run `npm run build` before pushing. `tsc -b` enforces `noUnusedLocals`, `erasableSyntaxOnly`, and `verbatimModuleSyntax` — a clean `--noEmit` can still fail the Vercel build.

> **Git authorship:** commits must use `kishan.jeebun@ficium.net` as author — Vercel rejects other authors.

---

## Environment variables

| Variable | Notes |
|---|---|
| `VITE_AUTH_URL` | ficium-auth base URL (`https://ficium-auth-production.up.railway.app`) |
| `VITE_PORTAL_API_URL` | ficium-portal-api base URL (`https://ficium-portal-api-production.up.railway.app`) |
| `VITE_SUPABASE_URL` | Institution Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (for cross-project marketplace reads) |

---

## Auth flow

1. `UnifiedLogin` posts credentials to ficium-auth via `src/shared/lib/ficiumAuth.ts` (`signIn`)
2. RS256 token stored in `sessionStorage`
3. `GET /institutions/me` detects whether user is institution member or platform admin
4. Routed accordingly — institution workspace or admin panel
5. `PortalRoute` guards all authenticated routes
6. `PortalShell` reads display name from JWT payload, resolves nav modules via `GET /members/my-group`

Key files: `ficiumAuth.ts` (token lifecycle), `portalApi.ts` (authenticated fetch), `UnifiedLogin.tsx`, `PortalRoute.tsx`, `PortalShell.tsx`.

---

## Data sources

**Via ficium-portal-api** (institution schema, RLS enforced):
- `useMyInstitution`, `useMyRole`, `useInstitutionUsers`
- `usePendingActions`, `useApproveAction`, `useRejectAction`
- `useSubmitBid` (maker), `useWebhooks`, `useAuditEvents`
- All pipeline and document management hooks

**Via Supabase directly** (cross-project reads from Ficium App DB):
- `useMarketplace` — open consumer requests
- `useMyBids` — institution's own bids
- `useProducts` — product catalogue

---

## Institution bid flow

1. Maker goes to Marketplace → sees open consumer requests
2. Clicks "Bid" → fills rate, amount, term → `POST /approvals/submit { action: 'bid.submit' }`
3. Checker goes to Approvals → reviews → `POST /approvals/{id}/approve`
4. Portal DB `marketplace.bid` row created atomically
5. `trg_bid_notify` fires → consumer notified via pg_net → Vercel → Resend email

---

## Documentation

| Doc | Scope |
|---|---|
| `README.md` | This file |
| `ARCHITECTURE.md` | **Full platform architecture** (services, flows, data split, security) |
| `DATABASE.md` | Portal DB schema — institution, marketplace, governance, catalog schemas |
| `DESIGN.md` | UX, navigation-as-RBAC, design system, component patterns |
| `INSTALLATION.md` | Environment setup and configuration |

---

## Project layout

```
src/
  shared/
    lib/          ficiumAuth.ts, portalApi.ts, supabase.ts
    pages/        UnifiedLogin.tsx
    components/   PortalRoute.tsx, PortalShell.tsx, RegisterShell.tsx
    ui/           Button, Card, Field, dashboard kit
  institution/
    hooks/        useInstitution.ts (all data fetching)
    marketplace/  Request list + bid submission
    bids/         Bid management
    approvals/    Maker-checker approval queue
    pipeline/     Loan pipeline tracker
    products/     Product catalogue
    team/         Members + groups
    settings/     Institution settings
    auth/         Institution onboarding
  admin/
    hooks/        useAdmin.ts
    institutions/ Institution management
    users/        User management
    audit/        Platform audit log
  app/            routes.tsx, query-client.ts
supabase/
  migrations/     Institution schema + RPCs
```
