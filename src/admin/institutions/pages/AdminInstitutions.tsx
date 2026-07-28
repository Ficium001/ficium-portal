/**
 * @page AdminInstitutions
 * @route /institutions
 * @access protected — admin only
 * @description
 *   Two tabs:
 *     Institutions — review queue, approve / suspend via dual-control
 *     Documents    — compliance doc review for all institutions (approve / reject)
 *
 * @owner Ficium Engineering
 */

import { useState, useMemo } from 'react'
import {
  Building2, Mail, Phone, Globe2,
  CheckCircle2, XCircle, Clock, AlertCircle, ExternalLink,
} from 'lucide-react'
import {
  ASectionHeader, ADataTable, ATr, ATd, AStatusBadge,
  AEmptyState, ASkeletonRow, AAlert, ABtn, AConfirmModal,
  AFilterPills, AModal, AFormField, ASpinner,
} from '@/admin/components/primitives'
import {
  useAdminMe, useInstitutions, useApproveInstitution, useSuspendInstitution,
  useAdminDocuments, useReviewDocument,
} from '@/admin/hooks/useAdmin'
import type { Institution, AdminDoc } from '@/admin/types/admin'

// ─── Tab definition ───────────────────────────────────────────

type Tab = 'institutions' | 'documents'

// ─── Shared tab bar ───────────────────────────────────────────

