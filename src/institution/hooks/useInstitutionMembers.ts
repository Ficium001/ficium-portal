// =============================================================
// Ficium Portal — Institution members hook
// Shared by InstitutionUsers (team page) and any UI that needs to
// pick a specific person (e.g. committee member picker). Single
// source of truth for the ["institution", "members"] query so both
// consumers share the same cache instead of double-fetching.
// =============================================================
import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import type { InstitutionMember } from '@/institution/types/institution'

export function useInstitutionMembers(includeInactive = true) {
  return useQuery<InstitutionMember[]>({
    queryKey: ['institution', 'members'],
    queryFn: () => portalApi.get(`/members?include_inactive=${includeInactive}`),
    staleTime: 30_000,
  })
}
