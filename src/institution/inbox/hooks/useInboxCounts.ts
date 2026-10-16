/**
 * useInboxCounts — how many items wait on this user, per Inbox section.
 *
 * Shared by the Inbox tabs and the nav badge so both show the same number.
 * Each queue is only queried if the user can open it (same rule as
 * RequireModule), so roles without a queue make no failing calls.
 */
import { usePendingActions } from '@/institution/hooks/useInstitution'
import { useApprovalInbox } from '@/institution/hooks/useApprovalEngine'
import { useModulesAccess } from '@/shared/hooks/useModuleAccess'

export interface InboxCounts {
  bids:     number
  credit:   number
  internal: number
  total:    number
}

const INBOX_KEYS = ['inst:bid_approval', 'inst:approvals', 'inst:dual_control'] as const

export function useInboxCounts(): InboxCounts {
  const access   = useModulesAccess(INBOX_KEYS)
  const bids     = usePendingActions('bids',     { enabled: access.allowed['inst:bid_approval'] })
  const internal = usePendingActions('internal', { enabled: access.allowed['inst:dual_control'] })
  const chains   = useApprovalInbox({ enabled: access.allowed['inst:approvals'] })

  const pending = (rows?: { action_status: string }[]) =>
    rows?.filter((a) => a.action_status === 'pending').length ?? 0

  const counts = {
    bids:     access.allowed['inst:bid_approval'] ? pending(bids.data) : 0,
    credit:   access.allowed['inst:approvals']    ? (chains.data?.filter((i) => !i.my_vote).length ?? 0) : 0,
    internal: access.allowed['inst:dual_control'] ? pending(internal.data) : 0,
  }
  return { ...counts, total: counts.bids + counts.credit + counts.internal }
}
