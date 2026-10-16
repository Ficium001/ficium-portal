/** Credit authorisation — approval-chain stages (committees, delegated authority). */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { useApprovalInbox } from '@/institution/hooks/useApprovalEngine'

const ApprovalChainsInbox = lazy(() => import('./pages/ApprovalChainsInbox'))

function useAwaitingMyVote(enabled: boolean): number {
  const { data } = useApprovalInbox({ enabled })
  return (data ?? []).filter((i) => !i.my_vote).length
}

export const approvalChainsModule: ModuleManifest = {
  id: 'approval-chains',
  stage: 'authorisation',
  inboxQueues: [{
    key: 'credit', label: 'Credit', moduleKey: 'inst:approvals', order: 20,
    element: <ApprovalChainsInbox />, useCount: useAwaitingMyVote,
  }],
}
