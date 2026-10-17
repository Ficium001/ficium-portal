import { useBadge } from '@/app/registry/useBadges'
/** Bids — origination: offers this institution has made, awaiting the borrower. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionBids = lazy(() => import('./pages/InstitutionBids'))

function useLiveBids(enabled: boolean): number {
  return useBadge('live_bids', enabled)
}

export const bidsModule: ModuleManifest = {
  id: 'bids',
  stage: 'origination',
  routes: [{ path: '/bids', moduleKey: 'inst:bids', element: <InstitutionBids /> }],
  nav: [{ label: 'My bids', path: '/bids', iconKey: 'FileText', moduleKeys: ['inst:bids'], order: 20 }],
  flowSteps: [{
    key: 'bids', label: 'Live bids', path: '/bids',
    moduleKeys: ['inst:bids'], order: 20, useCount: useLiveBids,
  }],
}
