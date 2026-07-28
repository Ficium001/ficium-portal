/**
 * @page DocTemplates
 * @route /doc-templates
 * @access protected — module inst:doctemplates (institution-licensed)
 * @description
 *   Document template designer: institutions author agreements in Word
 *   using {{ merge_fields }}, upload versions here, publish them through
 *   maker-checker dual control, then generate populated .docx/PDF
 *   documents against a live pipeline deal.
 *
 *   Flow surfaced to the user in three explicit steps:
 *     1. Author in Word — copy fields from the merge-field reference
 *     2. Upload → a second admin approves (maker ≠ checker)
 *     3. Generate against a deal → download Word/PDF
 *
 * @dataSource useDocTemplates → ficium-portal-api /institution/doc-templates
 * @owner Ficium Engineering
 */
import { useMemo, useRef, useState } from 'react'
import {
  FileType2, Plus, Upload, CheckCircle2, XCircle, Copy, Check,
  FileDown, Wand2, Info, Archive,
} from 'lucide-react'
import {
  SectionHeader, EmptyState, InlineAlert, SkeletonCard, Btn, StatusBadge,
  FilterPills, Modal, FormField, inputCls, MonoRef,
} from '@/institution/components/primitives'
import { getTokenPayload } from '@/shared/lib/ficiumAuth'
import { fetchPipelines } from '@/institution/pipeline/api/pipeline'
import { useQuery } from '@tanstack/react-query'
import {
  useDocTemplates, useCreateTemplate, useRetireTemplate,
  useTemplateVersions, useUploadVersion, useDecideVersion,
  useMergeFields, useGenerateDocument, downloadGeneration,
} from '../hooks/useDocTemplates'
import {
  DOC_CATEGORY_LABEL, type DocCategory, type DocTemplate, type DocTemplateVersion,
} from '../types/docTemplates'

type Filter = 'all' | 'active' | 'draft' | 'retired'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'active',  label: 'Published' },
  { key: 'draft',   label: 'In draft' },
  { key: 'retired', label: 'Retired' },
]

const CATEGORIES = Object.entries(DOC_CATEGORY_LABEL) as [DocCategory, string][]

function matches(t: DocTemplate, f: Filter): boolean {
  if (f === 'all') return t.status !== 'retired'
  if (f === 'active') return t.status === 'active'
  if (f === 'draft') return t.status === 'draft' || t.status === 'pending_approval'
  return t.status === 'retired'
}

function fmtBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Merge-field reference (the authoring cheat-sheet) ────────

