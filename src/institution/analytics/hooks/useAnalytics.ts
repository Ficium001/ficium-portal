// =============================================================
// Ficium — Institution Analytics Hook
// Module: inst:analytics — self-contained
// =============================================================
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchInstitutionAnalytics } from '../api/analyticsApi'
import type { InstitutionAnalytics } from '../types/analytics'

export const ANALYTICS_QK = {
  analytics: (days: number) => ['analytics', days] as const,
}

export function useAnalytics(days = 30) {
  return useQuery<InstitutionAnalytics>({
    queryKey: ANALYTICS_QK.analytics(days),
    queryFn:  () => fetchInstitutionAnalytics(days),
    staleTime: 5 * 60 * 1000,  // 5 min — analytics don't need real-time
    retry: 1,
  })
}

export function usePeriodSelector(defaultDays = 30) {
  const [days, setDays] = useState(defaultDays)
  const options = [
    { label: '7d',  value: 7  },
    { label: '30d', value: 30 },
    { label: '90d', value: 90 },
  ]
  return { days, setDays, options }
}
