/**
 * Whether the current user administers their institution's configuration.
 * Same rule Settings has always used: admin role, primary admin, or an admin
 * group (the group query is the one the shell already relies on).
 */
import { useMyRole } from '@/institution/hooks/useInstitution'
import { useMyGroup } from '@/admin/hooks/useAdmin'

export function useIsInstitutionAdmin(): boolean {
  const { data: role } = useMyRole()
  const { data: myGroup } = useMyGroup()
  return role?.role === 'admin' || !!role?.is_primary_admin
    || !!myGroup?.label?.toLowerCase().includes('admin')
}
