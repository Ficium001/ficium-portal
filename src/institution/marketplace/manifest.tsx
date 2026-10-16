/** Marketplace — origination: anonymised borrower requests open for bids. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { useMarketplace } from '@/institution/hooks/useInstitution'
import RequestChat from '@/shared/components/RequestChat'

const InstitutionMarketplace = lazy(() => import('./pages/InstitutionMarketplace'))

function useOpenRequests(enabled: boolean): number {
  const { data } = useMarketplace(undefined, { enabled })
  const now = Date.now()
  return (data ?? []).filter(
    (r) => (r.status === 'open' || r.status === 'bidding') && new Date(r.bid_window_closes_at).getTime() > now,
  ).length
}

export const marketplaceModule: ModuleManifest = {
  id: 'marketplace',
  stage: 'origination',
  routes: [{ path: '/marketplace', moduleKey: 'inst:marketplace', element: <InstitutionMarketplace /> }],
  nav: [{ label: 'Marketplace', path: '/marketplace', iconKey: 'Store', moduleKeys: ['inst:marketplace'], order: 10 }],
  flowSteps: [{
    key: 'requests', label: 'Open requests', path: '/marketplace',
    moduleKeys: ['inst:marketplace'], order: 10, useCount: useOpenRequests,
  }],
  dealTabs: [{
    key: 'messages', label: 'Messages', moduleKey: 'inst:marketplace', order: 40,
    render: (deal) => (
      <div className="bg-white border border-line rounded-card shadow-card h-[560px] flex flex-col overflow-hidden">
        <RequestChat requestId={deal.request_id} />
      </div>
    ),
  }],
}
