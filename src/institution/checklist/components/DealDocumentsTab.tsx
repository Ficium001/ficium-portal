/**
 * The deal's Documents tab: the checklist (what must be collected and
 * verified) and, for institutions with document templates, the letters and
 * agreements generated for this deal. One place for every document on a deal.
 */
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'
import { DealDocumentsPanel } from '@/institution/pipeline/components/DealDocumentsPanel'
import { useModuleAccess } from '@/shared/hooks/useModuleAccess'
import { DealChecklist } from './DealChecklist'

export function DealDocumentsTab({ deal }: { deal: PipelineDetail }) {
  const templates = useModuleAccess('inst:doctemplates')
  return (
    <div className="space-y-8">
      <section aria-labelledby="checklist-h">
        <h2 id="checklist-h" className="text-[13px] font-semibold text-ink mb-3">Checklist</h2>
        <DealChecklist pipelineId={deal.id} readOnly={deal.status !== 'active'} />
      </section>
      {templates.allowed && (
        <section aria-labelledby="generated-h">
          <h2 id="generated-h" className="text-[13px] font-semibold text-ink mb-3">Generated from templates</h2>
          <DealDocumentsPanel
            pipelineId={deal.id}
            dealLabel={`${deal.product_label} — ref ${deal.consumer_ref}`}
            borrowerName={deal.borrower_name}
            borrowerEmail={deal.borrower_email}
          />
        </section>
      )}
    </div>
  )
}
