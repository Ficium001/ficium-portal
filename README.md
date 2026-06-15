# ficium-portal

The Ficium Portal frontend — a single React SPA serving both institution users (banks, fintechs) and Ficium platform staff. One URL; the portal type is detected automatically from the authenticated user.

Built with React + Vite + TypeScript + Tailwind. Deployed on Vercel.

---

## Architecture in one paragraph

The Portal authenticates against **ficium-auth** (RS256 JWT stored in `sessionStorage`), reads institution‑scoped data from **ficium-portal-api** (which enforces RLS), and reads cross‑project marketplace data directly from the **institution Supabase** project. There is no Supabase Auth in the login path anymore. See the platform‑level `ARCHITECTURE.md` for the full picture, and `ARCHITECTURE.md` in this repo for frontend specifics.

---

## Auth flow

1. `UnifiedLogin` posts credentials to ficium‑auth via `src/shared/lib/ficiumAuth.ts` (`signIn`).
2. On success the RS256 token is stored in `sessionStorage`; the page calls `GET /institutions/me` to detect whether the user is an institution user or a platform admin, then routes accordingly.
3. `PortalRoute` guards authenticated routes — it checks the local token, then confirms access (and approved/suspended/pending status) via `GET /institutions/me`.
4. `PortalShell` renders the frame: it reads the display name from the JWT payload, resolves nav modules via `GET /members/my-group`, and signs out through ficium‑auth.

Key files: `src/shared/lib/ficiumAuth.ts` (token lifecycle), `src/shared/lib/portalApi.ts` (authenticated fetch wrapper), `src/shared/pages/UnifiedLogin.tsx`, `src/shared/components/PortalRoute.tsx`, `src/shared/components/PortalShell.tsx`.

---

## Data sources by hook

`src/institution/hooks/useInstitution.ts` is split deliberately:

**Via ficium-portal-api** (institution schema, RLS):
`useMyInstitution`, `useMyRole`, `useInstitutionUsers`, `usePendingActions`, `useApproveAction`, `useRejectAction`, `useSubmitBid`, `useWebhooks`, `useAuditEvents`.

**Via Supabase directly** (cross‑project reads of Ficium App data):
`useMarketplace`, `useMyBids`, `useProducts`.

The admin hooks in `src/admin/hooks/useAdmin.ts` are still mostly on Supabase; only `useMyGroup` has moved to ficium‑portal‑api so far.

---

## Local development

```bash
npm install

cp .env.example .env
# set VITE_AUTH_URL, VITE_PORTAL_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY

npm run dev
```

### Build

```bash
npm run build      # tsc -b && vite build
```

> `tsc -b` is **stricter** than `tsc --noEmit`. It enforces `noUnusedLocals` and `erasableSyntaxOnly`. This means: no unused imports; no TypeScript parameter properties (`constructor(public x)`); no enums or namespaces. A clean local `--noEmit` can still fail the Vercel build, so always run `npm run build` before pushing.

---

## Configuration (environment variables)

| Variable | Notes |
|----------|-------|
| `VITE_AUTH_URL` | ficium‑auth base URL |
| `VITE_PORTAL_API_URL` | ficium‑portal‑api base URL |
| `VITE_SUPABASE_URL` | institution Supabase project URL (cross‑project reads) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |

---

## Deployment (Vercel)

- Auto‑deploys on push to `main`.
- Build command: `npm run build`. Output: `dist/`.
- Set the `VITE_*` environment variables in the Vercel project settings.
- **Git authorship matters:** commits must use `kishan.jeebun@ficium.net` as the author email or Vercel rejects the deployment.

---

## Database & migrations

SQL migrations live in `supabase/migrations/`. They define the `institution` and `portal_admin` schemas, the group model, maker‑checker, and the approval RPCs. Run them in order in the Supabase SQL editor.

The `supabase/functions/provision-institution-user/` Edge Function handles institution user provisioning (pending migration into ficium‑portal‑api).

---

## Project layout

```
src/
  shared/
    lib/        ficiumAuth.ts, portalApi.ts, supabase.ts, …
    pages/      UnifiedLogin.tsx
    components/ PortalRoute.tsx, PortalShell.tsx, RegisterShell.tsx
    ui/         design system (Button, Card, Field, dashboard kit, …)
  institution/
    hooks/      useInstitution.ts
    <feature>/  dashboard, marketplace, bids, approvals, products,
                webhooks, audit, team, settings, auth (onboarding)
  admin/
    hooks/      useAdmin.ts
    <feature>/  dashboard, institutions, users, groups, sessions,
                dual-control, audit, system
  app/          routes.tsx, query-client.ts
supabase/
  migrations/   schema + RPCs
  functions/    provision-institution-user
```

---

## Migration status

The Portal is mid‑migration from Supabase Auth + PostgREST to ficium‑auth + ficium‑portal‑api. Login, the route guard, the shell, and the institution data hooks are done. Still on Supabase: the admin dashboard tree, and the `GroupsTab` / `InstitutionUsers` settings components (groups CRUD + user provisioning). See the platform `ARCHITECTURE.md` §8 for the staged plan.
