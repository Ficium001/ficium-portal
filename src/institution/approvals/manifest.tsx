/** Bid authorisation — maker-checker on bid submit/withdraw. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { usePendingActions } from '@/institution/hooks/useInstitution'

const InstitutionApprovals = lazy(() => import('./pages/InstitutionApprovals'))

function usePendingBidActions(enabled: boolean): number {
  const { data } = usePendingActions('bids', { enabled })
  return (data ?? []).filter((a) => a.action_status === 'pending').length
}

export const bidApprovalModule: ModuleManifest = {
  id: 'bid-approval',
  stage: 'authorisation',
  inboxQueues: [{
    key: 'bids', label: 'Bids', moduleKey: 'inst:bid_approval', order: 10,
    element: <InstitutionApprovals />, useCount: usePendingBidActions,
  }],
}
