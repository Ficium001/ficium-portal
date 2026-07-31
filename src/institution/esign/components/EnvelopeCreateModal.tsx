/**
 * @component EnvelopeCreateModal
 * @description
 *   Creates an e-sign envelope: pick the source document (from the
 *   institution's document library or a storage path), name both
 *   signers (borrower signs first, institution countersigns), and set
 *   the expiry window. The backend hashes the source document at
 *   creation and enforces the approval gate inside
 *   institution.esign_create_envelope().
 *
 * @dataSource useCreateEnvelope → ficium-portal-api POST /esign/envelopes
 * @owner Ficium Engineering
 */
import { useState } from 'react'
import { Send } from 'lucide-react'
import { useCreateEnvelope } from '@/institution/esign/hooks/useEsign'
import { useEntityGenerations, useDocTemplates } from '@/institution/doc-templates/hooks/useDocTemplates'
import { SUBJECT_LOAN_PIPELINE, esignEntityTypeForCategory } from '@/shared/lib/entities'
import { useDocuments, useInstitutionUsers } from '@/institution/hooks/useInstitution'
import { PortalApiError } from '@/shared/lib/portalApi'
import { Modal, Btn, FormField, InlineAlert, inputCls } from '@/institution/components/primitives'

type EntityType = 'offer_letter' | 'investment_mandate' | 'custom'

const ENTITY_LABELS: { value: EntityType; label: string }[] = [
  { value: 'offer_letter',       label: 'Offer letter' },
  { value: 'investment_mandate', label: 'Investment mandate' },
  { value: 'custom',             label: 'Other document' },
]

