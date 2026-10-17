/**
 * DealChecklist — every document this deal needs, grouped by the stage it
 * gates, in one place.
 *
 *   Required → Received (uploaded) → Verified by a second person
 *                         ↘ Rejected (with a note) → re-upload
 *   or Waived, with a reason.
 *
 * A stage can't move on while a mandatory document of that stage isn't
 * verified or waived; the server enforces it, this screen explains it.
 */
import { useRef, useState } from 'react'
import { CheckCircle2, Circle, Download, FileText, Upload, XCircle, MinusCircle, Clock } from 'lucide-react'
import { Btn, EmptyState, InlineAlert, SkeletonCard } from '@/institution/components/primitives'
import { useDealDocuments, useReviewDealDocument, useUploadDealDocument } from '../hooks/useChecklist'
import { dealDocumentFileUrl } from '../api/checklist'
import { uploaderLabel } from '../uploader'
import { PROVIDED_BY_LABEL, isDone, type DealDocument, type DocStatus } from '../types'

const STATUS: Record<DocStatus, { label: string; cls: string; Icon: typeof Circle }> = {
  required: { label: 'Required',  cls: 'text-muted',      Icon: Circle },
  received: { label: 'To verify', cls: 'text-amber-700',  Icon: Clock },
  verified: { label: 'Verified',  cls: 'text-green-700',  Icon: CheckCircle2 },
  rejected: { label: 'Rejected',  cls: 'text-red-700',    Icon: XCircle },
  waived:   { label: 'Waived',    cls: 'text-muted',      Icon: MinusCircle },
}

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' }) : ''

function groupByStage(docs: DealDocument[]) {
  const groups = new Map<string, { label: string; stageStatus: string | null; docs: DealDocument[] }>()
  for (const d of docs) {
    const key = d.stage_def_id ?? 'deal'
    if (!groups.has(key)) groups.set(key, { label: d.stage_label ?? 'Whole deal', stageStatus: d.stage_status, docs: [] })
    groups.get(key)!.docs.push(d)
  }
  return [...groups.values()]
}

export function DealChecklist({ pipelineId, readOnly }: { pipelineId: string; readOnly: boolean }) {
  const { data, isLoading, isError } = useDealDocuments(pipelineId)

  if (isLoading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
  if (isError) return <InlineAlert variant="error">The checklist couldn't be loaded. Refresh to try again.</InlineAlert>
  const docs = data ?? []
  if (docs.length === 0) {
    return (
      <EmptyState icon={FileText} title="No documents required"
        description="This deal's workflow has no document checklist. Add one in Setup › Workflows." />
    )
  }

  const mandatory = docs.filter((d) => d.mandatory)
  const done = mandatory.filter((d) => isDone(d.status)).length

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-muted">
        {done} of {mandatory.length} required documents verified or waived.
        Each stage moves on once its required documents are.
      </p>
      {groupByStage(docs).map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="text-[12px] font-semibold text-ink mb-2">
            {g.label}
            {g.stageStatus === 'active' && <span className="ml-2 text-[11px] font-medium text-ficium">current stage</span>}
          </h3>
          <ul className="space-y-2">
            {g.docs.map((d) => <DocRow key={d.id} doc={d} pipelineId={pipelineId} readOnly={readOnly} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function DocRow({ doc, pipelineId, readOnly }: { doc: DealDocument; pipelineId: string; readOnly: boolean }) {
  const upload = useUploadDealDocument(pipelineId)
  const review = useReviewDealDocument(pipelineId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [noteFor, setNoteFor] = useState<'reject' | 'waive' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const s = STATUS[doc.status]

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "That didn't go through. Try again.")

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try { await upload.mutateAsync({ docId: doc.id, file }) } catch (e) { fail(e) }
    if (fileRef.current) fileRef.current.value = ''
  }
  async function act(action: 'verify' | 'reject' | 'waive', n?: string) {
    setError(null)
    try {
      await review.mutateAsync({ docId: doc.id, action, note: n })
      setNoteFor(null); setNote('')
    } catch (e) { fail(e) }
  }
  async function open() {
    setError(null)
    try { window.open((await dealDocumentFileUrl(pipelineId, doc.id)).url, '_blank', 'noopener') } catch (e) { fail(e) }
  }

  const canUpload = !readOnly && doc.status !== 'verified' && doc.status !== 'waived'
  const canReview = !readOnly && doc.status === 'received'
  const canWaive  = !readOnly && !isDone(doc.status)

  return (
    <li className="bg-white border border-line rounded-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">
            {doc.name}
            {!doc.mandatory && <span className="ml-1.5 text-[11px] font-normal text-muted">optional</span>}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            From: {PROVIDED_BY_LABEL[doc.provided_by]}
            {doc.description && <> · {doc.description}</>}
          </p>
          {doc.file_name && (
            <button onClick={open} className="mt-1 inline-flex items-center gap-1 text-[12px] text-ficium hover:underline">
              <Download size={12} aria-hidden /> {doc.file_name}
              <span className="text-muted">({uploaderLabel(doc)}, {fmt(doc.uploaded_at)})</span>
            </button>
          )}
          {doc.review_note && (
            <p className={`mt-1 text-[12px] ${doc.status === 'rejected' ? 'text-red-700' : 'text-muted'}`}>
              {doc.status === 'waived' ? 'Waived: ' : doc.status === 'rejected' ? 'Rejected: ' : 'Note: '}
              {doc.review_note}
              {doc.reviewed_by_name && <> — {doc.reviewed_by_name}, {fmt(doc.reviewed_at)}</>}
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 text-[12px] font-semibold shrink-0 ${s.cls}`}>
          <s.Icon size={14} aria-hidden /> {s.label}
        </span>
      </div>

      {(canUpload || canReview || canWaive) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {canUpload && (
            <>
              <input ref={fileRef} type="file" className="sr-only" aria-label={`Upload ${doc.name}`}
                     accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.docx,.xlsx"
                     onChange={(e) => onFile(e.target.files?.[0])} />
              <Btn size="sm" variant="secondary" icon={Upload} loading={upload.isPending}
                   onClick={() => fileRef.current?.click()}>
                {doc.file_name ? 'Replace file' : 'Upload'}
              </Btn>
            </>
          )}
          {canReview && <Btn size="sm" loading={review.isPending} onClick={() => act('verify')}>Verify</Btn>}
          {canReview && <Btn size="sm" variant="ghost" onClick={() => setNoteFor('reject')}>Reject</Btn>}
          {canWaive && <Btn size="sm" variant="ghost" onClick={() => setNoteFor('waive')}>Waive</Btn>}
        </div>
      )}

      {noteFor && (
        <div className="mt-2.5 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
            aria-label={noteFor === 'reject' ? 'Why is it rejected?' : 'Why is it not needed?'}
            placeholder={noteFor === 'reject' ? 'What is wrong or missing?' : 'Why is this document not needed for this deal?'}
            className="w-full text-[13px] border border-ink/12 rounded-xl px-3 py-2 resize-none outline-hidden focus:border-ficium/40 focus:ring-2 focus:ring-ficium/15" />
          <div className="flex gap-2">
            <Btn size="sm" variant={noteFor === 'reject' ? 'danger' : 'primary'} loading={review.isPending}
                 onClick={() => note.trim() ? act(noteFor, note.trim()) : setError('Add a note explaining why.')}>
              {noteFor === 'reject' ? 'Reject document' : 'Waive document'}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote('') }}>Cancel</Btn>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
    </li>
  )
}
