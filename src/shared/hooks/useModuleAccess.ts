// =============================================================
// Ficium Portal — module access check
//
// `RequireModule` in app/routes.tsx gates whole ROUTES. This hook applies the
// same rule to controls rendered INSIDE a page the user is already allowed to
// see, where a redirect would be the wrong response.
//
// Both checks must stay identical, which is why the logic lives here and
// RequireModule consumes it rather than keeping its own copy.
//
// Two independent gates, both of which must pass:
//   RBAC        — the user's group holds the module key (or a matching wildcard)
//   Entitlement — the institution's pricing plan includes the module
// =============================================================
import { useMyGroup } from '@/admin/hooks/useAdmin'
import { useMyInstitution } from '@/institution/hooks/useInstitution'
import { MODULE_ENTITLEMENT_KEY } from '@/shared/lib/modules'

export interface ModuleAccess {
  /** True once both RBAC and entitlement checks pass. */
  allowed: boolean
  /** True while either underlying query is still resolving. */
  isLoading: boolean
}

export function useModuleAccess(moduleKey: string): ModuleAccess {
  const many = useModulesAccess([moduleKey])
  return { allowed: many.allowed[moduleKey] ?? false, isLoading: many.isLoading }
}

export interface ModulesAccess {
  /** Per-key result; false while loading. */
  allowed:   Record<string, boolean>
  isLoading: boolean
}

/**
 * Same rule as useModuleAccess, for several keys at once (hub pages that
 * show one tab per module). One group query, at most one institution query.
 */
export function useModulesAccess(moduleKeys: readonly string[]): ModulesAccess {
  const { data: myGroup, isLoading: groupLoading } = useMyGroup()
  const needsEntitlement = moduleKeys.some(
    (k) => !k.startsWith('admin:') && !!MODULE_ENTITLEMENT_KEY[k],
  )
  const { data: myInstitution, isLoading: instLoading } = useMyInstitution({
    enabled: needsEntitlement,
  })

  const isLoading = groupLoading || (needsEntitlement && instLoading)
  const allowed: Record<string, boolean> = {}
  if (isLoading) {
    for (const k of moduleKeys) allowed[k] = false
    return { allowed, isLoading: true }
  }

  const permissions = myGroup?.module_permissions ?? []
  for (const k of moduleKeys) {
    const category       = k.startsWith('admin:') ? 'admin' : 'institution'
    const entitlementKey = category === 'institution' ? MODULE_ENTITLEMENT_KEY[k] : undefined
    const isWildcard     = permissions.includes('*') && myGroup?.user_type === category
    const rbacAllowed    = isWildcard || permissions.includes(k)
    const entitled       = !entitlementKey || (myInstitution?.modules ?? []).includes(entitlementKey)
    allowed[k] = rbacAllowed && entitled
  }
  return { allowed, isLoading: false }
}
