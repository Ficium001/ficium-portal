/**
 * Booking hooks — read, record and correct a deal's core banking booking.
 * GET returns 404 until a booking exists; that is "not booked", not an error.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portalApi, PortalApiError } from '@/shared/lib/portalApi'
import type { Booking, BookingInput, BookingRequirements, ClosureInput } from '../types'

const BKQK = {
  one:  (dealId: string) => ['booking', dealId] as const,
  reqs: (dealId: string) => ['booking', dealId, 'requirements'] as const,
}

const NONE: BookingRequirements['requires'] = { monthly_amount: false, term_months: false }

/** Which extra fields to ask for. On any error, none: the server still refuses a booking that lacks one. */
export function useBookingRequirements(dealId: string, enabled = true) {
  return useQuery<BookingRequirements['requires']>({
    queryKey: BKQK.reqs(dealId),
    enabled:  enabled && !!dealId,
    queryFn:  async () => {
      try {
        return (await portalApi.get<BookingRequirements>(`/pipelines/${dealId}/booking/requirements`)).requires ?? NONE
      } catch {
        return NONE
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useCloseBooking(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ClosureInput) => portalApi.post<Booking>(`/pipelines/${dealId}/booking/closure`, body),
    onSuccess: (booking) => {
      qc.setQueryData(BKQK.one(dealId), booking)
      qc.invalidateQueries({ queryKey: ['pipelines'] })
    },
  })
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
