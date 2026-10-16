/**
 * Booking hooks — read, record and correct a deal's core banking booking.
 * GET returns 404 until a booking exists; that is "not booked", not an error.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portalApi, PortalApiError } from '@/shared/lib/portalApi'
import type { Booking, BookingInput } from '../types'

export const BKQK = {
  one: (dealId: string) => ['booking', dealId] as const,
}

export function useBooking(dealId: string, enabled = true) {
  return useQuery<Booking | null>({
    queryKey: BKQK.one(dealId),
    enabled:  enabled && !!dealId,
    queryFn:  async () => {
      try {
        return await portalApi.get<Booking>(`/pipelines/${dealId}/booking`)
      } catch (e) {
        if (e instanceof PortalApiError && e.status === 404) return null
        throw e
      }
    },
    staleTime: 60_000,
  })
}

export function useSaveBooking(dealId: string, correction: boolean) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BookingInput) =>
      correction
        ? portalApi.put<Booking>(`/pipelines/${dealId}/booking`, body)
        : portalApi.post<Booking>(`/pipelines/${dealId}/booking`, body),
    onSuccess: (booking) => {
      qc.setQueryData(BKQK.one(dealId), booking)
      qc.invalidateQueries({ queryKey: ['pipelines'] })
    },
  })
}
