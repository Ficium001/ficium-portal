# Ficium Platform — Architecture

_Last updated: 27 June 2026 · Reflects currently deployed production state_

---

## 1. What Ficium is

Ficium is a **reverse banking marketplace** for Mauritius and the Indian Ocean region. Individuals and businesses post anonymised financial requests; FSC-licensed banks and fintechs compete with bids. The consumer picks the best offer.

Two distinct products, two separate frontends, two separate data stores:

| Product | Audience | Deployed at |
|---------|----------|-------------|
| **Ficium App** | Consumers | `ficium.vercel.app` |
| **Ficium Portal** | Institutions + Ficium staff | `ficium-portal.vercel.app` |

---

## 2. Services

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FICIUM APP                                    │
│              (React SPA · Vercel · ficium.vercel.app)                │
│  Auth: Supabase Auth (email/password)                                │
│  Data: Supabase App DB (direct) + Vercel API routes                 │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ REST (X-Service-Secret)
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Vercel Serverless (api/*.ts — 12 functions max)         │
│                                                                      │
│  /api/kyc            KYC identity verification (Claude + Rekognition)│
│  /api/accept-bid     Phase 2 PII reveal + atomic acceptance          │
│  /api/request-bids   Bid list for a single request                   │
│  /api/request-bids-bulk  Bid list for many requests                  │
│  /api/request-builder    AI-assisted request drafting                │
│  /api/request-actions    Request status transitions                  │
│  /api/internal       Internal pg_net dispatcher (4 actions):         │
│                        bid-notify, vault-extract,                    │
│                        request-expiring, request-expired,            │
│                        bid-accepted                                  │
│  /api/chat           Claude AI financial coach                       │
│  /api/intelligence   Market intelligence feed                        │
│  /api/market         Market data                                     │
│  /api/rate-applicant Applicant scoring                               │
│  /api/keepalive      Railway warm-up ping                            │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
              ┌────────────────────┴─────────────────────┐
              ▼                                           ▼
┌─────────────────────────┐             ┌───────────────────────────┐
│  Supabase App DB        │             │   ficium-portal-api       │
│  (wixfhjlsjkiwfvqewvmt) │             │   (FastAPI · Railway)     │
│  region: ap-south-1     │             │                           │
│                         │◄────────────│  Vercel calls this for    │
│  public.*               │  app_conn   │  accept-bid Phase 2 PII   │
│  marketplace_sync.*     │  (direct)   │  and sync-requests        │
│  vault_extract.*        │             └───────────────────────────┘
│  bid_notify.*           │
│  vault.*                │
└─────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        FICIUM PORTAL                                 │
│              (React SPA · Vercel · ficium-portal.vercel.app)         │
│  Auth: ficium-auth (RS256 JWT in sessionStorage)                     │
│  Data: ficium-portal-api (institution data, RLS-enforced)            │
│        institution Supabase DB (cross-project: marketplace reads)    │
└───────────┬─────────────────────────────┬───────────────────────────┘
            │                             │
            │ POST /auth/login            │ Bearer <RS256 JWT>
            ▼                             ▼
┌────────────────────────┐   ┌────────────────────────────────────────┐
│     ficium-auth        │   │         ficium-portal-api              │
│   (FastAPI · Railway)  │   │        (FastAPI · Railway)             │
│                        │   │                                        │
│  Argon2id passwords    │   │  Verifies JWT via JWKS (cached)        │
│  RS256 JWT issuance    │◄──│  set_config(request.jwt.claims)        │
│  JWKS endpoint         │   │  Queries with RLS enforced             │
│  MFA (TOTP)            │   │  Maker-checker RPCs                    │
│  Redis sessions        │   │  Marketplace + bid management          │
│  Rate limiting         │   │  Phase 2 PII reveal (s2s only)         │
│  Email (Resend)        │   │  Bid window close (GitHub Actions cron)│
└────────────┬───────────┘   └──────────────────┬─────────────────────┘
             │                                  │
             ▼                                  ▼
┌────────────────────────┐   ┌────────────────────────────────────────┐
│  auth_portal schema    │   │   Supabase Institution DB              │
│  (institution Supabase)│   │   (egwobcajdlragubtkpqp)              │
│                        │   │   region: ap-southeast-1              │
│  auth_users            │   │                                        │
│  auth_sessions         │   │   institution.*                        │
│  mfa_backup_codes      │   │   marketplace.*  (bid, request,        │
│  auth_audit_events     │   │     acceptance, pipeline, events)      │
└────────────────────────┘   │   governance.*   (maker-checker)       │
                             │   catalog.*      (products, families)  │
                             │   bid_notify.*   (pg_net dispatcher)   │
                             └────────────────────────────────────────┘
```

---

## 3. The marketplace core loop

```
Consumer (App)                  Portal                    Institution
──────────────                  ──────                    ───────────
POST /requests         ──►  marketplace_sync trigger
  (App DB insert)            └─► pg_net → /api/internal
                                  { action: 'sync-requests' }
                                  → portal-api /marketplace/sync-requests
                                  → marketplace.ingest_app_request()

                              marketplace.request
                              (status: bidding)       ◄── GET /marketplace/requests
                                                           (institution sees request)

                                                      ──► POST /approvals/submit
                                                           { action: bid.submit }
                                                           (maker)

                                                      ──► POST /approvals/{id}/approve
                                                           (checker)
                                                           → marketplace.bid INSERT
                                                           → trg_bid_notify fires
                                                           → pg_net → /api/internal
                                                             { action: 'bid-notify' }
◄── Notification written
    (bid_received)
    + Resend email

GET /requests/:id/bids ──►  public.get_bids_for_request()
  (consumer sees bid)        (double-blind: no institution name)

POST /accept-bid       ──►  portal-api /public/requests/:id/accept-bid
                             → marketplace.accept_bid() atomic:
                               winning bid → accepted
                               others     → rejected
                               request    → accepted + winning_bid_id
                               bid_acceptance PII written
                               pipeline auto-created
                             ← { institution_name, contact_*, rate, ... }

                        ──►  App DB: bid_acceptances + requests.status=accepted
                        ──►  bid_accepted notification written
◄── Phase2RevealModal
    (institution revealed)
```

---

## 4. Data split

| What | Where | Why |
|------|-------|-----|
| Consumer PII (clients, dossier, financials) | App DB (`public.*`) | Consumer-facing, Supabase Auth RLS |
| Consumer requests | App DB (`public.requests`) | Consumer creates them |
| Marketplace requests (anonymised) | Institution DB (`marketplace.request`) | Synced from App DB via pg_net + portal-api; institution never sees App DB |
| Bids | Institution DB (`marketplace.bid`) | Institution creates them |
| Bid acceptances + PII reveal | Institution DB (`marketplace.bid_acceptance`) | Portal-api fetches PII from App DB at accept time, stores reveal |
| Loan pipeline | Institution DB (`marketplace.loan_pipeline`) | Created atomically on acceptance |
| Institution data | Institution DB (`institution.*`) | Portal-only |
| Auth sessions | Institution DB (`auth_portal.*`) | ficium-auth owns this |
| Consumer notifications | App DB (`public.notifications`) | Written by Vercel handlers triggered by institution DB events |
| Consumer documents (Vault) | App DB (`client_vault_document`) + Supabase Storage (`documents` bucket) | Consumer uploads; Claude Vision extracts |

---

## 5. Notification matrix

Every consumer-facing event triggers an in-app notification (polled every 30s) and a Resend email. All handlers live in `ficium/api/_lib/handlers/` and are dispatched through `ficium/api/internal.ts`.

| Event | Kind | Trigger | Email |
|-------|------|---------|-------|
| Request submitted | `request_created` | App DB insert trigger (existing) | No |
| Institution bids | `bid_received` | `trg_bid_notify` on `marketplace.bid` INSERT | Yes |
| Bid window closing in 24h | `request_expiring` | pg_cron hourly (`notify_expiring_requests()`) | No |
| Bid window closed, no bids | `bid_expired` | `close_expired_windows()` on Portal DB | No |
| Consumer accepts bid | `bid_accepted` | `accept-bid.ts` after successful portal call | No |

---

## 6. Vault — Document enrichment

The Ficium Vault lets consumers store financial documents (payslips, title deeds, bank statements, etc.) which are automatically processed by Claude Vision to extract structured data. Extracted data is attested into `client_financial_snapshot`, making the consumer's profile verifiably accurate.

```
Consumer uploads file
  → client_vault_document INSERT (App DB)
  → trg_vault_extract fires
  → pg_net → /api/internal { action: 'vault-extract', document_id }
  → Download from Supabase Storage (documents bucket)
  → Claude Vision (claude-sonnet-4-6) with doc-type prompt
  → Structured JSON extraction
  → Confidence scoring
  → Attest into:
      client_financial_snapshot (income_verified, property_verified, liabilities_verified)
      client_vault_property (per-property records)
      client_loan_details (per-loan upsert)
  → client_vault_document.extract_status = 'attested' | 'manual_review' | 'failed'

Documents NEVER sent to institutions.
Institutions see attested data points in Phase 1 metadata only.
```

---

## 7. Double-blind identity model

The marketplace preserves mutual anonymity until a consumer accepts a bid:

- **Phase 1 (bidding):** Consumer is identified by an anonymised UUID (`_anon_uuid(real_id)` — MD5 of `real_id + ':ficium-anon-v1:'`). Institutions see financial metadata only, never PII or the real consumer ID.
- **Phase 2 (accept):** `marketplace.accept_bid()` is called with the consumer's real UUID. Portal-api fetches full PII from the App DB and writes it into `marketplace.bid_acceptance`. The institution then sees: full name, email, phone, address, date of birth, NIC number.
- The institution name is revealed to the consumer at the same moment via `Phase2RevealModal`.

---

## 8. Sync architecture (App DB → Institution DB)

Two mechanisms keep requests in sync:

**Event-driven (immediate):** `trg_marketplace_sync` fires on `public.requests` INSERT/UPDATE → `marketplace_sync.dispatch()` → `pg_net` → `ficium-portal-api /marketplace/sync-requests` → `marketplace.ingest_app_request()`.

**Safety-net sweep:** `pg_cron` job runs every 5 minutes calling `marketplace_sync.dispatch()` to catch any pg_net misses.

The pg_net vault secrets (`portal_api_url`, `app_service_secret`) are stored in Supabase Vault on the App DB. Dispatch is fire-and-forget and non-fatal — the consumer's request creation is never blocked.

---

## 9. Deployment topology

| Service | Platform | Region | Repo |
|---------|----------|--------|------|
| Ficium App | Vercel (Hobby) | Auto (CDN) | `Ficium001/ficium` |
| Ficium Portal | Vercel (Hobby) | Auto (CDN) | `Ficium001/ficium-portal` |
| ficium-portal-api | Railway | ap-southeast-1 | `Ficium001/ficium-portal-api` |
| ficium-auth | Railway | ap-southeast-1 | `Ficium001/ficium-auth` |
| App DB | Supabase `wixfhjlsjkiwfvqewvmt` | ap-south-1 | — |
| Institution DB | Supabase `egwobcajdlragubtkpqp` | ap-southeast-1 | — |

**Vercel function budget:** Hobby plan allows 12 root-level `api/*.ts` functions. Currently at exactly 12. Upgrade to Pro before adding more functions.

**Railway cold starts:** GitHub Actions keepalive workflow pings `/health` every 5 minutes on both Railway services to prevent spin-down.

---

## 10. ADRs

| ADR | Decision | Status |
|-----|----------|--------|
| ADR-001 | Portable portal data layer — ficium-portal-api instead of PostgREST | Implemented |
| ADR-002 | Identity migration — ficium-auth RS256 replacing Supabase Auth for portal | In progress (`feat/identity-migration-adr002`) |

---

## 11. Security properties

- **Tenant isolation:** Every institution-scoped table has `institution_id NOT NULL`, RLS `ENABLE` + `FORCE`, composite indexes leading with `institution_id`.
- **Auth:** Consumer app uses Supabase Auth (email/password). Portal uses ficium-auth (RS256/Argon2id). The two auth systems are independent.
- **Service-to-service auth:** Shared secret (`APP_SERVICE_SECRET`) validated via `hmac.compare_digest`. Stored in Supabase Vault for pg_net calls.
- **PII protection:** Consumer PII never stored on Institution DB except inside `marketplace.bid_acceptance` at accept time.
- **Audit trail:** `client_vault_access_log` on every document access. `audit_events` on bid actions. `auth_audit_events` in ficium-auth.
- **Retention:** `client_vault_document.retain_until` = 5 years from upload (AML/CFT requirement). Soft-delete pattern.
