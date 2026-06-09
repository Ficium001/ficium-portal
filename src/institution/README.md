# Ficium 3 — Institution Portal

## Drop-in integration guide

### 1. Copy files into your codebase

```
src/
  types/institution.ts                   → copy as-is
  lib/institutionSupabase.ts             → copy as-is
  lib/utils.ts                           → merge with existing utils
  hooks/useInstitution.ts               → copy as-is
  routes/institutionRoutes.tsx          → copy as-is
  components/institution/
    InstitutionRoute.tsx                → copy as-is
    InstitutionPortalShell.tsx          → copy as-is
  pages/institution/
    InstitutionDashboard.tsx            → copy as-is
    InstitutionMarketplace.tsx          → copy as-is
    InstitutionApprovals.tsx            → copy as-is
    InstitutionBids.tsx                 → stub, expand next
    InstitutionProducts.tsx             → stub, expand next
    InstitutionWebhooks.tsx             → stub, expand next
    InstitutionAudit.tsx                → stub, expand next
    InstitutionSettings.tsx             → stub, expand next
    InstitutionLogin.tsx                → stub, expand next
    InstitutionOnboarding.tsx           → stub, expand next
```

### 2. Add routes to App.tsx

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { institutionRoutes } from './routes/institutionRoutes'

const router = createBrowserRouter([
  // ... your existing routes ...
  ...institutionRoutes,
])
```

### 3. Wrap app with QueryClientProvider (if not already)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const queryClient = new QueryClient()

// In main.tsx:
<QueryClientProvider client={queryClient}>
  <RouterProvider router={router} />
</QueryClientProvider>
```

### 4. Environment variables

Same as existing app — no new variables needed:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The institution client uses `db: { schema: 'institution' }` — 
all queries automatically target institution.* tables.

### 5. Route structure

```
/institution              → InstitutionDashboard (protected)
/institution/marketplace  → InstitutionMarketplace (requires marketplace module)
/institution/bids         → InstitutionBids (requires marketplace module)
/institution/approvals    → InstitutionApprovals (all roles)
/institution/products     → InstitutionProducts
/institution/webhooks     → InstitutionWebhooks
/institution/audit        → InstitutionAudit
/institution/settings     → InstitutionSettings
/institution/login        → InstitutionLogin (public)
/institution/onboarding   → InstitutionOnboarding (public)
```

### 6. Access control layers

1. **InstitutionRoute** — checks auth + institution membership + approval status
2. **Sidebar nav** — only shows modules the institution has licensed
3. **useSubmitBid** — routes through `submit_for_approval()` RPC, not direct insert
4. **Supabase RLS** — institution schema policies enforce all of the above at DB level

### 7. Maker-checker flow

All material actions (bids, webhooks, user invites, etc.) go through:
```
useSubmitBid() → submit_for_approval() RPC → pending_actions table
                                           ↓
                              InstitutionApprovals page
                                           ↓
                              approve_action() RPC → execute_approved_action()
```

A user cannot approve an action they initiated (enforced at RPC level).

## Next sprint — expand stubs

Priority order:
1. InstitutionBids — full bid history, withdraw bid action
2. InstitutionAudit — filtered audit log with export
3. InstitutionWebhooks — manage endpoints, view delivery history
4. InstitutionLogin — Supabase auth for institution users
5. InstitutionOnboarding — registration + status tracking
