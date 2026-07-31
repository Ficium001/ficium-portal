// =============================================================
// Ficium Portal — visibility-aware polling
//
// Portal users (bank officers, approvers) typically leave the portal
// open in a background tab for most of the working day. A hardcoded
// `refetchInterval` keeps firing at full rate against ficium-portal-api
// on Railway while nobody is looking at the screen — burning metered
// API capacity, keeping containers warm for no reason, and draining
// battery/data on mobile.
//
// These helpers back off hard when the document is hidden, and callers
// pair them with `refetchOnWindowFocus: true` (+ optionally
// `useInvalidateOnVisible`) so returning to the tab produces an
// immediate refresh rather than a stale view.
// =============================================================
import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'

/** Poll every `visibleMs` while the tab is visible, `hiddenMs` while hidden. */
export function pollWhenVisible(visibleMs: number, hiddenMs = 5 * 60_000): () => number {
  return () => {
    if (typeof document === 'undefined') return visibleMs
    return document.visibilityState === 'visible' ? visibleMs : hiddenMs
  }
}

/** 30s while visible, 5 min while hidden. */
export const poll30s = pollWhenVisible(30_000)

/** 60s while visible, 5 min while hidden. */
export const poll60s = pollWhenVisible(60_000)

/**
 * Invalidate `queryKey` whenever the user switches back to this tab, so the
 * gap created by backing off while hidden is closed immediately on return.
 */
export function useInvalidateOnVisible(queryKey: QueryKey): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [queryClient, JSON.stringify(queryKey)])
}
