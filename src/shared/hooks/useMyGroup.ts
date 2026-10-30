import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'

/** The signed-in user's group (module permissions), from portal-api /members/my-group. */
export interface MyGroup {
  id?:                 string
  slug?:               string
  label?:              string
  description?:        string
  module_permissions?: string[]
  user_type?:          'admin' | 'institution'
  is_system?:          boolean
}

export function useMyGroup() {
  return useQuery<MyGroup | null>({
    queryKey: ['admin', 'my-group'],
    queryFn:  () => portalApi.get<MyGroup | null>('/members/my-group'),
    staleTime: 2 * 60 * 1000,
  })
}
