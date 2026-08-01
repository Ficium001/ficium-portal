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
  const { data: myGroup, isLoading: groupLoading } = useMyGroup()
  const category       = moduleKey.startsWith('admin:') ? 'admin' : 'institution'
  const entitlementKey = MODULE_ENTITLEMENT_KEY[moduleKey]
  const { data: myInstitution, isLoading: instLoading } = useMyInstitution({
    enabled: category === 'institution' && !!entitlementKey,
  })

  const isLoading = groupLoading || (category === 'institution' && !!entitlementKey && instLoading)
  if (isLoading) return { allowed: false, isLoading: true }

  const permissions = myGroup?.module_permissions ?? []
  const isWildcard  = permissions.includes('*') && myGroup?.user_type === category
  const rbacAllowed = isWildcard || permissions.includes(moduleKey)
  const entitled    = !entitlementKey || (myInstitution?.modules ?? []).includes(entitlementKey)

  return { allowed: rbacAllowed && entitled, isLoading: false }
}