function TabBar({
  active, onChange, docPending,
}: { active: Tab; onChange: (t: Tab) => void; docPending: number }) {
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'institutions', label: 'Institutions' },
    { key: 'documents',    label: 'Documents', badge: docPending },
  ]
  return (
    <div className="flex gap-1 mb-6 border-b border-ink/[0.07]">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors flex items-center gap-2 ${
            active === t.key
              ? 'text-ink border-b-2 border-ink -mb-px'
              : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── STAGE constants ──────────────────────────────────────────

const STAGE_FILTERS = [
  { key: 'all',              label: 'All'              },
  { key: 'registered',       label: 'New'              },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'approved',         label: 'Approved'         },
  { key: 'suspended',        label: 'Suspended'        },
]

const STAGE_BADGE: Record<string, string> = {
  registered:        'pending',
  commercial_review: 'pending',
  compliance_review: 'pending',
  technical_setup:   'pending',
  pending_approval:  'pending',
  approved:          'approved',
  suspended:         'suspended',
}

// ─── InstitutionsTab ──────────────────────────────────────────

function InstitutionsTab() {
  const { data: me }               = useAdminMe()
  const { data, isLoading, error } = useInstitutions()
  const approveMut = useApproveInstitution()
  const suspendMut = useSuspendInstitution()

  const [stageFilter, setStageFilter]   = useState('all')
  const [confirmTarget, setConfirmTarget] =
    useState<{ inst: Institution; action: 'approve' | 'suspend' } | null>(null)
  const [note, setNote] = useState('')

  const canApprove = me?.permissions?.includes('institutions:approve') || me?.role_slug === 'super_admin'
  const canSuspend = me?.permissions?.includes('institutions:suspend') || me?.role_slug === 'super_admin'
  // Stable reference — avoids useMemo deps changing on every render when data is undefined
  const institutions = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    if (stageFilter === 'all') return institutions
    return institutions.filter(i => i.onboarding_stage === stageFilter)
  }, [institutions, stageFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: institutions.length }
    for (const i of institutions) c[i.onboarding_stage] = (c[i.onboarding_stage] ?? 0) + 1
    return c
  }, [institutions])

  const isPending = approveMut.isPending || suspendMut.isPending

  const handleConfirm = () => {
    if (!confirmTarget || isPending) return
    const { inst, action } = confirmTarget
    const done = () => { setConfirmTarget(null); setNote('') }
    if (action === 'approve') {
      approveMut.mutate({ institution_id: inst.id, institution_name: inst.name }, { onSuccess: done, onError: done })
    } else {
      suspendMut.mutate({ institution_id: inst.id, institution_name: inst.name, suspension_reason: note }, { onSuccess: done, onError: done })
    }
  }

  return (
    <div>
      {(approveMut.isSuccess || suspendMut.isSuccess) && (
        <div className="mb-4">
          <AAlert variant="success">
            Submitted to the dual-control queue — a second admin must approve in <strong>Dual Control</strong>.
          </AAlert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <AAlert variant="error">{(error as Error).message || 'Failed to load institutions.'}</AAlert>
        </div>
      )}

      <div className="mb-4">
        <AFilterPills
          options={STAGE_FILTERS.map(s => ({
            ...s,
            label: `${s.label}${counts[s.key] != null ? ` (${counts[s.key]})` : ''}`,
          }))}
          value={stageFilter}
          onChange={setStageFilter}
        />
      </div>

      <ADataTable
        headers={['Institution', 'Type', 'Country', 'Contact', 'Stage', 'Compliance', 'Registered', 'Actions']}
        caption="Institutions"
      >
        {isLoading && <ASkeletonRow cols={8} />}
        {!isLoading && filtered.length === 0 && (
          <tr><td colSpan={8}>
            <AEmptyState
              icon={Building2}
              title="No institutions"
              description={stageFilter === 'all' ? 'No institutions registered yet.' : 'No institutions match this filter.'}
            />
          </td></tr>
        )}
        {filtered.map(inst => (
          <ATr key={inst.id}>
            <ATd>
              <div className="font-semibold text-ink">{inst.name}</div>
              <div className="text-[11px] text-muted/70">{inst.legal_name}</div>
            </ATd>
            <ATd className="capitalize">{inst.institution_type.replace(/_/g, ' ')}</ATd>
            <ATd>{inst.country}</ATd>
            <ATd>
              <div className="flex items-center gap-1.5 text-[12px]">
                <Mail className="w-3 h-3 text-muted/50" />{inst.primary_contact_email}
              </div>
              {inst.primary_contact_phone && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted/70 mt-0.5">
                  <Phone className="w-3 h-3 text-muted/50" />{inst.primary_contact_phone}
                </div>
              )}
            </ATd>
            <ATd>
              <AStatusBadge status={STAGE_BADGE[inst.onboarding_stage] ?? 'pending'} label={inst.onboarding_stage.replace(/_/g, ' ')} />
            </ATd>
            <ATd className="capitalize">{inst.compliance_status.replace(/_/g, ' ')}</ATd>
            <ATd className="font-mono text-[11px]">{new Date(inst.created_at).toLocaleDateString('en-MU')}</ATd>
            <ATd>
              <div className="flex items-center gap-2">
                {!inst.approved ? (
                  <ABtn size="sm" onClick={() => setConfirmTarget({ inst, action: 'approve' })} disabled={!canApprove || isPending}>
                    Approve
                  </ABtn>
                ) : (
                  <ABtn size="sm" variant="danger" onClick={() => setConfirmTarget({ inst, action: 'suspend' })} disabled={!canSuspend || isPending}>
                    Suspend
                  </ABtn>
                )}
                {inst.regulator && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted/60" title="Regulator">
                    <Globe2 className="w-3 h-3" /> {inst.regulator}
                  </span>
                )}
              </div>
            </ATd>
          </ATr>
        ))}
      </ADataTable>

      <AConfirmModal
        open={!!confirmTarget}
        onClose={() => { setConfirmTarget(null); setNote('') }}
        onConfirm={handleConfirm}
        title={confirmTarget?.action === 'approve'
          ? `Approve ${confirmTarget?.inst.name}?`
          : `Suspend ${confirmTarget?.inst.name}?`}
        description={confirmTarget?.action === 'approve'
          ? 'Moves institution to "approved" once a second admin confirms in Dual Control.'
          : 'Revokes marketplace access once a second admin confirms. Provide a reason.'}
        confirmLabel="Submit for approval"
        risk={confirmTarget?.action === 'approve' ? 'high' : 'critical'}
        notePlaceholder={confirmTarget?.action === 'suspend' ? 'Reason for suspension…' : undefined}
        noteRequired={confirmTarget?.action === 'suspend'}
        note={note}
        onNoteChange={setNote}
        isPending={isPending}
      />
    </div>
  )
}

