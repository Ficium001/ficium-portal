/**
 * @page AdminDualControl
 * @route /admin/dual-control
 * @access protected — dual_control:view
 * @description
 *   The core of the admin security model. Every material action raised
 *   anywhere in the admin portal lands here. Checkers approve or reject.
 *
 *   Enforced invariants (also enforced at DB level):
 *     - Maker cannot approve their own action
 *     - Expired actions cannot be approved
 *     - Checker must have dual_control:approve permission
 *     - All decisions written to admin_audit_log (WORM)
 *
 *   Displays full payload diff (before/after), risk level, maker IP,
 *   time remaining, and a mandatory rejection note.
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useCallback } from 'react'
import { GitMerge, ShieldCheck, AlertTriangle, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react'
import {
  useDualControlActions, useAdminMe,
  useApproveDualControl, useRejectDualControl,
} from '@/admin/hooks/useAdmin'
import type { DualControlAction } from '@/admin/types/admin'
import {
  ASectionHeader, ALiveBadge, AFilterPills, ADataTable, ATr, ATd,
  AStatusBadge, RiskBadge, AEmptyState, ASkeletonRow, AAlert,
  ABtn, aInputCls, AMonoRef,
} from '@/admin/components/primitives'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTS = [
  { key: 'pending',  label: 'Pending'  },
  { key: 'all',      label: 'All'      },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired',  label: 'Expired'  },
  { key: 'executed', label: 'Executed' },
]

function timeLeft(iso: string): { label: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { label: 'Expired', urgent: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, urgent: ms < 2 * 3_600_000 }
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionDetailPanel
// ─────────────────────────────────────────────────────────────────────────────

function ActionDetailPanel({
  action,
  canApprove,
  isMaker,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  action:      DualControlAction
  canApprove:  boolean
  isMaker:     boolean
  onApprove:   (note: string) => void
  onReject:    (note: string) => void
  isApproving: boolean
  isRejecting: boolean
}) {
  const [note,          setNote]          = useState('')
  const [showReject,    setShowReject]    = useState(false)

  const isPending = action.status === 'pending'
  const isExpired = new Date(action.expires_at).getTime() <= Date.now()

  return (
    <tr className='bg-cream/70'>
      <td colSpan={7} className='px-5 py-5'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-5'>

          {/* Payload */}
          <div>
            <div className='text-[9px] font-bold text-muted/50 uppercase tracking-widest mb-2.5'>Action payload</div>
            <pre className='text-[10px] font-mono text-muted bg-white border border-ink/[0.08] rounded-lg p-3 overflow-auto max-h-52 leading-relaxed'>
              {JSON.stringify(action.payload, null, 2)}
            </pre>
            {action.payload_before && (
              <>
                <div className='text-[9px] font-bold text-muted/50 uppercase tracking-widest mb-2.5 mt-4'>Previous state</div>
                <pre className='text-[10px] font-mono text-muted/70 bg-white border border-ink/[0.08] rounded-lg p-3 overflow-auto max-h-32 leading-relaxed'>
                  {JSON.stringify(action.payload_before, null, 2)}
                </pre>
              </>
            )}
          </div>

          {/* Maker + timeline */}
          <div>
            <div className='text-[9px] font-bold text-muted/50 uppercase tracking-widest mb-2.5'>Provenance</div>
            <div className='space-y-2 text-[11px]'>
              {[
                ['Maker',       action.maker_email],
                ['Maker role',  action.maker_role],
                ['Maker IP',    action.maker_ip],
                ['Initiated',   new Date(action.initiated_at).toLocaleString('en-MU')],
                ['Expires',     new Date(action.expires_at).toLocaleString('en-MU')],
                ['Resource',    action.resource_label ?? action.resource_type],
                ['Resource ID', action.resource_id ? action.resource_id.slice(0, 12) + '…' : '—'],
                ['Action ID',   action.id.slice(0, 12) + '…'],
              ].map(([l, v]) => (
                <div key={l} className='flex justify-between'>
                  <span className='text-muted/50'>{l}</span>
                  <span className='font-mono text-muted max-w-[55%] text-right truncate'>{v}</span>
                </div>
              ))}
            </div>
            {action.checker_id && (
              <div className='mt-4 bg-white border border-ink/[0.08] rounded-lg p-3 text-[11px]'>
                <div className='text-[9px] font-bold text-muted/50 uppercase tracking-widest mb-2'>Checker decision</div>
                <div className='space-y-1'>
                  <div className='flex justify-between'><span className='text-muted/50'>Checker</span><span className='font-mono text-muted'>{action.checker_email}</span></div>
                  <div className='flex justify-between'><span className='text-muted/50'>Role</span><span className='font-mono text-muted'>{action.checker_role}</span></div>
                  <div className='flex justify-between'><span className='text-muted/50'>IP</span><span className='font-mono text-muted'>{action.checker_ip}</span></div>
                  <div className='flex justify-between'><span className='text-muted/50'>At</span><span className='font-mono text-muted'>{action.checked_at ? new Date(action.checked_at).toLocaleString('en-MU') : '—'}</span></div>
                  {action.checker_note && <div className='text-muted/70 italic mt-1'>"{action.checker_note}"</div>}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div>
            <div className='text-[9px] font-bold text-muted/50 uppercase tracking-widest mb-2.5'>Decision</div>

            {!isPending && (
              <AStatusBadge status={action.status} />
            )}

            {isPending && isExpired && (
              <p className='text-[11px] text-red-400'>This action has expired and can no longer be actioned.</p>
            )}

            {isPending && !isExpired && isMaker && (
              <div className='bg-amber-900/20 border border-amber-900 rounded-lg p-3 text-[11px] text-amber-400'>
                <ShieldCheck className='w-4 h-4 mb-1' aria-hidden />
                You initiated this action. A different admin must approve or reject it.
              </div>
            )}

            {isPending && !isExpired && !isMaker && !canApprove && (
              <p className='text-[11px] text-muted/50'>
                You do not have <code className='font-mono text-ficium'>dual_control:approve</code> permission.
              </p>
            )}

            {isPending && !isExpired && !isMaker && canApprove && !showReject && (
              <div className='space-y-3'>
                <AFormField label='Approval note (optional)'>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={2}
                    placeholder='Optional note for the audit record…'
                    className={`${aInputCls} resize-none text-[11px]`}
                  />
                </AFormField>
                <div className='flex gap-2'>
                  <ABtn
                    variant='primary'
                    size='sm'
                    icon={CheckCircle}
                    onClick={() => { onApprove(note); setNote('') }}
                    loading={isApproving}
                  >
                    Approve & execute
                  </ABtn>
                  <ABtn
                    variant='secondary'
                    size='sm'
                    icon={XCircle}
                    onClick={() => setShowReject(true)}
                  >
                    Reject
                  </ABtn>
                </div>
              </div>
            )}

            {isPending && !isExpired && !isMaker && canApprove && showReject && (
              <div className='space-y-3'>
                <AFormField label='Rejection reason (required)'>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    placeholder='Explain why this action is being rejected…'
                    className={`${aInputCls} resize-none text-[11px]`}
                    autoFocus
                  />
                </AFormField>
                <div className='flex gap-2'>
                  <ABtn
                    variant='danger'
                    size='sm'
                    icon={XCircle}
                    onClick={() => { onReject(note); setNote('') }}
                    disabled={!note.trim()}
                    loading={isRejecting}
                  >
                    Confirm reject
                  </ABtn>
                  <ABtn variant='ghost' size='sm' onClick={() => { setShowReject(false); setNote('') }}>
                    Cancel
                  </ABtn>
                </div>
              </div>
            )}

            {action.execution_error && (
              <div className='mt-3'>
                <AAlert variant='error'>Execution error: {action.execution_error}</AAlert>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// tiny AFormField shim for this page
function AFormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className='block text-[10px] font-bold text-muted/70 uppercase tracking-widest mb-1.5'>{label}</label>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDualControl() {
  const { data: me }                                   = useAdminMe()
  const [statusFilter, setStatusFilter]                = useState('pending')
  const { data: actions = [], isLoading }              = useDualControlActions(statusFilter)
  const approve                                        = useApproveDualControl()
  const reject                                         = useRejectDualControl()
  const [expanded, setExpanded]                        = useState<string | null>(null)
  const [success,  setSuccess]                         = useState<string | null>(null)

  const canApprove = me?.role_slug === 'super_admin' || me?.permissions?.includes('dual_control:approve') || false

  const handleApprove = useCallback(async (actionId: string, note: string) => {
    await approve.mutateAsync({ actionId, note })
    setSuccess(`Action ${actionId.slice(0, 8)} approved and executed`)
    setExpanded(null)
    setTimeout(() => setSuccess(null), 6000)
  }, [approve])

  const handleReject = useCallback(async (actionId: string, note: string) => {
    await reject.mutateAsync({ actionId, note })
    setSuccess(`Action ${actionId.slice(0, 8)} rejected`)
    setExpanded(null)
    setTimeout(() => setSuccess(null), 6000)
  }, [reject])

  const pending = actions.filter(a => a.status === 'pending')
  const urgent  = pending.filter(a => new Date(a.expires_at).getTime() - Date.now() < 2 * 3_600_000)

  return (
    <main className='p-6 lg:p-8 max-w-[1440px] mx-auto'>
      <ASectionHeader
        title='Dual Control'
        subtitle={`${pending.length} pending · four-eyes enforced · self-approval blocked at database level`}
        badge={<ALiveBadge />}
      />

      <div className='bg-white border border-ficium/20/50 rounded-xl px-5 py-3 flex items-center gap-3 mb-5'>
        <ShieldCheck className='w-4 h-4 text-ficium flex-shrink-0' aria-hidden />
        <p className='text-[10px] text-ficium font-mono uppercase tracking-widest'>
          Four-eyes control enforced · Self-approval blocked at DB level · All decisions immutably logged · Maker IP recorded
        </p>
      </div>

      {urgent.length > 0 && (
        <div className='mb-5'>
          <AAlert variant='warning'>
            <span className='font-bold'>{urgent.length} action{urgent.length > 1 ? 's' : ''}</span> expiring
            within 2 hours — review immediately.
          </AAlert>
        </div>
      )}

      {success && (
        <div className='mb-5'>
          <AAlert variant='success' onDismiss={() => setSuccess(null)}>{success}</AAlert>
        </div>
      )}

      <div className='mb-5'>
        <AFilterPills options={STATUS_OPTS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {isLoading ? (
        <ADataTable headers={['Action', 'Risk', 'Maker', 'Resource', 'Status', 'Time left', '']} caption='Loading…'>
          {Array.from({ length: 4 }).map((_, i) => <ASkeletonRow key={i} cols={7} />)}
        </ADataTable>
      ) : actions.length === 0 ? (
        <AEmptyState icon={GitMerge} title='No actions' description={`No ${statusFilter === 'all' ? '' : statusFilter} actions`} />
      ) : (
        <ADataTable
          headers={['Action', 'Risk', 'Maker', 'Resource', 'Status', 'Time left', '']}
          caption='Dual-control action queue'
        >
          {actions.map(a => {
            const { label: tl, urgent: isUrgent } = timeLeft(a.expires_at)
            const isOpen = expanded === a.id
            const isMaker = a.maker_id === me?.id
            return (
              <>
                <ATr key={a.id} selected={isOpen} onClick={() => setExpanded(isOpen ? null : a.id)}>
                  <ATd>
                    <div className='font-mono text-ficium-bright text-[11px]'>{a.action_label}</div>
                    <div className='text-[9px] text-muted/50 mt-0.5'>{a.action_category}</div>
                  </ATd>
                  <ATd><RiskBadge risk={a.risk} /></ATd>
                  <ATd>
                    <div className='text-[11px] font-mono text-muted'>{a.maker_email}</div>
                    <div className='text-[9px] text-muted/50 font-mono'>{a.maker_ip}</div>
                    {isMaker && <span className='text-[9px] text-ficium font-bold'>YOU</span>}
                  </ATd>
                  <ATd className='text-[11px]'>
                    <div>{a.resource_label ?? a.resource_type}</div>
                    {a.resource_id && <AMonoRef value={a.resource_id} />}
                  </ATd>
                  <ATd><AStatusBadge status={a.status} /></ATd>
                  <ATd className={isUrgent ? 'text-amber-400 font-bold text-[11px]' : 'text-[11px]'}>
                    {a.status === 'pending' ? tl : '—'}
                    {isUrgent && a.status === 'pending' && (
                      <AlertTriangle className='w-3 h-3 inline-block ml-1' aria-hidden />
                    )}
                  </ATd>
                  <td className='px-5 py-3.5'>
                    <button aria-label={isOpen ? 'Collapse' : 'Expand'}
                      className='text-muted/50 hover:text-ink/80 transition-colors'>
                      {isOpen ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
                    </button>
                  </td>
                </ATr>
                {isOpen && (
                  <ActionDetailPanel
                    key={`${a.id}-detail`}
                    action={a}
                    canApprove={canApprove}
                    isMaker={isMaker}
                    onApprove={note => handleApprove(a.id, note)}
                    onReject={note => handleReject(a.id, note)}
                    isApproving={approve.isPending}
                    isRejecting={reject.isPending}
                  />
                )}
              </>
            )
          })}
        </ADataTable>
      )}
    </main>
  )
}
