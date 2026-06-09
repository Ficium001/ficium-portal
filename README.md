# Ficium Portal

Institution-facing portal for the Ficium reverse-banking marketplace.

Separate application from the client app (`ficium`). Deploys to `portal.ficium.net`.

## Stack
- React 19 + TypeScript + Vite
- Tailwind CSS (Ficium design tokens)
- Supabase (`institution` schema, separate auth session key `ficium-portal-auth`)
- TanStack Query v5

## Dev
\`\`\`bash
cp .env.example .env.local   # fill in Supabase creds
npm install
npm run dev                  # http://localhost:5173
\`\`\`

## Routes
| Path | Page |
|---|---|
| `/` or `/login` | InstitutionLogin |
| `/register` | RegisterInstitution |
| `/pending` | InstitutionPending (onboarding status tracker) |
| `/onboarding` | InstitutionOnboarding |
| `/dashboard` | InstitutionDashboard *(protected)* |
| `/marketplace` | InstitutionMarketplace *(protected)* |
| `/bids` | InstitutionBids *(protected)* |
| `/approvals` | InstitutionApprovals *(protected)* |
| `/products` | InstitutionProducts *(protected)* |
| `/webhooks` | InstitutionWebhooks *(protected)* |
| `/audit` | InstitutionAudit *(protected)* |
| `/settings` | InstitutionSettings *(protected)* |

## Deploy (Vercel)
- Framework: Vite
- Output dir: `dist`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Domain: `portal.ficium.net`

## Shared code
`src/shared/` is a fork of the client app's shared lib, trimmed to institution needs only.
Not a package — intentional divergence is acceptable pre-launch.
