/**
 * RequirementsEditor — the document checklist of one workflow: which
 * documents a deal needs, at which stage, from whom, mandatory or not.
 * A mandatory document gates its stage on every deal using this workflow.
 *
 * For documents from the borrower, the type and maximum age let the borrower
 * reuse a matching copy from their vault; one older than the maximum age (or
 * undated) must be uploaded new.
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Btn, InlineAlert, inputCls } from '@/institution/components/primitives'
import { useRemoveRequirement, useRequirements, useSaveRequirement } from '../hooks/useChecklist'
import {
  DOCUMENT_TYPE_LABEL, PROVIDED_BY_LABEL, type DocRequirement, type DocumentType, type ProvidedBy,
} from '../types'

interface StageOption { id: string; label: string; position: number }

export function RequirementsEditor({ templateId, stages }: { templateId: string; stages: StageOption[] }) {
  const { data, isLoading } = useRequirements(templateId)
  const save = useSaveRequirement(templateId)
  const remove = useRemoveRequirement(templateId)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stageLabel = (id: string | null) => stages.find((s) => s.id === id)?.label ?? 'Whole deal'
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "That didn't save. Try again.")

  return (
    <div className="px-4 py-3 border-t border-border space-y-2">
      <div>
        <p className="text-[13px] font-semibold text-ink">Document checklist</p>
        <p className="text-[11px] text-muted">Required documents must be verified or waived before their stage can move on.</p>
      </div>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {isLoading && <p className="text-[12px] text-muted">Loading…</p>}
      <ul className="space-y-1.5">
        {(data ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/[0.07] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[13px] text-ink truncate">
                {r.name}{!r.mandatory && <span className="ml-1.5 text-[11px] text-muted">optional</span>}
              </p>
              <p className="text-[11px] text-muted">{stageLabel(r.stage_def_id)} · from {PROVIDED_BY_LABEL[r.provided_by].toLowerCase()}</p>
              {r.provided_by === 'borrower' && (
                <ReuseRule
                  type={r.document_type} maxAge={r.max_age_days} idPrefix={r.id}
                  onChange={(body) => save.mutate({ id: r.id, body }, { onError: fail })}
                />
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
                <input type="checkbox" className="accent-ficium" checked={r.mandatory}
                       onChange={(e) => save.mutate({ id: r.id, body: { mandatory: e.target.checked } }, { onError: fail })} />
                Required
              </label>
              <button aria-label={`Remove ${r.name}`} className="text-muted hover:text-red-700 p-1"
                      onClick={() => remove.mutate(r.id, { onError: fail })}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
        {!isLoading && (data ?? []).length === 0 && !adding && (
          <li className="text-[12px] text-muted">No documents required yet.</li>
        )}
      </ul>
      {adding
        ? <NewRequirement stages={stages} saving={save.isPending} onCancel={() => setAdding(false)}
            onSave={(body) => save.mutate({ body }, { onSuccess: () => setAdding(false), onError: fail })} />
        : (
          <button onClick={() => { setError(null); setAdding(true) }}
                  className="flex items-center gap-2 text-[13px] text-ficium font-medium hover:opacity-80">
            <Plus size={14} /> Add document
          </button>
        )}
    </div>
  )
}

function NewRequirement({ stages, saving, onSave, onCancel }: {
  stages: StageOption[]; saving: boolean
  onSave: (b: Partial<DocRequirement>) => void; onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [stage, setStage] = useState(stages[0]?.id ?? '')
  const [from, setFrom] = useState<ProvidedBy>('borrower')
  const [mandatory, setMandatory] = useState(true)
  const [docType, setDocType] = useState<DocumentType | null>(null)
  const [maxAge, setMaxAge] = useState<number | null>(null)

  return (
    <div className="rounded-lg border border-ficium/30 bg-ficium/[0.03] p-3 space-y-2">
      <input className={inputCls} placeholder="Document, e.g. Proof of income" value={name}
             onChange={(e) => setName(e.target.value)} aria-label="Document name" autoFocus />
      <input className={inputCls} placeholder="What exactly is needed (optional)" value={description}
             onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Needed at stage">
          {stages.map((s) => <option key={s.id} value={s.id}>{s.position}. {s.label}</option>)}
          <option value="">Whole deal (no stage)</option>
        </select>
        <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value as ProvidedBy)} aria-label="Provided by">
          {(Object.keys(PROVIDED_BY_LABEL) as ProvidedBy[]).map((k) => <option key={k} value={k}>From {PROVIDED_BY_LABEL[k].toLowerCase()}</option>)}
        </select>
      </div>
      {from === 'borrower' && (
        <ReuseRule type={docType} maxAge={maxAge} idPrefix="new"
                   onChange={(b) => {
                     if ('document_type' in b) setDocType(b.document_type ?? null)
                     if ('max_age_days' in b) setMaxAge(b.max_age_days ?? null)
                   }} />
      )}
      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input type="checkbox" className="accent-ficium" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
        Required (gates the stage)
      </label>
      <div className="flex gap-2">
        <Btn size="sm" loading={saving} disabled={!name.trim()}
             onClick={() => onSave({ name: name.trim(), description: description.trim() || null,
                                     stage_def_id: stage || null, provided_by: from, mandatory,
                                     ...(from === 'borrower' ? { document_type: docType, max_age_days: maxAge } : {}) })}>
          Add document
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  )
}

/**
 * Document type + maximum age for a borrower document. Saves on change (type)
 * or on blur (age), so typing "9" on the way to "90" never saves 9.
 */
function ReuseRule({ type, maxAge, idPrefix, onChange }: {
  type: DocumentType | null; maxAge: number | null; idPrefix: string
  onChange: (b: Pick<Partial<DocRequirement>, 'document_type' | 'max_age_days'>) => void
}) {
  const [age, setAge] = useState(maxAge == null ? '' : String(maxAge))
  const ageValid = age === '' || (/^\d+$/.test(age) && +age >= 1 && +age <= 3650)
  const commitAge = () => {
    if (!ageValid) return
    const next = age === '' ? null : +age
    if (next !== maxAge) onChange({ max_age_days: next })
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
      <label htmlFor={`${idPrefix}-type`}>Vault match</label>
      <select id={`${idPrefix}-type`} className={`${inputCls} !w-auto !py-1 !text-[11px]`}
              value={type ?? ''} onChange={(e) => onChange({ document_type: (e.target.value || null) as DocumentType | null })}>
        <option value="">None (always upload)</option>
        {(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((k) => (
          <option key={k} value={k}>{DOCUMENT_TYPE_LABEL[k]}</option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}-age`}>no older than</label>
      <input id={`${idPrefix}-age`} inputMode="numeric" placeholder="any" value={age}
             aria-invalid={!ageValid}
             className={`${inputCls} !w-16 !py-1 !text-[11px] ${ageValid ? '' : '!border-red-400'}`}
             onChange={(e) => setAge(e.target.value.trim())} onBlur={commitAge}
             onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <span>days</span>
    </div>
  )
}
