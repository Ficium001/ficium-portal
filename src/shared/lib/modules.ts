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
    path:        '/approvals',
    iconKey:     'Clock',
    shortcut:    'A',
  },
  {
    key:         'inst:approvals',
    label:       'Approval Chains',
    description: 'Committee votes and multi-stage approval chains (bids, offer letters, mandates)',
    category:    'institution',
    path:        '/approval-chains',
    iconKey:     'Users',
    shortcut:    'H',
  },
  {
    key:         'inst:esign',
    label:       'E-Signatures',
    description: 'Send, track and seal signature envelopes for offer letters and mandates',
    category:    'institution',
    path:        '/esign',
    iconKey:     'PenLine',
    shortcut:    'W',
  },
  {
    key:         'inst:dual_control',
    label:       'Dual Control',
    description: 'Four-eyes approval queue for internal actions (groups, users, settings)',
    category:    'institution',
    path:        '/inst-dual-control',
    iconKey:     'GitMerge',
    shortcut:    'Q',
  },
  {
    key:         'inst:products',
    label:       'Products',
    description: 'Manage product catalogue and rate configs',
    category:    'institution',
    path:        '/products',
    iconKey:     'Package',
    shortcut:    'P',
  },
  {
    key:         'inst:benefits',
    label:       'Benefits',
    description: 'Define institution benefits shown to clients on bids',
    category:    'institution',
    path:        '/benefits',
    iconKey:     'Gift',
    shortcut:    'F',
  },
  {
    key:         'inst:documents',
    label:       'Documents',
    description: 'Upload compliance documents required to bid',
    category:    'institution',
    path:        '/documents',
    iconKey:     'FolderCheck',
    shortcut:    'O',
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
    label:       'Pipelines',
    description: 'Manage post-acceptance loan processing pipelines',
    category:    'institution',
    path:        '/pipelines',
    iconKey:     'GitBranch',
    shortcut:    'N',
  },
  {
    key:         'inst:audit',
    label:       'Audit Trail',
    description: 'Read-only audit trail for institution activity',
    category:    'institution',
    path:        '/audit',
    iconKey:     'ScrollText',
    shortcut:    'L',
  },
  {
    key:         'inst:team',
    label:       'User Management',
    description: 'Manage institution users and group assignments',
    category:    'institution',
    path:        '/team/users',
    iconKey:     'Users',
    shortcut:    'T',
  },
  {
    key:         'inst:settings',
    label:       'Settings',
    description: 'Institution profile and configuration',
    category:    'institution',
    path:        '/settings',
    iconKey:     'Settings',
    shortcut:    'S',
  },
]

// ─── Admin modules ────────────────────────────────────────────

const ADMIN_MODULES: PortalModule[] = [
  {
    key:         'admin:dashboard',
    label:       'Dashboard',
    description: 'Ficium platform overview',
    category:    'admin',
    path:        '/dashboard',
    iconKey:     'LayoutDashboard',
    shortcut:    'D',
  },
  {
    key:         'admin:users',
    label:       'Users',
    description: 'Manage admin and institution user accounts',
    category:    'admin',
    path:        '/users',
    iconKey:     'Users',
    shortcut:    'U',
  },
  {
    key:         'admin:groups',
    label:       'Groups',
    description: 'Define user groups and module access',
    category:    'admin',
    path:        '/groups',
    iconKey:     'Shield',
    shortcut:    'G',
  },
  {
    key:         'admin:institutions',
    label:       'Institutions',
    description: 'Review and approve institution applications',
    category:    'admin',
    path:        '/institutions',
    iconKey:     'Building2',
    shortcut:    'I',
  },
  {
    key:         'admin:dual_control',
    label:       'Dual Control',
    description: 'Four-eyes approval queue for high-risk actions',
    category:    'admin',
    path:        '/dual-control',
    iconKey:     'GitMerge',
    shortcut:    'Q',
  },
  {
    key:         'admin:sessions',
    label:       'Sessions',
    description: 'Active session monitoring',
    category:    'admin',
    path:        '/sessions',
    iconKey:     'Radio',
    shortcut:    'E',
  },
  {
    key:         'admin:audit',
    label:       'Audit Log',
    description: 'Immutable platform-wide audit trail',
    category:    'admin',
    path:        '/admin-audit',
    iconKey:     'ScrollText',
    shortcut:    'L',
  },
  {
    key:         'admin:system',
    label:       'System',
    description: 'Infrastructure health and platform config',
    category:    'admin',
    path:        '/system',
    iconKey:     'MonitorDot',
    shortcut:    'Y',
  },
]

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
export const MODULE_ENTITLEMENT_KEY: Record<string, string> = {
  'inst:marketplace': 'marketplace',
  'inst:pipeline':     'pipeline',
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

export const SYSTEM_GROUPS: GroupSeed[] = [
  {
    slug:               'super_admin',
    label:              'Super Admin',
    description:        'Full platform access — all modules',
    module_permissions: ['*'],
    is_system:          true,
  },
  {
    slug:               'institution_admin',
    label:              'Institution Admin',
    description:        'Full institution portal + team management',
    module_permissions: INSTITUTION_MODULES.map(m => m.key),
    is_system:          true,
  },
  {
    slug:               'bank_officer',
    label:              'Bank Officer',
    description:        'Marketplace browse and bid submission',
    module_permissions: ['inst:dashboard', 'inst:marketplace', 'inst:bids'],
    is_system:          true,
  },
  {
    slug:               'bank_officer_approver',
    label:              'Bank Officer + Approval',
    description:        'Marketplace, bid submission and bid approval',
    module_permissions: ['inst:dashboard', 'inst:marketplace', 'inst:bids', 'inst:bid_approval'],
    is_system:          true,
  },
  {
    slug:               'it_admin',
    label:              'IT Admin',
    description:        'Technical setup — webhooks, settings, products, benefits',
    module_permissions: ['inst:dashboard', 'inst:products', 'inst:benefits', 'inst:settings'],
    is_system:          true,
  },
  {
    slug:               'compliance',
    label:              'Compliance',
    description:        'Document management and read-only audit access',
    module_permissions: ['inst:dashboard', 'inst:documents', 'inst:audit'],
    is_system:          true,
  },
  {
    slug:               'ficium_support',
    label:              'Ficium Support',
    description:        'Admin portal — users and sessions only',
    module_permissions: ['admin:dashboard', 'admin:users', 'admin:sessions', 'admin:audit'],
    is_system:          true,
  },
]