export function EnvelopeCreateModal({
  onClose,
  presetEntityId,
  presetTitle,
  presetApprovalInstanceId,
}: {
  onClose: () => void
  /** Deal id to prefill, when opened from a pipeline deal rather than the e-sign list. */
  presetEntityId?: string
  presetTitle?: string
  /** Approval decision that authorised this envelope, when raised from an approval. */
  presetApprovalInstanceId?: string
}) {
  const create = useCreateEnvelope()
  const { data: docs }  = useDocuments()
  const { data: users } = useInstitutionUsers()
  const { data: allTemplates } = useDocTemplates()

  const [entityType, setEntityType]   = useState<EntityType>('offer_letter')
  const [entityId, setEntityId]       = useState(presetEntityId ?? '')
  const [title, setTitle]             = useState(presetTitle ?? '')
  const [documentPath, setDocumentPath] = useState('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [expiresHours, setExpiresHours] = useState(72)
  const [borrowerName, setBorrowerName]   = useState('')
  const [borrowerEmail, setBorrowerEmail] = useState('')
  const [counterRef, setCounterRef]       = useState('')
  const [error, setError] = useState<string | null>(null)

  // Documents generated from a doc template against this deal. Previously the
  // picker only offered the compliance document library (`/documents`), so a
  // loan agreement generated for this very deal never appeared and the operator
  // had to paste its storage path by hand.
  const { data: generations } = useEntityGenerations(SUBJECT_LOAN_PIPELINE, entityId.trim() || null)
  const signableGenerations = (generations ?? []).filter(
    g => g.status === 'generated' && (g.output_pdf_path || g.output_docx_path),
  )

  const countersigner = users?.find(u => u.id === counterRef)

  const canSubmit =
    entityId.trim() !== '' && title.trim() !== '' && documentPath.trim() !== '' &&
    borrowerName.trim() !== '' && /\S+@\S+\.\S+/.test(borrowerEmail) &&
    countersigner != null && !create.isPending

  const submit = async () => {
    if (!canSubmit || !countersigner) return
    setError(null)
    try {
      await create.mutateAsync({
        entity_type: entityType,
        entity_id: entityId.trim(),
        approval_instance_id: presetApprovalInstanceId,
        title: title.trim(),
        document_path: documentPath.trim(),
        doc_generation_id: generationId ?? undefined,
        expires_hours: expiresHours,
        borrower_name: borrowerName.trim(),
        borrower_email: borrowerEmail.trim(),
        countersigner_name: countersigner.full_name ?? countersigner.email ?? 'Institution signer',
        countersigner_email: countersigner.email ?? '',
        countersigner_ref: countersigner.id,
      })
      onClose()
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'Could not create the envelope. Please retry.')
    }
  }

  return (
    <Modal open onClose={onClose} title="New signature envelope" width="max-w-xl">
      <div className="space-y-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Document type" required>
            <select
              className={inputCls}
              value={entityType}
              onChange={e => setEntityType(e.target.value as EntityType)}
            >
              {ENTITY_LABELS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="Related record ID" required hint="Bid, mandate or pipeline record this document belongs to.">
            <input className={inputCls} value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="e.g. bid UUID" />
          </FormField>
        </div>

        <FormField label="Envelope title" required hint="Shown to the borrower on the signing page and in emails.">
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Home loan offer letter — MUR 4,500,000" />
        </FormField>

        <FormField
          label="Source document"
          required
          hint="A PDF in the institution-docs storage bucket. Its SHA-256 is fixed at creation and verified again at sealing."
        >
          {(signableGenerations.length > 0 || (docs && docs.length > 0)) ? (
            <select
              className={inputCls}
              value={documentPath}
              onChange={e => {
                const path = e.target.value
                setDocumentPath(path)
                // Track the generation when the chosen document came from a
                // template, so the envelope records what produced it.
                const gen = signableGenerations.find(
                  g => (g.output_pdf_path ?? g.output_docx_path) === path,
                )
                setGenerationId(gen?.id ?? null)
                // Derive the e-sign entity type from the source template's
                // category, so the two vocabularies stay reconciled in one
                // place instead of the operator guessing.
                const tpl = gen && allTemplates?.find(t => t.id === gen.template_id)
                if (tpl) setEntityType(esignEntityTypeForCategory(tpl.doc_category))
              }}
            >
              <option value="">Choose a document…</option>
              {signableGenerations.length > 0 && (
                <optgroup label="Generated for this deal">
                  {signableGenerations.map(g => {
                    const path = g.output_pdf_path ?? g.output_docx_path ?? ''
                    const when = g.generated_at ? new Date(g.generated_at).toLocaleDateString() : 'pending'
                    return (
                      <option key={g.id} value={path}>
                        {path.split('/').pop()} — generated {when}
                      </option>
                    )
                  })}
                </optgroup>
              )}
              {docs && docs.length > 0 && (
                <optgroup label="Document library">
                  {docs.map(d => (
                    <option key={d.id} value={d.storage_path}>{d.file_name} ({d.doc_type_label})</option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : (
            <input className={inputCls} value={documentPath} onChange={e => setDocumentPath(e.target.value)} placeholder="storage path, e.g. offers/2026/xyz.pdf" />
          )}
        </FormField>

        <div className="border-t border-line pt-4">
          <p className="text-[12px] font-bold text-ink mb-3">Signer 1 — borrower</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Full name" required>
              <input className={inputCls} value={borrowerName} onChange={e => setBorrowerName(e.target.value)} />
            </FormField>
            <FormField label="Email" required hint="The signing link and verification codes go here.">
              <input className={inputCls} type="email" value={borrowerEmail} onChange={e => setBorrowerEmail(e.target.value)} />
            </FormField>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-[12px] font-bold text-ink mb-3">Signer 2 — institution countersigner</p>
          <FormField label="Team member" required hint="Countersigns after the borrower. Cannot be changed once sent.">
            <select className={inputCls} value={counterRef} onChange={e => setCounterRef(e.target.value)}>
              <option value="">Choose a team member…</option>
              {users?.map(u => (
                <option key={u.id} value={u.id}>{u.full_name ?? u.email} — {u.role}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Signing window" hint="The envelope expires if not fully signed within this window.">
          <select className={inputCls} value={expiresHours} onChange={e => setExpiresHours(Number(e.target.value))}>
            <option value={24}>24 hours</option>
            <option value={72}>72 hours</option>
            <option value={168}>7 days</option>
            <option value={336}>14 days</option>
          </select>
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Send} onClick={submit} loading={create.isPending} disabled={!canSubmit}>
            Create and send
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
