/**
 * Nav badge counts, all from ONE request (GET /portal/badges).
 *
 * Each nav item used to fetch its whole list just to count it: nine list
 * requests on every page, several polled every 30 s, queued ahead of the
 * page's own data (browsers allow 6 requests per host at a time). The API
 * computes the counts from the same list queries, so the numbers match the
 * screens. Any successful mutation refreshes them (see query-client.ts).
 */
import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import { poll60s } from '@/shared/lib/polling'

export type BadgeKey =
  | 'open_requests' | 'live_bids' | 'active_deals' | 'awaiting_booking'
  | 'awaiting_signature' | 'pending_bid_actions' | 'pending_internal' | 'awaiting_my_vote'

export const BADGES_QK = ['portal', 'badges'] as const

export function useBadgeCounts(enabled = true) {
  return useQuery<Record<BadgeKey, number | null>>({
    queryKey: BADGES_QK,
    queryFn: () => portalApi.get('/portal/badges'),
    enabled,
    staleTime: 25_000,
    refetchInterval: poll60s,
    refetchOnWindowFocus: true,
  })
}

/** One badge's count; 0 when hidden, loading, or not permitted. */
export function useBadge(key: BadgeKey, enabled: boolean): number {
  const { data } = useBadgeCounts(enabled)
  return enabled ? (data?.[key] ?? 0) : 0
}