function MergeFieldReference() {
  const { data: fields, isLoading } = useMergeFields()
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (key: string) => {
    navigator.clipboard.writeText(`{{ ${key} }}`).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  if (isLoading) return <SkeletonCard />
  if (!fields?.length) return null

  return (
    <div className="bg-white border border-line rounded-card shadow-card p-5">
      <div className="flex items-start gap-2.5 mb-3">
        <Info className="w-4 h-4 text-ficium shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-[13px] font-bold text-ink">Merge fields</p>
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
            Type these tags into your Word document — they're replaced with the
            deal's real data at generation. Click a tag to copy it.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {fields.map(f => (
          <button
            key={f.key}
            onClick={() => copy(f.key)}
            title={`e.g. ${f.example}`}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-ink/8 hover:border-ficium/40 bg-white text-left transition-all group"
          >
            <span className="min-w-0">
              <code className="text-[11px] font-mono text-ficium">{'{{ '}{f.key}{' }}'}</code>
              <span className="block text-[10px] text-muted truncate">{f.label}</span>
            </span>
            {copied === f.key
              ? <Check className="w-3.5 h-3.5 text-good shrink-0" aria-hidden />
              : <Copy className="w-3.5 h-3.5 text-muted/50 group-hover:text-ficium shrink-0" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Create template modal ────────────────────────────────────

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const create = useCreateTemplate()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<DocCategory>('loan_agreement')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Auto-derive the code from the name — one less concept for the user.
  const code = useMemo(
    () => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64),
    [name],
  )

  const submit = async () => {
    setError(null)
    if (name.trim().length < 2) { setError('Give the template a name (at least 2 characters).'); return }
    if (code.length < 2) { setError('The name must contain at least two letters or numbers.'); return }
    try {
      await create.mutateAsync({
        code, name: name.trim(),
        description: description.trim() || null,
        doc_category: category,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the template.')
    }
  }

  return (
    <Modal open onClose={onClose} title="New document template">
      <div className="space-y-4">
        <FormField label="Name" required hint={code ? `Reference code: ${code}` : undefined}>
          <input
            className={inputCls} value={name} maxLength={200}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Home Loan Agreement"
          />
        </FormField>

        <FormField label="Category" required>
          <select className={inputCls} value={category}
                  onChange={e => setCategory(e.target.value as DocCategory)}>
            {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </FormField>

        <FormField label="Description" hint="Optional — shown to your team on the template card.">
          <textarea
            className={`${inputCls} min-h-[72px] resize-y`} value={description} maxLength={500}
            onChange={e => setDescription(e.target.value)}
            placeholder="When to use this template…"
          />
        </FormField>

        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={create.isPending}>Create template</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─── Generate modal (deal picker) ─────────────────────────────

function GenerateModal({ template, onClose }: { template: DocTemplate; onClose: () => void }) {
  const generate = useGenerateDocument(template.id)
  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['pipelines', 'active-for-docgen'],
    queryFn: () => fetchPipelines('active'),
  })
  const [dealId, setDealId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; pdf: boolean } | null>(null)
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null)

  const run = async () => {
    setError(null)
    if (!dealId) { setError('Choose the deal to generate this document for.'); return }
    try {
      const gen = await generate.mutateAsync({ entity_id: dealId, output_pdf: true })
      if (gen.status === 'failed') {
        setError(gen.error
          ? `Generation failed: ${gen.error}`
          : 'Generation failed. Check the template for typos in its merge tags.')
        return
      }
      setDone({ id: gen.id, pdf: !!gen.output_pdf_path })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the document.')
    }
  }

  const download = async (fmt: 'pdf' | 'docx') => {
    if (!done) return
    setDownloading(fmt)
    try {
      await downloadGeneration(done.id, fmt, `${template.code}.${fmt}`)
    } catch {
      setError('Download failed. Please retry shortly.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Generate — ${template.name}`}>
      {!done ? (
        <div className="space-y-4">
          <FormField label="Deal" required
                     hint="Data is pulled from the deal, its request, and the revealed borrower identity.">
            {isLoading ? (
              <div className="h-10 rounded-xl bg-ink/4 animate-pulse" />
            ) : (pipelines?.length ?? 0) === 0 ? (
              <InlineAlert variant="info">
                No active deals yet. Deals appear here once a bid is accepted and its pipeline starts.
              </InlineAlert>
            ) : (
              <select className={inputCls} value={dealId} onChange={e => setDealId(e.target.value)}>
                <option value="">Select a deal…</option>
                {pipelines!.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.consumer_ref} — {p.product_label} · MUR {Number(p.deal_amount).toLocaleString()} · {p.deal_term_months} mo
                  </option>
                ))}
              </select>
            )}
          </FormField>

          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn icon={Wand2} onClick={run} loading={generate.isPending}
                 disabled={(pipelines?.length ?? 0) === 0}>
              Generate
            </Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <InlineAlert variant="success">
            Document generated. Download it below — a copy is kept in the generation log.
          </InlineAlert>
          <div className="flex gap-2">
            {done.pdf && (
              <Btn icon={FileDown} onClick={() => download('pdf')} loading={downloading === 'pdf'}>
                Download PDF
              </Btn>
            )}
            <Btn variant="secondary" icon={FileDown} onClick={() => download('docx')}
                 loading={downloading === 'docx'}>
              Download Word
            </Btn>
          </div>
          <div className="flex justify-end">
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Versions panel (upload + maker-checker) ──────────────────

function VersionsPanel({ template }: { template: DocTemplate }) {
  const myId = String(getTokenPayload()?.sub ?? '')
  const { data: versions, isLoading } = useTemplateVersions(template.id)
  const upload = useUploadVersion(template.id)
  const decide = useDecideVersion(template.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<DocTemplateVersion | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const onFile = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.docx')) {
      setError('Only .docx (Word) files can be uploaded — save your template as Word first.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File is over 10 MB. Trim embedded images and retry.')
      return
    }
    try {
      await upload.mutateAsync({ file: f, changeNote: note.trim() || undefined })
      setNote('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  const act = async (v: DocTemplateVersion, action: 'approve' | 'reject', n?: string) => {
    setError(null)
    try {
      await decide.mutateAsync({ versionId: v.id, action, note: n })
      setRejectFor(null); setRejectNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} the version.`)
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload row */}
      <div className="border border-dashed border-ink/15 rounded-xl p-4">
        <p className="text-[12px] font-semibold text-ink mb-2">Upload a new version</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={`${inputCls} flex-1`} value={note} maxLength={300}
            onChange={e => setNote(e.target.value)}
            placeholder="What changed? (optional note for the approver)"
          />
          <input ref={fileRef} type="file" accept=".docx" className="hidden"
                 onChange={e => onFile(e.target.files?.[0])} />
          <Btn icon={Upload} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            Choose .docx
          </Btn>
        </div>
        <p className="text-[11px] text-muted mt-2">
          A second admin must approve the upload before it goes live — you can't approve your own.
        </p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {isLoading && <SkeletonCard />}

      {!isLoading && (versions?.length ?? 0) === 0 && (
        <p className="text-[12px] text-muted py-2">
          No versions yet — upload your first Word document above.
        </p>
      )}

      {versions?.map(v => {
        const isMine   = String(v.created_by ?? '') === myId
        const pending  = v.status === 'draft' || v.status === 'pending_approval'
        const isLive   = v.status === 'published' && v.version_no === template.current_version
        return (
          <div key={v.id} className="bg-white border border-line rounded-xl px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-ink">
                  v{v.version_no} · {v.file_name}
                  {isLive && <span className="ml-2 text-[10px] font-bold text-good uppercase tracking-wide">Live</span>}
                </p>
                <p className="text-[11px] text-muted mt-0.5">
                  {new Date(v.created_at).toLocaleString()} · {fmtBytes(v.file_size_bytes)}
                  {v.change_note && <> · “{v.change_note}”</>}
                </p>
                {v.status === 'rejected' && v.rejection_note && (
                  <p className="text-[11px] text-red-600 mt-1">Rejected: {v.rejection_note}</p>
                )}
              </div>
              <StatusBadge status={v.status === 'published' ? 'approved' : v.status}
                           label={v.status.replace(/_/g, ' ')} />
            </div>

            {pending && (
              <div className="mt-2.5 flex items-center gap-2">
                {isMine ? (
                  <p className="text-[11px] text-muted">
                    Waiting for another admin to review — you uploaded this version.
                  </p>
                ) : rejectFor?.id === v.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      className={`${inputCls} flex-1`} value={rejectNote} autoFocus
                      onChange={e => setRejectNote(e.target.value)}
                      placeholder="Why is this rejected? (shown to the uploader)"
                    />
                    <Btn size="sm" variant="danger" loading={decide.isPending}
                         onClick={() => act(v, 'reject', rejectNote.trim() || undefined)}>
                      Confirm reject
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setRejectFor(null); setRejectNote('') }}>
                      Cancel
                    </Btn>
                  </div>
                ) : (
                  <>
                    <Btn size="sm" icon={CheckCircle2} loading={decide.isPending}
                         onClick={() => act(v, 'approve')}>
                      Approve & publish
                    </Btn>
                    <Btn size="sm" variant="ghost" icon={XCircle} onClick={() => setRejectFor(v)}>
                      Reject
                    </Btn>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Template detail modal ────────────────────────────────────

function TemplateDetailModal({ template, onClose }: { template: DocTemplate; onClose: () => void }) {
  const retire = useRetireTemplate()
  const [confirmRetire, setConfirmRetire] = useState(false)

  return (
    <Modal open onClose={onClose} title={template.name} width="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <StatusBadge status={template.status === 'active' ? 'active' : template.status}
                         label={template.status.replace(/_/g, ' ')} />
            <span className="text-[11px] text-muted">{DOC_CATEGORY_LABEL[template.doc_category]}</span>
            <MonoRef value={template.code} short={false} />
          </div>
          {template.status !== 'retired' && (
            confirmRetire ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">Retire this template?</span>
                <Btn size="sm" variant="danger" loading={retire.isPending}
                     onClick={() => retire.mutateAsync(template.id).then(onClose)}>
                  Yes, retire
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setConfirmRetire(false)}>No</Btn>
              </div>
            ) : (
              <Btn size="sm" variant="ghost" icon={Archive} onClick={() => setConfirmRetire(true)}>
                Retire
              </Btn>
            )
          )}
        </div>

        {template.description && (
          <p className="text-[12px] text-muted leading-relaxed">{template.description}</p>
        )}

        <VersionsPanel template={template} />
      </div>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function DocTemplates() {
  const { data, isLoading, isError } = useDocTemplates()
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [detailFor, setDetailFor] = useState<DocTemplate | null>(null)
  const [generateFor, setGenerateFor] = useState<DocTemplate | null>(null)

  const visible = data?.filter(t => matches(t, filter)) ?? []

  return (
    <main className="p-6 lg:p-8 max-w-3xl mx-auto">
      <SectionHeader
        title="Document templates"
        subtitle="Author agreements in Word with merge fields, publish them through dual control, and generate populated documents per deal."
      />

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
        <Btn icon={Plus} onClick={() => setCreating(true)}>New template</Btn>
      </div>

      {isLoading && <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>}

      {isError && (
        <InlineAlert variant="error">Could not load templates. Please retry shortly.</InlineAlert>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <EmptyState
          icon={FileType2}
          title={filter === 'all' ? 'No templates yet' : 'Nothing here'}
          description={filter === 'all'
            ? 'Create a template, author it in Word using the merge fields below, then upload it for approval.'
            : 'No templates match this filter.'}
        />
      )}

      <div className="space-y-3 mb-6">
        {visible.map(t => (
          <div key={t.id} className="bg-white border border-line rounded-card shadow-card px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <button className="min-w-0 text-left group" onClick={() => setDetailFor(t)}>
                <p className="text-[14px] font-bold text-ink truncate group-hover:text-ficium transition-colors">
                  {t.name}
                </p>
                <p className="text-[11px] text-muted mt-0.5">
                  {DOC_CATEGORY_LABEL[t.doc_category]}
                  {t.current_version > 0
                    ? ` · v${t.current_version} live`
                    : ' · no published version yet'}
                </p>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={t.status === 'active' ? 'active' : t.status}
                             label={t.status.replace(/_/g, ' ')} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Btn size="sm" variant="secondary" onClick={() => setDetailFor(t)}>
                Versions & publish
              </Btn>
              <Btn size="sm" icon={Wand2} disabled={t.status !== 'active'}
                   onClick={() => setGenerateFor(t)}>
                Generate for a deal
              </Btn>
              {t.status !== 'active' && (
                <span className="text-[11px] text-muted">Publish a version first to generate.</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <MergeFieldReference />

      {creating && <CreateTemplateModal onClose={() => setCreating(false)} />}
      {detailFor && <TemplateDetailModal template={detailFor} onClose={() => setDetailFor(null)} />}
      {generateFor && <GenerateModal template={generateFor} onClose={() => setGenerateFor(null)} />}
    </main>
  )
}
