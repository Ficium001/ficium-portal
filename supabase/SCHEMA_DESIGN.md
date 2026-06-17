# Ficium — Target Database Architecture

**Reverse-banking marketplace, multi-tenant SaaS.** Reorganises the current
single-`institution`-schema design into bounded contexts owned by one domain
each. Pool tenancy retained (isolation by `institution_id` + forced RLS); the
pool-vs-schema-per-tenant decision is deferred but this layout makes either
path clean.

---

## 1. The core principle

One schema = one bounded context = one owner. A table lives where its
**owner** lives, not where it's *used*. The product catalogue is read by every
institution but **owned by Ficium**, so it belongs in `catalog`, not
`institution`.

| Schema        | Owns                                   | Written by            | Read by                  |
|---------------|----------------------------------------|-----------------------|--------------------------|
| `identity`    | Login, sessions, MFA, tokens           | Auth service          | Everyone (own row)       |
| `catalog`     | Global product reference data, modules | Ficium platform admin | Everyone                 |
| `institution` | Tenants + their internal org           | Tenant admins (M-C)   | Tenant members (own)     |
| `marketplace` | Requests, bids, matches                | Consumers + tenants   | Both sides (scoped)      |
| `governance`  | Maker-checker / dual-control queue      | Any actor             | Approvers (scoped)       |
| `admin`       | Ficium internal staff + system groups  | Super admin           | Admin staff              |
| `audit`       | One immutable append-only event log     | All (trigger)         | Compliance / admin       |

Seven contexts instead of one schema doing four jobs.

---

## 2. The two structural decisions that actually matter

### 2.1 Consolidate the marketplace into ONE store (highest priority)

Today: requests live in the consumer Supabase project, bids live in the portal
project, joined by a bare UUID across a network boundary. **Move requests and
bids into a single `marketplace` context** so a real FK exists:

```
marketplace.bids.request_id  →  marketplace.requests.id   (FK, ON DELETE RESTRICT)
```

Consumer PII stays in the consumer DB. The marketplace owns only the
*transaction*: `requests.consumer_id` is a plain UUID reference to consumer
identity (no PII duplicated). Both the consumer app and the portal read/write
the marketplace exclusively through `ficium-portal-api` — which you already
have. This gives you referential integrity, atomic "accept winning bid"
transactions, and one place to enforce the bid-window lifecycle.

### 2.2 Extract the global catalogue out of `institution`

All `product_*` tables are platform reference data. Move them to `catalog`.
Per-tenant *overrides* stay in `institution` and FK up to the catalogue:

```
institution.product_config.product_id  →  catalog.products.id
institution.sla_config.product_id      →  catalog.products.id
```

---

## 3. Schema-by-schema layout

Tables are unprefixed nouns — the schema already provides the namespace, so
`institution.bids` not `institution.institution_bids`.

### `identity`  (resolves the auth split-brain)

Pick **one** source of truth. Recommendation: Supabase Auth (`auth.users`) as
the root, with `identity` holding only what Supabase doesn't give you. Retire
`auth_portal.*` once migrated.

```
identity.profiles            (user_id PK → auth.users, display_name, phone, status)
identity.ip_allowlist        (id, user_id, cidr, label, created_at)
identity.mfa_backup_codes    (id, user_id, code_hash, used_at)
identity.login_events        (id, user_id, ip, ua, outcome, at)   -- or fold into audit
```

If you instead keep `ficium-auth` as SoT, `identity` becomes the full
`users / sessions / verification_tokens / mfa_*` set and Supabase Auth is the
one retired. **Decide before onboarding — do not run both.**

### `catalog`  (global, read-mostly, Ficium-owned)

```
catalog.product_families     (id, code, label, sort_order)
catalog.products             (id, family_id → product_families, code, label,
                              currency, active, sort_order)
catalog.product_parameters   (id, product_id, key, data_type, required, ui_config)
catalog.product_rate_config  (id, product_id, model, bounds, ...)
catalog.product_sla_defaults (id, product_id, bid_window_minutes, auto_withdraw_minutes)
catalog.product_eligibility  (id, product_id, rules jsonb)
catalog.product_documents    (id, product_id, doc_key, label, required)
catalog.modules              (key PK, label, description, side 'institution'|'admin')
catalog.regulators           (code PK, name, country)        -- lookup
catalog.countries            (code PK, name)                 -- lookup
```

No RLS needed on `catalog` — it's public reference data; `GRANT SELECT` to
`authenticated`, writes restricted to platform admin.

### `institution`  (tenant data — drop the stutter)

```
institution.institutions     (id, name, legal_name, type, country,
                              regulator → catalog.regulators, reg_number,
                              deployment_model, onboarding_stage,
                              compliance_status, approved, approved_at,
                              suspended_at, suspension_reason,
                              primary_contact_*, created_at, updated_at)

institution.members          (id, institution_id, user_id → identity,
                              system_group_id → admin.system_groups,
                              custom_group_id → institution.groups,
                              member_role, is_primary_admin, status,
                              created_at)

institution.groups           (id, institution_id, slug, label, description,
                              module_permissions text[], is_system,
                              created_by → members, created_at, updated_at,
                              UNIQUE(institution_id, slug))

institution.api_keys         (id, institution_id, label, key_prefix,
                              key_hash, scopes text[], last_used_at,
                              revoked_at, created_by, created_at)

institution.webhooks         (id, institution_id, label, endpoint_url,
                              event_types text[], secret, active,
                              retry_max, timeout_ms, last_fired_at,
                              last_status, created_at, updated_at)

institution.webhook_deliveries (id, webhook_id, institution_id, event_type,
                              payload jsonb, status, attempts, response_code,
                              next_retry_at, delivered_at)

institution.product_config   (id, institution_id, product_id → catalog.products,
                              enabled, overrides jsonb,
                              UNIQUE(institution_id, product_id))

institution.sla_config       (id, institution_id, product_id → catalog.products,
                              bid_window_minutes, auto_withdraw_minutes,
                              UNIQUE(institution_id, product_id))
```

