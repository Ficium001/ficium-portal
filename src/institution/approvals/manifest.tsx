import { useBadge } from '@/app/registry/useBadges'
/** Bid authorisation — maker-checker on bid submit/withdraw. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionApprovals = lazy(() => import('./pages/InstitutionApprovals'))

function usePendingBidActions(enabled: boolean): number {
  return useBadge('pending_bid_actions', enabled)
}

export const bidApprovalModule: ModuleManifest = {
  id: 'bid-approval',
  stage: 'authorisation',
  inboxQueues: [{
    key: 'bids', label: 'Bids', moduleKey: 'inst:bid_approval', order: 10,
    element: <InstitutionApprovals />, useCount: usePendingBidActions,
  }],
}
