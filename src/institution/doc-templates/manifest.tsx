/** Document templates — offer letters and agreements generated per deal. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'
import { DealDocumentsPanel } from '@/institution/pipeline/components/DealDocumentsPanel'
import { useEntityGenerations } from './hooks/useDocTemplates'

function useDocumentsStep(deal: PipelineDetail, enabled: boolean) {
  const { data } = useEntityGenerations('loan_pipeline', enabled ? deal.id : null)
  const n = (data ?? []).filter((g) => g.status === 'generated').length
  return n > 0
    ? { state: 'done' as const, detail: `${n} generated` }
    : { state: 'todo' as const, detail: 'None yet' }
}

const DocTemplates = lazy(() => import('./pages/DocTemplates'))

export const docTemplatesModule: ModuleManifest = {
  id: 'doc-templates',
  stage: 'fulfilment',
  dealSteps: [{
    key: 'documents', label: 'Documents', moduleKey: 'inst:doctemplates', order: 30, tab: 'documents',
    useStep: useDocumentsStep,
  }],
  dealTabs: [{
    key: 'documents', label: 'Documents', moduleKey: 'inst:doctemplates', order: 20,
    render: (deal) => (
      <DealDocumentsPanel
        pipelineId={deal.id}
        dealLabel={`${deal.product_label} — ref ${deal.consumer_ref}`}
        borrowerName={deal.borrower_name}
        borrowerEmail={deal.borrower_email}
      />
    ),
  }],
  setupSections: [{
    key: 'documents', label: 'Document templates', moduleKey: 'inst:doctemplates', order: 40,
    element: <DocTemplates />,
  }],
}