Every table: `institution_id NOT NULL`, RLS `ENABLE` + `FORCE`, composite
indexes leading with `institution_id`. (You already do this well — it just
moves to cleaner names.)

### `marketplace`  (the matching core — single source of truth)

```
marketplace.requests         (id, consumer_id, product_id → catalog.products,
                              amount, currency, term_months, params jsonb,
                              status 'open'|'bidding'|'accepted'|'cancelled'|'expired',
                              bid_window_opens_at, bid_window_closes_at,
                              created_at, updated_at)

marketplace.bids             (id,
                              request_id → marketplace.requests  (FK!),
                              institution_id → institution.institutions,
                              rate, rate_type, amount_offered, term_months,
                              conditions jsonb,
                              status 'submitted'|'accepted'|'rejected'|'expired'|'withdrawn',
                              submitted_via, submitted_by → institution.members,
                              idempotency_key,        -- dedup API submissions
                              submitted_at, expires_at, withdrawn_at,
                              UNIQUE(institution_id, request_id, idempotency_key))

marketplace.bid_events       (id, bid_id → bids, from_status, to_status,
                              actor_id, actor_type, reason, at)   -- append-only

marketplace.acceptances      (id, request_id → requests, bid_id → bids,
                              accepted_by_consumer, accepted_at)
```

RLS: institutions see their own bids + open requests they're eligible for;
consumers see their own requests + bids on them (enforced through the API
layer / view with `security_invoker = on`).

### `governance`  (unify maker-checker — currently split in two)

Today `institution.pending_actions` (tenant) and
`portal_admin.admin_dual_control_actions` (admin) are two engines doing the
same job. Unify:

```
governance.pending_actions   (id, scope 'institution'|'platform',
                              institution_id (null for platform actions),
                              action_category, resource_type, resource_id,
                              payload jsonb, risk 'low'|'med'|'high'|'critical',
                              maker_id, status, checker_id, decided_at,
                              execution_status, created_at, expires_at)
```

One executor function with a `CASE` on `action_category` (you already have
this shape). RLS keys on `scope` + `institution_id`. Keeps one audit story for
every privileged action, tenant or platform.

### `admin`  (rename `portal_admin`; clarify the group naming)

```
admin.users          (id, user_id → identity, status, created_at)
admin.roles          (id, slug, label, permissions text[])
admin.system_groups  (id, slug, label, module_permissions text[],
                      user_type 'admin'|'institution', is_system)
                      -- renamed from portal_admin.user_groups:
                      -- these are the platform-defined GROUP TEMPLATES
                      -- (institution_admin, bank_officer, super_admin, ...)
admin.sessions       (id, admin_user_id, ...)
```

**Group resolution order** (document this — it's the part that confuses):
1. `institution.members.custom_group_id` → tenant's own custom group (wins)
2. else `institution.members.system_group_id` → `admin.system_groups` template
3. else empty module set

### `audit`  (one immutable log)

```
audit.events  (id, occurred_at, actor_id, actor_type 'consumer'|'member'|'admin'|'system',
               institution_id (nullable), action, resource_type, resource_id,
               outcome, metadata jsonb, ip, user_agent)
               -- append-only (no UPDATE/DELETE grants), partition by month
```

Replaces the three scattered audit tables. Append-only WORM semantics,
month-partitioned for retention. One trail for any compliance or BOM/FSC review.

---

## 4. Migration order (incremental, non-breaking)

Do it in slices behind the API so the frontend never sees a break:

1. `CREATE SCHEMA catalog` → move `product_*` tables, repoint FKs, leave
   compatibility views in `institution` temporarily.
2. `CREATE SCHEMA marketplace` → move/own `requests` + `bids` together, add the
   real FK, migrate `institution_bids` data, repoint `ficium-portal-api`.
3. Rename `institution.institution_*` → `institution.*` (one ALTER each,
   keep views for the old names until the frontend is repointed).
4. `CREATE SCHEMA governance` → merge the two maker-checker queues.
5. `CREATE SCHEMA audit` → unify the three audit tables; switch triggers.
6. Resolve auth: pick Supabase Auth *or* `ficium-auth`, migrate, retire the other.
7. Rename `portal_admin` → `admin`; `user_groups` → `system_groups`.

Each slice is independently shippable. The catalogue extraction (1) and the
marketplace consolidation (2) deliver the most value — do those first.

---

## 5. What you already got right (keep)

- Forced RLS on every tenant table (`ENABLE` + `FORCE`).
- `current_member_ctx()` SECURITY DEFINER pattern — avoids the RLS recursion trap.
- Maker-checker as a first-class executor with a category `CASE`.
- Catalogue normalised into family → product → parameters/rate/sla/eligibility.
- Composite indexes leading with `institution_id`.

The reorganisation is about **ownership boundaries and the marketplace FK** —
not about rebuilding what works.
