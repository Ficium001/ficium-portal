/**
 * Setup › Workflows — each product's deal workflow: its stages, which stage is
 * credit-approved, and the document checklist that gates each stage.
 * (Was Settings › Pipelines.)
 */
import { PageFrame } from '@/shared/components/PageFrame'
import { SectionHeader } from '@/institution/components/primitives'
import { PipelineTemplatesTab } from '@/institution/settings/components/PipelineTemplatesTab'

export default function WorkflowsSetup() {
  return (
    <PageFrame className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <SectionHeader
        title="Workflows"
        subtitle="What happens to a deal after acceptance, per product: stages, credit approval and required documents."
      />
      <PipelineTemplatesTab />
    </PageFrame>
  )
}
