/**
 * @module shared/lib/modules
 * @description
 *   Single source of truth for every portal module across both
 *   institution and admin surfaces.
 *
 *   A "module" maps 1:1 to a nav item and a permission key stored
 *   in user_groups.module_permissions[]. Shells filter their nav
 *   from this catalogue — no hardcoded visibility rules anywhere.
 *
 *   Categories:
 *     'institution' — visible to institution users
 *     'admin'       — visible to Ficium internal admins
 *
 * @owner Ficium Engineering
 */

export type ModuleCategory = 'institution' | 'admin'

export interface PortalModule {
  /** Stored in DB — never rename without a migration. */
  key:         string
  label:       string
  description: string
  category:    ModuleCategory
  /** React Router path. */
  path:        string
  /** Lucide icon name — resolved in shells. */
  iconKey:     string
  /** Vim-style keyboard shortcut (after G+). */
  shortcut?:   string
  /**
   * Set when the module is a tab inside another page rather than a page of
   * its own: `path` is then that host page, and the module gets no nav item
   * or shortcut. The key still gates the tab and appears in group permissions.
   */
  embeddedIn?: string
}

// ─── Institution modules ──────────────────────────────────────

const INSTITUTION_MODULES: PortalModule[] = [
  {
    key:         'inst:dashboard',
    label:       'Dashboard',
    description: 'Institution overview and KPIs',
    category:    'institution',
    path:        '/dashboard',
    iconKey:     'LayoutDashboard',
    shortcut:    'D',
  },
  {
    key:         'inst:marketplace',
    label:       'Marketplace',
    description: 'Browse and filter client financing requests',
    category:    'institution',
    path:        '/marketplace',
    iconKey:     'Store',
    shortcut:    'M',
  },
  {
    key:         'inst:bids',
    label:       'Bids',
    description: 'View and manage submitted bids',
    category:    'institution',
    path:        '/bids',
    iconKey:     'FileText',
    shortcut:    'B',
  },
  {
    key:         'inst:bid_approval',
    label:       'Approval',
    description: 'Approve or reject bids as checker',
    category:    'institution',
    path:        '/inbox?section=bids',
    iconKey:     'Clock',
    shortcut:    'A',
  },
  {
    key:         'inst:approvals',
    label:       'Approval Chains',
    description: 'Committee votes and multi-stage approval chains (bids, offer letters, mandates)',
    category:    'institution',
    path:        '/inbox?section=credit',
    iconKey:     'Users',
    shortcut:    'H',
  },
  {
    key:         'inst:esign',
    label:       'E-Signatures',
    description: 'Send, track and seal signature envelopes for offer letters and mandates (Signatures tab on a deal)',
    category:    'institution',
    path:        '/deals',
    iconKey:     'PenLine',
    embeddedIn:  'inst:pipeline',
  },
  {
    key:         'inst:booking',
    label:       'Booking',
    description: 'Record the loan booking from your core banking system (Booking tab on a deal)',
    category:    'institution',
    path:        '/deals',
    iconKey:     'Landmark',
    embeddedIn:  'inst:pipeline',
  },
  {
    key:         'inst:doctemplates',
    label:       'Doc Templates',
    description: 'Design loan agreements and facility letters, generate populated Word/PDF per deal',
    category:    'institution',
    path:        '/setup?section=documents',
    iconKey:     'FileType2',
    shortcut:    'J',
  },
  {
    key:         'inst:dual_control',
    label:       'Dual Control',
    description: 'Four-eyes approval queue for internal actions (groups, users, settings)',
    category:    'institution',
    path:        '/inbox?section=internal',
    iconKey:     'GitMerge',
    shortcut:    'Q',
  },
  {
    key:         'inst:products',
    label:       'Products',
    description: 'Manage product catalogue and rate configs',
    category:    'institution',
    path:        '/setup?section=products',
    iconKey:     'Package',
    shortcut:    'P',
  },
  {
    key:         'inst:benefits',
    label:       'Benefits',
    description: 'Priced benefits shown on bids, managed per product (Setup › Products)',
    category:    'institution',
    path:        '/setup?section=products',
    iconKey:     'Gift',
    embeddedIn:  'inst:products',
  },
  {
    key:         'inst:analytics',
    label:       'Analytics',
    description: 'Bid performance, win rate, and deal value analytics',
    category:    'institution',
    path:        '/analytics',
    iconKey:     'BarChart2',
    shortcut:    'Z',
  },
  {
    key:         'inst:notifications',
    label:       'Notifications',
    description: 'Bid outcomes, pipeline events, and approval alerts',
    category:    'institution',
    path:        '/notifications',
    iconKey:     'Bell',
    shortcut:    'V',
  },
  {
    key:         'inst:pipeline',
    label:       'Deals',
    description: 'Accepted deals: processing stages, documents, signatures and borrower messages',
    category:    'institution',
    path:        '/deals',
    iconKey:     'GitBranch',
    shortcut:    'N',
  },
  {
    key:         'inst:audit',
    label:       'Audit Trail',
    description: 'Read-only audit trail for institution activity',
    category:    'institution',
    path:        '/setup?section=audit',
    iconKey:     'ScrollText',
    shortcut:    'L',
  },
  {
    key:         'inst:team',
    label:       'User Management',
    description: 'Manage institution users and group assignments',
    category:    'institution',
    path:        '/setup?section=team',
    iconKey:     'Users',
    shortcut:    'T',
  },
  {
    key:         'inst:settings',
    label:       'Settings',
    description: 'Institution profile and configuration',
    category:    'institution',
    path:        '/setup',
    iconKey:     'Settings',
    shortcut:    'S',
  },
]

