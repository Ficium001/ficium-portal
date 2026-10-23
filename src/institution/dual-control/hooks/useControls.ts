/**
 * Four-eyes switches (Setup › Controls).
 * Switching on applies at once; switching off goes to a second admin.
 * The database enforces every rule; these hooks only call it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import type { FourEyesControl } from '../types'

export const CTRLQK = { all: ['controls', 'four-eyes'] as const }

export function useFourEyesControls() {
  return useQuery<FourEyesControl[]>({
    queryKey: CTRLQK.all,
    queryFn:  () => portalApi.get<FourEyesControl[]>('/controls/four-eyes'),
    staleTime: 30_000,
  })
}

export function useSetFourEyes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, on }: { category: string; on: boolean }) =>
      portalApi.post<{ status?: string }>(
        `/controls/four-eyes/${encodeURIComponent(category)}/${on ? 'enable' : 'disable'}`, {}),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: CTRLQK.all })
      qc.invalidateQueries({ queryKey: ['pending-actions'] })
    },
  })
}