// ─── DOC status config ────────────────────────────────────────

const DOC_STATUS = {
  pending:      { label: 'Pending',  Icon: Clock,         cls: 'text-amber-500'   },
  approved:     { label: 'Approved', Icon: CheckCircle2,  cls: 'text-emerald-600' },
  rejected:     { label: 'Rejected', Icon: XCircle,       cls: 'text-red-500'     },
  expired:      { label: 'Expired',  Icon: AlertCircle,   cls: 'text-red-500'     },
} as const

const DOC_FILTERS = [
  { key: 'all',      label: 'All'      },
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

// ─── DocumentsTab ────────────────────────────────────────────

function DocumentsTab() {
  const { data: docs = [], isLoading } = useAdminDocuments()
  const reviewMut = useReviewDocument()

  const [statusFilter, setStatusFilter]   = useState('pending')
  const [reviewing, setReviewing]         = useState<AdminDoc | null>(null)
  const [rejectReason, setRejectReason]   = useState('')
  const [reviewError, setReviewError]     = useState<string | null>(null)

  const filtered = useMemo(() =>
    statusFilter === 'all' ? docs : docs.filter(d => d.status === statusFilter),
    [docs, statusFilter]
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: docs.length }
    for (const d of docs) c[d.status] = (c[d.status] ?? 0) + 1
    return c
  }, [docs])

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewing) return
    setReviewError(null)
    try {
      await reviewMut.mutateAsync({
        id: reviewing.id,
        action,
        rejection_reason: action === 'reject' ? rejectReason : undefined,
      })
      setReviewing(null)
      setRejectReason('')
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : 'Review failed.')
    }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ?? ''

  return (
    <div>
      <div className="mb-4">
        <AFilterPills
          options={DOC_FILTERS.map(f => ({
            ...f,
            label: `${f.label}${counts[f.key] != null ? ` (${counts[f.key]})` : ''}`,
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      <ADataTable
        headers={['Institution', 'Document', 'Required', 'File', 'Uploaded', 'Status', 'Actions']}
        caption="Compliance documents"
      >
        {isLoading && <ASkeletonRow cols={7} />}
        {!isLoading && filtered.length === 0 && (
          <tr><td colSpan={7}>
            <AEmptyState
              icon={CheckCircle2}
              title="Nothing to review"
              description={statusFilter === 'pending' ? 'No documents awaiting review.' : 'No documents match this filter.'}
            />
          </td></tr>
        )}
        {filtered.map(doc => {
          const cfg = DOC_STATUS[doc.status as keyof typeof DOC_STATUS]
          const StatusIcon = cfg?.Icon ?? Clock
          return (
            <ATr key={doc.id}>
              <ATd>
                <div className="font-semibold text-ink text-[13px]">{doc.institution_name}</div>
                <div className="text-[11px] text-muted capitalize">{doc.institution_type.replace(/_/g, ' ')}</div>
              </ATd>
              <ATd>
                <div className="text-[13px] text-ink">{doc.doc_type_label}</div>
                <div className="text-[11px] text-muted font-mono">{doc.doc_type_code}</div>
              </ATd>
              <ATd>
                {doc.is_mandatory
                  ? <span className="text-[10px] font-bold text-red-600">REQUIRED</span>
                  : <span className="text-[10px] text-muted">Optional</span>}
              </ATd>
              <ATd>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-muted truncate max-w-[140px]">{doc.file_name}</span>
                  <a
                    href={`${supabaseUrl}/storage/v1/object/public/institution-docs/${doc.storage_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ficium hover:text-ficium/70 shrink-0"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
                {doc.uploaded_by_email && (
                  <div className="text-[11px] text-muted/60 mt-0.5">{doc.uploaded_by_email}</div>
                )}
              </ATd>
              <ATd className="font-mono text-[11px]">
                {new Date(doc.uploaded_at).toLocaleDateString('en-MU')}
              </ATd>
              <ATd>
                <div className="flex items-center gap-1.5">
                  <StatusIcon size={13} className={cfg?.cls ?? 'text-muted'} />
                  <span className="text-[12px] text-muted">{cfg?.label ?? doc.status}</span>
                </div>
                {doc.rejection_reason && (
                  <div className="text-[11px] text-red-600 mt-0.5 truncate max-w-[140px]" title={doc.rejection_reason}>
                    {doc.rejection_reason}
                  </div>
                )}
              </ATd>
              <ATd>
                {doc.status === 'pending' && (
                  <div className="flex items-center gap-1.5">
                    <ABtn size="sm" onClick={() => setReviewing(doc)}>Review</ABtn>
                  </div>
                )}
                {doc.status !== 'pending' && (
                  <ABtn size="sm" variant="ghost" onClick={() => { setReviewing(doc); setRejectReason('') }}>
                    Re-review
                  </ABtn>
                )}
              </ATd>
            </ATr>
          )
        })}
      </ADataTable>

      {/* Review modal */}
      <AModal
        open={!!reviewing}
        title={`Review — ${reviewing?.doc_type_label}`}
        onClose={() => { setReviewing(null); setRejectReason(''); setReviewError(null) }}
      >
        {reviewing && (
          <div className="space-y-4">
            <div className="bg-ink/3 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Institution</span>
                <span className="font-medium text-ink">{reviewing.institution_name}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Document</span>
                <span className="font-medium text-ink">{reviewing.doc_type_label}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">File</span>
                <a
                  href={`${supabaseUrl}/storage/v1/object/public/institution-docs/${reviewing.storage_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ficium flex items-center gap-1 hover:text-ficium/70"
                >
                  {reviewing.file_name} <ExternalLink size={11} />
                </a>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Uploaded</span>
                <span className="text-ink">{new Date(reviewing.uploaded_at).toLocaleString('en-MU')}</span>
              </div>
            </div>

            <AFormField label="Rejection reason (required if rejecting)">
              <textarea
                className="w-full rounded-xl border border-ink/10 bg-ink/2 px-3 py-2 text-[13px] text-ink placeholder:text-muted resize-none focus:outline-hidden focus:ring-2 focus:ring-ficium/30"
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Describe why this document is being rejected…"
              />
            </AFormField>

            {reviewError && (
              <AAlert variant="error">{reviewError}</AAlert>
            )}

            <div className="flex gap-2 pt-1">
              <ABtn
                variant="ghost"
                onClick={() => { setReviewing(null); setRejectReason(''); setReviewError(null) }}
              >
                Cancel
              </ABtn>
              <ABtn
                variant="danger"
                onClick={() => handleReview('reject')}
                disabled={!rejectReason.trim() || reviewMut.isPending}
              >
                {reviewMut.isPending ? <ASpinner size="sm" /> : 'Reject'}
              </ABtn>
              <ABtn
                variant="primary"
                onClick={() => handleReview('approve')}
                disabled={reviewMut.isPending}
              >
                {reviewMut.isPending ? <ASpinner size="sm" /> : 'Approve'}
              </ABtn>
            </div>
          </div>
        )}
      </AModal>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────

export default function AdminInstitutions() {
  const [tab, setTab] = useState<Tab>('institutions')
  const { data: docs = [] } = useAdminDocuments()
  const pendingDocs = docs.filter(d => d.status === 'pending').length

  return (
    <main className="p-6 lg:p-8 max-w-[1440px] mx-auto">
      <ASectionHeader
        title="Institutions"
        subtitle="Manage institution onboarding and compliance documents"
      />
      <TabBar active={tab} onChange={setTab} docPending={pendingDocs} />
      {tab === 'institutions' ? <InstitutionsTab /> : <DocumentsTab />}
    </main>
  )
}