// ─── Admin modules ────────────────────────────────────────────

// Retired: platform admin moved to the Ficium Portal Admin site (ficium-admin).
const ADMIN_MODULES: PortalModule[] = []

// ─── Exports ──────────────────────────────────────────────────

export const MODULE_CATALOGUE: PortalModule[] = [
  ...INSTITUTION_MODULES,
  ...ADMIN_MODULES,
]

export const MODULE_BY_KEY = Object.fromEntries(
  MODULE_CATALOGUE.map(m => [m.key, m])
) as Record<string, PortalModule>

/** All institution modules in display order. */
export const INSTITUTION_MODULE_LIST = INSTITUTION_MODULES

/** All admin modules in display order. */
export const ADMIN_MODULE_LIST = ADMIN_MODULES

/** Filter a module list to only those keys present in a permission set. */
export function allowedModules(
  list: PortalModule[],
  permissions: string[],
  userType?: 'admin' | 'institution',
): PortalModule[] {
  if (permissions.includes('*')) {
    // Wildcard — return only modules matching the user's category
    // so admins don't see inst:* and institution users don't see admin:*
    if (userType === 'admin')       return list.filter(m => m.category === 'admin')
    if (userType === 'institution') return list.filter(m => m.category === 'institution')
    return list // fallback: unknown user_type gets everything (shouldn't happen)
  }
  return list.filter(m => permissions.includes(m.key))
}

// ─── Institution-level entitlement (pricing) ──────────────────
// Maps a nav module key → the short key stored in
// institution.institution.modules (jsonb array), set by Ficium admin
// per the institution's pricing plan. This is a licensing gate — separate
// from allowedModules() above, which is per-user RBAC within a group.
// Modules not listed here (dashboard, settings, team, etc.) aren't priced
// per-module and are always shown once RBAC allows them.
// NOTE: the values below look inconsistently named on purpose — they mirror
// what ficium-portal-api actually checks against institution.modules, and the
// backend's own keys are not consistent:
//   pipeline router      require_module("pipeline")          — bare
//   doc_templates router require_module("inst:doctemplates") — prefixed
//   autobid router       require_module("AUTOBID")           — upper-case
// This map is the compensating translation layer. Normalising it here without
// a matching backend change plus a data migration of existing
// institution.modules values would silently revoke live entitlements.
export const MODULE_ENTITLEMENT_KEY: Record<string, string> = {
  'inst:marketplace': 'marketplace',
  'inst:pipeline':     'pipeline',
  'inst:doctemplates': 'inst:doctemplates',
}

/**
 * Filter a module list further by institution-level entitlement.
 * A module with an entry in MODULE_ENTITLEMENT_KEY is hidden unless its
 * mapped short key is present in `institutionModules`. Modules with no
 * entry are unaffected (pass through).
 */
export function filterByEntitlement(
  list: PortalModule[],
  institutionModules: string[],
): PortalModule[] {
  return list.filter(m => {
    const entitlementKey = MODULE_ENTITLEMENT_KEY[m.key]
    if (!entitlementKey) return true
    return institutionModules.includes(entitlementKey)
  })
}

// ─── System group seeds ───────────────────────────────────────
// Mirrors DB seed data — used for display labels in the UI.

export interface GroupSeed {
  slug:               string
  label:              string
  description:        string
  module_permissions: string[]
  is_system:          boolean
}

