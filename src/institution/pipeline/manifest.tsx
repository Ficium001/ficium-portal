/** Deals — fulfilment: accepted bids moving through processing to completion. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { usePipelines } from './hooks/usePipeline'
import { DealOverview } from './components/DealOverview'

const InstitutionPipelines = lazy(() => import('./pages/InstitutionPipelines').then((m) => ({ default: m.InstitutionPipelines })))
const PipelineDetail       = lazy(() => import('./pages/PipelineDetail').then((m) => ({ default: m.PipelineDetail })))

const fmtShort = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' }) : undefined

function useActiveDeals(enabled: boolean): number {
  const { data } = usePipelines('active', { enabled })
  return data?.length ?? 0
}

export const dealsModule: ModuleManifest = {
  id: 'deals',
  stage: 'fulfilment',
  routes: [
    { path: '/deals',     moduleKey: 'inst:pipeline', element: <InstitutionPipelines /> },
    { path: '/deals/:id', moduleKey: 'inst:pipeline', element: <PipelineDetail /> },
  ],
  nav: [{ label: 'Deals', path: '/deals', iconKey: 'GitBranch', moduleKeys: ['inst:pipeline'], order: 10 }],
  flowSteps: [{
    key: 'deals', label: 'Deals in progress', path: '/deals',
    moduleKeys: ['inst:pipeline'], order: 40, useCount: useActiveDeals,
  }],
  dealSteps: [
    { key: 'accepted', label: 'Bid accepted', moduleKey: 'inst:pipeline', order: 10, tab: 'overview',
      useStep: (deal) => ({ state: 'done', detail: fmtShort(deal.started_at) }) },
    { key: 'processing', label: 'Processing', moduleKey: 'inst:pipeline', order: 20, tab: 'overview',
      useStep: (deal) => {
        const done = deal.stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length
        const all  = deal.stages.length
        return { state: all > 0 && done === all ? 'done' : 'current', detail: `${done}/${all} stages` }
      } },
  ],
  dealTabs: [{
    key: 'overview', label: 'Overview', moduleKey: 'inst:pipeline', order: 10,
    render: (deal) => <DealOverview deal={deal} />,
    Badge: ({ deal }) => {
      const done = deal.stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length
      return <>{done}/{deal.stages.length}</>
    },
  }],
}
