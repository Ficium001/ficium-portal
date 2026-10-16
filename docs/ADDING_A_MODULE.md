# Adding a module

The institution portal is a lending lifecycle, modelled on a core banking
origination flow:

| Stage | What happens | Today |
|---|---|---|
| Origination | Find a request, make an offer | Marketplace, My bids |
| Authorisation | Second pair of eyes (maker-checker) | Inbox: Bids, Credit, Team & setup |
| Fulfilment | Accepted offer becomes a deal and is processed | Deals: overview, documents, signatures, messages |
| Servicing | Booked loan is serviced | *(no module yet)* |
| Reports | Performance | Analytics |
| Configuration | Product factory, templates, team, integrations | Setup |

Features plug into that lifecycle through **one manifest**. The shell, router,
Inbox, Setup, deal page, deal lifecycle strip and flow bar read the registry;
none of them name a feature.

## Steps

1. **Permission.** Add the module key to `catalog.module` (DB migration) and to
   `MODULE_CATALOGUE` in `src/shared/lib/modules.ts`. Keys are a contract with
   `user_groups.module_permissions`; never rename one without a migration.
2. **Manifest.** Create `src/institution/<feature>/manifest.tsx` exporting a
   `ModuleManifest` (`src/app/registry/types.ts`). Pick its `stage` and declare
   only the extension points it uses:

   | Extension point | Appears as |
   |---|---|
   | `routes` | Pages. Wrapped in `RequireModule` when `moduleKey` is set |
   | `nav` | Drawer item under the module's stage |
   | `flowSteps` | Step with a live count in the flow bar under the top bar |
   | `inboxQueues` | A tab in Inbox, with a pending count |
   | `setupSections` | A tab in Setup |
   | `dealTabs` | A tab on every deal page |
   | `dealSteps` | A step in every deal's lifecycle strip |

3. **Register.** Add the manifest to `FEATURE_MODULES` in
   `src/app/registry/features.ts`.
4. **Grant.** Give the key to the groups that should see it.

Run `npm test`: `registry.test.ts` fails if the manifest references an unknown
key, collides with another module, points nav at a missing route, or leaves a
catalogue key with no surface.

## Rules

- Pages are `lazy()` imports in the manifest, so a module costs nothing until
  opened.
- Count and step hooks receive `enabled`; pass it to the query so users
  without the module make no calls (they would 403).
- A page shown inside a hub renders through `PageFrame` and `SectionHeader`;
  both drop the page's own title when embedded.
- No redirects for renamed routes before go-live: rename and fix the links.

## Example: a servicing module

```tsx
export const servicingModule: ModuleManifest = {
  id: 'servicing',
  stage: 'servicing',
  routes: [{ path: '/loans', moduleKey: 'inst:servicing', element: <LoanBook /> }],
  nav: [{ label: 'Loan book', path: '/loans', iconKey: 'Landmark', moduleKeys: ['inst:servicing'], order: 10 }],
  flowSteps: [{ key: 'arrears', label: 'In arrears', path: '/loans', moduleKeys: ['inst:servicing'], order: 10, useCount: useArrearsCount }],
  dealSteps: [{ key: 'disbursed', label: 'Disbursed', moduleKey: 'inst:servicing', order: 50, useStep: useDisbursementStep }],
}
```

That one file adds a **Servicing** section to the drawer, an **In arrears**
step to the flow bar, and a **Disbursed** step to every deal.
