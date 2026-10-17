import { useBadge } from '@/app/registry/useBadges'
/** Credit authorisation — approval-chain stages (committees, delegated authority). */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const ApprovalChainsInbox = lazy(() => import('./pages/ApprovalChainsInbox'))
const CreditApprovalSetup = lazy(() => import('./pages/CreditApprovalSetup'))

function useAwaitingMyVote(enabled: boolean): number {
  return useBadge('awaiting_my_vote', enabled)
}

export const approvalChainsModule: ModuleManifest = {
  id: 'approval-chains',
  stage: 'authorisation',
  inboxQueues: [{
    key: 'credit', label: 'Credit', moduleKey: 'inst:approvals', order: 20,
    element: <ApprovalChainsInbox />, useCount: useAwaitingMyVote,
  }],
  setupSections: [{
    key: 'credit-approval', label: 'Credit approval', moduleKey: 'inst:approvals', order: 35,
    element: <CreditApprovalSetup />,
  }],
}
