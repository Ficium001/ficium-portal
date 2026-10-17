import { useBadge } from '@/app/registry/useBadges'
/** Deals — fulfilment: accepted bids moving through processing to completion. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { DealOverview } from './components/DealOverview'
import { DealDocumentsTab } from '@/institution/checklist/components/DealDocumentsTab'
import { useDealDocuments } from '@/institution/checklist/hooks/useChecklist'
import { isDone } from '@/institution/checklist/types'
import type { PipelineDetail } from './types/pipeline'

const InstitutionPipelines = lazy(() => import('./pages/InstitutionPipelines').then((m) => ({ default: m.InstitutionPipelines })))
const WorkflowsSetup       = lazy(() => import('@/institution/settings/pages/WorkflowsSetup'))
const PipelineDetail       = lazy(() => import('./pages/PipelineDetail').then((m) => ({ default: m.PipelineDetail })))

const fmtShort = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' }) : undefined

function useDocumentsStep(deal: PipelineDetail, enabled: boolean) {
  const { data } = useDealDocuments(deal.id, enabled)
  const required = (data ?? []).filter((d) => d.mandatory)
  if (required.length === 0) return { state: 'done' as const, detail: 'None required' }
  const done = required.filter((d) => isDone(d.status)).length
  return {
    state: done === required.length ? ('done' as const) : done > 0 ? ('current' as const) : ('todo' as const),
    detail: `${done}/${required.length} verified`,
  }
}

function useActiveDeals(enabled: boolean): number {
  return useBadge('active_deals', enabled)
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
  setupSections: [{
    key: 'workflows', label: 'Workflows', moduleKey: 'inst:pipeline', order: 30,
    element: <WorkflowsSetup />,
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
    { key: 'documents', label: 'Documents', moduleKey: 'inst:pipeline', order: 30, tab: 'documents',
      useStep: useDocumentsStep },
  ],
  dealTabs: [{
    key: 'overview', label: 'Overview', moduleKey: 'inst:pipeline', order: 10,
    render: (deal) => <DealOverview deal={deal} />,
    Badge: ({ deal }) => {
      const done = deal.stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length
      return <>{done}/{deal.stages.length}</>
    },
  }, {
    key: 'documents', label: 'Documents', moduleKey: 'inst:pipeline', order: 20,
    render: (deal) => <DealDocumentsTab deal={deal} />,
    Badge: DocumentsBadge,
  }],
}

function DocumentsBadge({ deal }: { deal: PipelineDetail }) {
  const { data } = useDealDocuments(deal.id)
  const open = (data ?? []).filter((d) => d.mandatory && !isDone(d.status)).length
  return open > 0 ? <>{open} to do</> : null
}
