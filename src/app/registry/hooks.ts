/**
 * Registry-wide counts used by more than one surface (nav badge, Inbox tabs,
 * flow bar), so all three always show the same numbers.
 */
import { INBOX_QUEUES } from './select'
import { useCounts, type Countable } from './useCounts'

const INBOX_COUNTABLES: readonly Countable[] =
  INBOX_QUEUES.map((q) => ({ key: q.key, moduleKeys: [q.moduleKey], useCount: q.useCount }))

/** Per-queue pending counts for the queues this user can open. */
export function useInboxCounts(): Record<string, number> {
  return useCounts(INBOX_COUNTABLES)
}

/** Total items pending authorisation across the queues this user can open. */
export function useInboxTotal(enabled = true): number {
  const counts = useInboxCounts()
  return enabled ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
}

