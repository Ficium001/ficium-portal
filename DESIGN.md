# Ficium Portal — Design Document

_Last updated: 24 June 2026_

This is the **product and frontend design** record for the Portal: the
experience decisions, the navigation/RBAC model, the design system, and the
client-side architecture. It sits alongside `ARCHITECTURE.md` (systems/auth/data
flow) and `DATABASE.md` (storage). Where `ARCHITECTURE.md` answers "how do the
services fit together," this answers "how is the single-page app designed."

---

## 1. The central product decision: one SPA, two audiences

The Portal is **one React SPA at one URL** serving two completely different
audiences — institution users (banks, fintechs) and Ficium platform staff — with
the audience detected from the authenticated user, not from the URL.

Rationale:

- **One deploy, one shell, one auth path.** Splitting into two apps would
  duplicate the login flow, the route guard, the design system, and the build
  pipeline for no real isolation gain (the security boundary is the API + RLS,
  not the bundle).
- **Portal-type detection** happens once after login via `GET /institutions/me`;
  the result routes the user into the institution tree or the admin tree.
- The cost is a slightly larger bundle; mitigated by **route-level code
  splitting** (every page is `React.lazy`), so a user only downloads the modules
  they can reach.

---

## 2. Navigation is data, not layout

Navigation is **not hardcoded**. `PortalShell` calls `GET /members/my-group`,
which resolves the user's module permissions (see `DATABASE.md` §5 for the
resolution order), and renders nav items from that `module_permissions` set.

Consequences for design:

- Two users in the same institution can see different navigation, governed by
  their group — this is the RBAC model surfacing in the UI.
- Adding a capability means adding a `catalog.module` and granting it to a group,
  **not** editing the shell. The shell is a renderer of permissions.
- **Module surfaces.** Institution: dashboard, marketplace, bids, approvals,
  products, webhooks, audit, team/users, settings, dual-control. Admin:
  dashboard, institutions, users, groups, dual-control, sessions, audit, system.

---

## 3. The maker-checker UX pattern

Maker-checker (4-eyes) is a first-class interaction, not a confirmation dialog.
The design rule: **a privileged change is a request, not an act.**

- A "maker" submits an action → it enters the governance queue as pending.
- A different member ("checker") reviews it in the Approvals / Dual-Control
  surface and approves or rejects. The UI must make the *separation of duties*
  obvious — a maker never sees an "approve" affordance on their own submission.
- Every decision lands in the audit log; the audit surface is read-only by
  design (WORM storage underneath).

This pattern appears in two places with one mental model: institution-scoped
actions (Approvals) and platform-scoped actions (Admin → Dual Control).

---

## 4. Design system

The shared UI lives in `src/shared/ui/` and is intentionally small and
composable — Tailwind utility classes over a thin set of primitives, no heavy
component library.

**Primitives:** `Button`, `Card`, `Field`, `Input`, `Select`, `FiciumLogo`.

**Dashboard kit** (`src/shared/ui/dashboard/`): `Hero`, `LineChart`, and a `kit`
of composable stat/section blocks — the vocabulary every dashboard page is built
from, so the institution and admin dashboards stay visually coherent.

**Motion** (`src/shared/ui/motion/`): `CountUp` and `Reveal`. `Reveal` is a
**progressive enhancement** — content is visible by default and the scroll
animation layers on top, so a JS/animation failure never hides content. (This is
the contract that a past scroll-reveal regression violated; keep it.)

Design principles:

- **Primitives over pages.** Feature pages compose primitives; they don't invent
  one-off styled elements.
- **Forms are typed end to end.** `react-hook-form` + `zod` schemas drive both
  validation and the TypeScript types, so the form shape and the API contract
  can't silently drift.
- **Accessible by default** — semantic elements, labelled fields via the `Field`
  wrapper, visible focus, content-first motion.

---

## 5. Client-side architecture

```
src/
  shared/
    lib/        ficiumAuth.ts (token lifecycle), portalApi.ts (authed fetch),
                supabase.ts (cross-project reads)
    pages/      UnifiedLogin
    components/ PortalRoute (guard), PortalShell (frame), RegisterShell
    ui/         the design system (above)
  institution/  <feature>/pages + hooks/useInstitution.ts
  admin/        <feature>/pages + hooks/useAdmin.ts
  app/          routes.tsx (one flat router), query-client.ts
```

- **Routing.** One `createBrowserRouter`, flat paths, a single `PortalShell`,
  one `PortalRoute` guard. Pages are lazy-loaded.
- **Server state** is owned by **TanStack Query** — caching, invalidation, and
  loading/error states live in hooks, not components.
- **Data-source split is explicit** (see README "Data sources by hook").
  Institution data flows through `ficium-portal-api` (RLS-enforced);
  cross-project marketplace reads (`useMarketplace`, `useMyBids`, `useProducts`)
  hit the institution Supabase project directly, because that data is owned by
  the Ficium App, not the Portal. Mixing these would couple the Portal to the
  App's storage.
- **`portalApi.ts`** is the one authenticated fetch wrapper: it attaches the
  Bearer token, handles 401 → sign-out, and centralises the API base URL.

---

## 6. Security-shaped UX

Security decisions that the design must honour:

- **Token in `sessionStorage`** (not `localStorage`) — the session ends when the
  tab closes; no silent long-lived persistence.
- **Route guard with status gating.** `PortalRoute` doesn't just check "logged
  in" — it confirms `approved` / `suspended` / `pending` via `/institutions/me`
  and routes to the right state screen (pending review, suspended notice, or the
  app). A suspended institution cannot reach feature pages even with a valid
  token.
- **Least-surface navigation.** A user never sees nav for a module their group
  doesn't grant — capability isn't merely disabled, it's absent.

---

## 7. Build and configuration

- **`npm run build` = `tsc -b && vite build`.** `tsc -b` is stricter than
  `--noEmit` (enforces `noUnusedLocals`, `erasableSyntaxOnly`): no unused
  imports, no parameter properties, no enums/namespaces. Always build before
  pushing — a clean local `--noEmit` can still fail Vercel.
- **Config** is four `VITE_*` variables (`VITE_AUTH_URL`,
  `VITE_PORTAL_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`),
  set per environment in Vercel. No secrets in the bundle beyond the Supabase
  anon (publishable) key, which is designed to be public and is gated by RLS.
- **Lift-and-shift.** Because the three backend URLs are injected at build time,
  pointing the Portal at a client-cloud or on-prem deployment of ficium-auth /
  ficium-portal-api is a configuration change, not a code change.

---

## 8. Design debt / open items

- **Admin tree and `GroupsTab` / `InstitutionUsers`** still read Supabase
  directly; they should move to `ficium-portal-api` to complete the data-source
  unification (ARCHITECTURE §8, stages 4c–5).
- **Consistency audit** of the dashboard kit usage across newer feature pages —
  ensure none reintroduce one-off styled elements outside the design system.
- **Empty/error/loading states** should be inventoried per module so every
  surface has a designed (not default) empty and error state.
