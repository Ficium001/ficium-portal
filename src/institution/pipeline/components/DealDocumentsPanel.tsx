// =============================================================
// Ficium Portal — deal documents
//
// Closes the gap between the pipeline, doc-templates and e-sign modules.
// Previously a deal's documents lived entirely outside the deal: you opened
// the Doc Templates screen, picked the deal back out of a dropdown, generated,
// downloaded the file, then retyped its storage path into an e-sign envelope.
//
// This panel puts the whole chain where the work actually happens — generate
// against this deal, see what has already been produced for it, and send a
// generated document for signature with its path and provenance carried over
// automatically.
// =============================================================
import { useState } from 'react'
import { FileText, Download, PenLine, Loader2 } from 'lucide-react'
import { Btn, EmptyState, InlineAlert, Modal, FormField, inputCls } from '@/institution/components/primitives'
import {
  useDocTemplates,
  useEntityGenerations,
  useGenerateDocument,
  downloadGeneration,
} from '@/institution/doc-templates/hooks/useDocTemplates'
import { DOC_CATEGORY_LABEL } from '@/institution/doc-templates/types/docTemplates'
import { EnvelopeCreateModal } from '@/institution/esign/components/EnvelopeCreateModal'
import { PortalApiError } from '@/shared/lib/portalApi'
import type { DocumentSubject } from '@/shared/lib/entities'
import { useModuleAccess } from '@/shared/hooks/useModuleAccess'
import type { DocGeneration } from '@/institution/doc-templates/types/docTemplates'

const SUBJECT: DocumentSubject = 'loan_pipeline'

function GenerateModal({
  pipelineId, onClose,
}: { pipelineId: string; onClose: () => void }) {
  const { data: templates, isLoading } = useDocTemplates()
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const generate = useGenerateDocument(templateId)

  // Only published templates can produce a document.
  const usable = (templates ?? []).filter(t => t.status === 'active')

  const submit = async () => {
    if (!templateId) return
    setError(null)
    try {
      await generate.mutateAsync({ entity_type: SUBJECT, entity_id: pipelineId, output_pdf: true })
      onClose()
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'Could not generate the document. Please retry.')
    }
  }

  return (
    <Modal open onClose={onClose} title="Generate document">
      <div className="space-y-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        {!isLoading && usable.length === 0 && (
          <InlineAlert variant="warning">
            No active templates. A template needs a published version before it can be used.
          </InlineAlert>
        )}
        <FormField label="Template" required hint="Merge fields are filled from this deal's current data.">
          <select className={inputCls} value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">Choose a template…</option>
            {usable.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({DOC_CATEGORY_LABEL[t.doc_category]})
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={!templateId || generate.isPending}>
            {generate.isPending ? 'Generating…' : 'Generate'}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

export function DealDocumentsPanel({
  pipelineId, dealLabel,
}: { pipelineId: string; dealLabel: string }) {
  // inst:pipeline gates this page, but documents and signatures are separate
  // licensed modules. The whole doc-templates router is guarded by
  // require_module('inst:doctemplates'), so for a pipeline-only user the
  // generations query itself 403s — gate the query, not just the button.
  const docs    = useModuleAccess('inst:doctemplates')
  const canSign = useModuleAccess('inst:esign').allowed

  const { data: generations, isLoading } = useEntityGenerations(
    SUBJECT, docs.allowed ? pipelineId : null,
  )
  const [showGenerate, setShowGenerate] = useState(false)
  const [signFor, setSignFor] = useState<DocGeneration | null>(null)

  // Nothing to show and nothing to do without the module — render nothing
  // rather than an empty section the user can never populate.
  if (docs.isLoading || !docs.allowed) return null

  const rows = generations ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold text-muted uppercase tracking-widest">
          Documents
        </h2>
        <Btn variant="ghost" onClick={() => setShowGenerate(true)}>
          <FileText size={14} /> Generate
        </Btn>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted px-1 py-3">
          <Loader2 size={14} className="animate-spin" /> Loading documents…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Generate a loan agreement, facility letter or other document from one of your templates."
        />
      ) : (
        <div className="space-y-2">
          {rows.map(g => {
            const path = g.output_pdf_path ?? g.output_docx_path
            const name = path?.split('/').pop() ?? 'Document'
            const failed = g.status === 'failed'
            const ready  = g.status === 'generated' && !!path
            return (
              <div
                key={g.id}
                className="flex items-center gap-3 bg-white border border-line rounded-2xl px-4 py-3"
              >
                <FileText size={16} className="text-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink truncate">{name}</div>
                  <div className="text-[11px] text-muted">
                    {failed
                      ? (g.error ?? 'Generation failed')
                      : g.generated_at
                        ? `Generated ${new Date(g.generated_at).toLocaleString()}`
                        : 'Generating…'}
                    {g.esign_envelope_id && ' · sent for signature'}
                  </div>
                </div>
                {ready && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Btn
                      variant="ghost"
                      onClick={() => void downloadGeneration(g.id, g.output_pdf_path ? 'pdf' : 'docx', name)}
                    >
                      <Download size={14} />
                    </Btn>
                    {canSign && !g.esign_envelope_id && (
                      <Btn variant="ghost" onClick={() => setSignFor(g)}>
                        <PenLine size={14} /> Sign
                      </Btn>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showGenerate && (
        <GenerateModal pipelineId={pipelineId} onClose={() => setShowGenerate(false)} />
      )}
      {signFor && (
        <EnvelopeCreateModal
          onClose={() => setSignFor(null)}
          presetEntityId={pipelineId}
          presetTitle={dealLabel}
        />
      )}
    </div>
  )
}
