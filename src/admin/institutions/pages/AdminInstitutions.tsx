/**
 * @page AdminInstitutions
 * @route /institutions
 * @access protected — institutions:view (approve action requires institutions:approve)
 * @description
 *   Review queue for institution applications. Lists every row in
 *   institution.institutions across all onboarding stages.
 *
 *   "Approve" and "Suspend" do not write directly — they raise a
 *   dual-control action (institution.approve / institution.suspend)
 *   which a second admin must approve in /dual-control before the
 *   institution's onboarding_stage / approved flag actually changes.
 *
 * @owner Ficium Engineering
 */

import { useState, useMemo } from 'react'
import { Building2, Mail, Phone, Globe2 } from 'lucide-react'
import {
  ASectionHeader, ADataTable, ATr, ATd, AStatusBadge,
  AEmptyState, ASkeletonRow, AAlert, ABtn, AConfirmModal, AFilterPills,
} from '../../components/primitives'
import {
  useAdminMe, useInstitutions, useApproveInstitution, useSuspendInstitution,
} from '../../hooks/useAdmin'
import type { Institution } from '../../types/admin'

const STAGE_FILTERS = [
  { key: 'all',             label: 'All'             },
  { key: 'registered',      label: 'New'             },
  { key: 'pending_approval',label: 'Pending approval'},
  { key: 'approved',        label: 'Approved'        },
  { key: 'suspended',       label: 'Suspended'       },
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

export default function AdminInstitutions() {
  const { data: me }              = useAdminMe()
  const { data, isLoading, error } = useInstitutions()
  const approveMut = useApproveInstitution()
  const suspendMut = useSuspendInstitution()

  const [stageFilter, setStageFilter] = useState('all')
  const [confirmTarget, setConfirmTarget] = useState<{ inst: Institution; action: 'approve' | 'suspend' } | null>(null)
  const [note, setNote] = useState('')

  const canApprove = me?.permissions?.includes('institutions:approve') || me?.role_slug === 'super_admin'
  const canSuspend = me?.permissions?.includes('institutions:suspend') || me?.role_slug === 'super_admin'

  const institutions = data ?? []

  const filtered = useMemo(() => {
    if (stageFilter === 'all') return institutions
    return institutions.filter(i => i.onboarding_stage === stageFilter)
  }, [institutions, stageFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: institutions.length }
    for (const i of institutions) c[i.onboarding_stage] = (c[i.onboarding_stage] ?? 0) + 1
    return c
  }, [institutions])

  const handleConfirm = () => {
    if (!confirmTarget) return
    const { inst, action } = confirmTarget
    if (action === 'approve') {
      approveMut.mutate({ institution_id: inst.id, institution_name: inst.name })
    } else {
      suspendMut.mutate({ institution_id: inst.id, institution_name: inst.name, suspension_reason: note })
    }
    setConfirmTarget(null)
    setNote('')
  }

  const isPending = approveMut.isPending || suspendMut.isPending

  return (
    <div>
      <ASectionHeader
        title="Institutions"
        subtitle={`${institutions.length} total · ${counts.registered ?? 0} new applications`}
      />

      {(approveMut.isSuccess || suspendMut.isSuccess) && (
        <div className="mb-4">
          <AAlert variant="success">
            Submitted to the dual-control queue — a second admin must approve it in <strong>Dual Control</strong> before it takes effect.
          </AAlert>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <AAlert variant="error">
            {(error as Error).message || 'Failed to load institutions.'}
          </AAlert>
        </div>
      )}

      <div className="mb-4">
        <AFilterPills
          options={STAGE_FILTERS.map(s => ({ ...s, label: `${s.label}${counts[s.key] != null ? ` (${counts[s.key]})` : ''}` }))}
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
              description={stageFilter === 'all' ? 'No institutions have registered yet.' : 'No institutions match this filter.'}
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
                <Mail className="w-3 h-3 text-muted/50" />
                {inst.primary_contact_email}
              </div>
              {inst.primary_contact_phone && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted/70 mt-0.5">
                  <Phone className="w-3 h-3 text-muted/50" />
                  {inst.primary_contact_phone}
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
                  <ABtn
                    size="sm"
                    onClick={() => setConfirmTarget({ inst, action: 'approve' })}
                    disabled={!canApprove}
                  >
                    Approve
                  </ABtn>
                ) : (
                  <ABtn
                    size="sm"
                    variant="danger"
                    onClick={() => setConfirmTarget({ inst, action: 'suspend' })}
                    disabled={!canSuspend}
                  >
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
          ? 'This moves the institution to "approved" and unlocks marketplace access once a second admin confirms.'
          : 'This immediately revokes marketplace access once a second admin confirms. Provide a reason for the audit trail.'}
        confirmLabel={confirmTarget?.action === 'approve' ? 'Submit for approval' : 'Submit for approval'}
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
