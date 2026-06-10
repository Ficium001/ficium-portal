/**
 * @page AdminUsers
 * @route /admin/users
 * @access protected — users:view
 * @description
 *   Full admin user management. Every write action (create, suspend,
 *   unlock, reset password, role change, force logout, deactivate)
 *   submits to the dual-control queue — never executes immediately.
 *
 *   Features:
 *     - User table with status, MFA, last-login, failed-attempts
 *     - Per-user expanded detail panel with action rail
 *     - Create user modal (dual-control)
 *     - Role change modal with reason capture (dual-control, risk: critical)
 *     - Suspend / Unlock / Reset password / Force logout / Deactivate
 *       all show a ConfirmModal with mandatory reason field
 *     - Status filter pills
 *     - Free-text search (email, name)
 *     - Action success toasts tied to specific dual-control IDs
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useMemo, useCallback } from 'react'
import {
  UserPlus, Search, Unlock, RefreshCw,
  LogOut, ShieldOff, ChevronDown, ChevronUp, Shield, X,
} from 'lucide-react'
import {
  useAdminUsers, useAdminRoles, useAdminMe,
  useCreateAdminUser, useSuspendAdminUser, useUnlockAdminUser,
  useResetAdminPassword, useForceLogout, useChangeAdminRole,
  useDeactivateAdminUser,
} from '../../hooks/useAdmin'
import type { AdminUser, AdminRoleSlug } from '../../types/admin'
import { ROLE_LABELS } from '../../types/admin'
import {
  ASectionHeader, ADataTable, ATr, ATd, AStatusBadge, RiskBadge,
  ASkeletonRow, AEmptyState, AFilterPills, ABtn, AAlert,
  AModal, AConfirmModal, AFormField, aInputCls,
} from '../../components/primitives'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTS = [
  { key: 'all',         label: 'All'         },
  { key: 'active',      label: 'Active'      },
  { key: 'locked',      label: 'Locked'      },
  { key: 'suspended',   label: 'Suspended'   },
  { key: 'pending_mfa', label: 'Pending MFA' },
  { key: 'deactivated', label: 'Deactivated' },
]

// ─────────────────────────────────────────────────────────────────────────────
// CreateUserModal
// ─────────────────────────────────────────────────────────────────────────────

function CreateUserModal({
  open,
  onClose,
  onSuccess,
}: {
  open:      boolean
  onClose:   () => void
  onSuccess: (dcId: string) => void
}) {
  const { data: roles = [] } = useAdminRoles()
  const create              = useCreateAdminUser()
  const [form, setForm]     = useState({ email: '', display_name: '', role_slug: 'support' as AdminRoleSlug })

  const handleSubmit = useCallback(async () => {
    if (!form.email.trim() || !form.display_name.trim()) return
    const dcId = await create.mutateAsync({
      email:        form.email.trim(),
      display_name: form.display_name.trim(),
      role_slug:    form.role_slug,
    })
    onSuccess(dcId)
    onClose()
    setForm({ email: '', display_name: '', role_slug: 'support' })
  }, [form, create, onSuccess, onClose])


  return (
    <AModal open={open} onClose={onClose} title='Create admin user' width='max-w-xl'>
      <div className='space-y-4'>
        <AAlert variant='warning'>
          This action enters the dual-control queue. A second admin with{' '}
          <code className='font-mono text-[11px]'>dual_control:approve</code>{' '}
          permission must approve before the account is created.
        </AAlert>

        <div className='grid grid-cols-2 gap-4'>
          <AFormField label='Email address'>
            <input
              type='email'
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder='admin@ficium.mu'
              className={aInputCls}
            />
          </AFormField>
          <AFormField label='Display name'>
            <input
              value={form.display_name}
              onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              placeholder='Jane Smith'
              className={aInputCls}
            />
          </AFormField>
        </div>

        <AFormField label='Role' hint='Defines what this user can see and do'>
          <select
            value={form.role_slug}
            onChange={e => setForm(f => ({ ...f, role_slug: e.target.value as AdminRoleSlug }))}
            className={aInputCls}
          >
            {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'custom').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
            {roles.filter(r => !r.is_system).map(r => (
              <option key={r.id} value={r.slug}>{r.label} (custom)</option>
            ))}
          </select>
        </AFormField>

        <div>
          <RiskBadge risk='high' />
        </div>

        <div className='flex gap-3 pt-1'>
          <ABtn
            variant='primary'
            onClick={handleSubmit}
            disabled={!form.email.trim() || !form.display_name.trim()}
            loading={create.isPending}
          >
            Submit for approval
          </ABtn>
          <ABtn variant='ghost' onClick={onClose}>Cancel</ABtn>
        </div>

        {create.error && (
          <AAlert variant='error'>{(create.error as Error).message}</AAlert>
        )}
      </div>
    </AModal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RoleChangeModal
// ─────────────────────────────────────────────────────────────────────────────

function RoleChangeModal({
  user,
  open,
  onClose,
  onSuccess,
}: {
  user:      AdminUser
  open:      boolean
  onClose:   () => void
  onSuccess: (dcId: string) => void
}) {
  const change              = useChangeAdminRole()
  const [newRole, setNewRole] = useState<AdminRoleSlug>(user.role_slug)
  const [reason, setReason]   = useState('')

  const handleSubmit = useCallback(async () => {
    if (!reason.trim()) return
    const dcId = await change.mutateAsync({
      admin_user_id: user.id,
      new_role_slug: newRole,
      reason,
    })
    onSuccess(dcId)
    onClose()
    setReason('')
  }, [user, newRole, reason, change, onSuccess, onClose])

  return (
    <AModal open={open} onClose={onClose} title='Change user role' danger>
      <div className='space-y-4'>
        <div className='bg-ink/95 rounded-xl p-4'>
          <div className='text-[10px] text-ink/45 font-mono mb-1'>Target user</div>
          <div className='text-ink/90 font-semibold'>{user.display_name}</div>
          <div className='text-ink/45 text-[12px] font-mono'>{user.email}</div>
          <div className='text-[11px] text-ink/30 mt-1'>
            Current role: <span className='text-ink/60'>{ROLE_LABELS[user.role_slug]}</span>
          </div>
        </div>

        <AFormField label='New role'>
          <select value={newRole} onChange={e => setNewRole(e.target.value as AdminRoleSlug)} className={aInputCls}>
            {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'custom').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </AFormField>

        <AFormField label='Reason (required)' hint='Documented in the immutable audit log'>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder='Business justification for this role change…'
            className={`${aInputCls} resize-none`}
          />
        </AFormField>

        <RiskBadge risk='critical' />

        <div className='flex gap-3 pt-1'>
          <ABtn
            variant='danger'
            onClick={handleSubmit}
            disabled={!reason.trim() || newRole === user.role_slug}
            loading={change.isPending}
          >
            Submit for approval
          </ABtn>
          <ABtn variant='ghost' onClick={onClose}>Cancel</ABtn>
        </div>
      </div>
    </AModal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UserDetailPanel — expandable row detail with full action rail
// ─────────────────────────────────────────────────────────────────────────────

function UserDetailPanel({
  user,
  isSelf,
  onAction,
}: {
  user:     AdminUser
  isSelf:   boolean
  onAction: (type: string, userId: string) => void
}) {
  const isActive    = user.status === 'active'
  const isLocked    = user.status === 'locked'
  const isDeactivated = user.status === 'deactivated'

  return (
    <tr className='bg-ink/95/80'>
      <td colSpan={8} className='px-5 py-4'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-5'>

          {/* Account details */}
          <div>
            <div className='text-[9px] font-bold text-ink/30 uppercase tracking-widest mb-3'>Account details</div>
            <div className='space-y-2'>
              {[
                ['User ID',         user.id.slice(0, 12) + '…'],
                ['Auth UID',        user.auth_user_id.slice(0, 12) + '…'],
                ['MFA enabled',     user.mfa_enabled ? 'Yes' : 'No'],
                ['Last login',      user.last_login_at ? new Date(user.last_login_at).toLocaleString('en-MU') : '—'],
                ['Last login IP',   user.last_login_ip ?? '—'],
                ['Failed logins',   user.failed_login_count.toString()],
                ['Password reset',  user.force_password_reset ? 'Required' : 'Not required'],
                ['Created',         new Date(user.created_at).toLocaleDateString('en-MU')],
              ].map(([l, v]) => (
                <div key={l} className='flex justify-between text-[11px]'>
                  <span className='text-ink/30'>{l}</span>
                  <span className={`font-mono text-ink/60 ${l === 'Failed logins' && user.failed_login_count > 0 ? 'text-amber-400' : ''}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lock/suspend details */}
          <div>
            <div className='text-[9px] font-bold text-ink/30 uppercase tracking-widest mb-3'>Status details</div>
            {user.locked_at && (
              <div className='bg-amber-900/20 border border-amber-900 rounded-lg p-3 mb-3 text-[11px]'>
                <div className='text-amber-400 font-bold mb-1'>Locked</div>
                <div className='text-ink/45'>{user.locked_reason ?? '—'}</div>
                <div className='text-ink/30 mt-1'>{new Date(user.locked_at).toLocaleString('en-MU')}</div>
              </div>
            )}
            {user.suspended_at && (
              <div className='bg-red-900/20 border border-red-900 rounded-lg p-3 text-[11px]'>
                <div className='text-red-400 font-bold mb-1'>Suspended</div>
                <div className='text-ink/45'>{user.suspension_reason ?? '—'}</div>
                <div className='text-ink/30 mt-1'>{new Date(user.suspended_at).toLocaleString('en-MU')}</div>
              </div>
            )}
            {!user.locked_at && !user.suspended_at && (
              <p className='text-[11px] text-ink/30 italic'>No active restrictions</p>
            )}
          </div>

          {/* Action rail */}
          <div>
            <div className='text-[9px] font-bold text-ink/30 uppercase tracking-widest mb-3'>Actions (dual-control)</div>
            {isSelf && (
              <p className='text-[11px] text-ink/30 italic mb-3'>Cannot perform actions on your own account</p>
            )}
            <div className='space-y-2'>
              {isLocked && !isSelf && (
                <button onClick={() => onAction('unlock', user.id)}
                  className='flex items-center gap-2 w-full text-left text-[12px] font-semibold text-emerald-400 bg-emerald-900/20 border border-emerald-900 px-3 py-2 rounded-lg hover:bg-emerald-900/40 transition-colors'>
                  <Unlock className='w-3.5 h-3.5' aria-hidden />Unlock account
                </button>
              )}
              {isActive && !isSelf && (
                <button onClick={() => onAction('suspend', user.id)}
                  className='flex items-center gap-2 w-full text-left text-[12px] font-semibold text-amber-400 bg-amber-900/20 border border-amber-900 px-3 py-2 rounded-lg hover:bg-amber-900/40 transition-colors'>
                  <ShieldOff className='w-3.5 h-3.5' aria-hidden />Suspend account
                </button>
              )}
              {!isDeactivated && !isSelf && (
                <button onClick={() => onAction('reset_password', user.id)}
                  className='flex items-center gap-2 w-full text-left text-[12px] font-semibold text-ficium bg-ficium/[0.08] border border-ficium/20 px-3 py-2 rounded-lg hover:bg-ficium/[0.15] transition-colors'>
                  <RefreshCw className='w-3.5 h-3.5' aria-hidden />Force password reset
                </button>
              )}
              {!isDeactivated && !isSelf && (
                <button onClick={() => onAction('force_logout', user.id)}
                  className='flex items-center gap-2 w-full text-left text-[12px] font-semibold text-ink/60 bg-ink/60 border border-ink/[0.25] px-3 py-2 rounded-lg hover:bg-ink/40 transition-colors'>
                  <LogOut className='w-3.5 h-3.5' aria-hidden />Force logout all sessions
                </button>
              )}
              {!isDeactivated && !isSelf && (
                <button onClick={() => onAction('role_change', user.id)}
                  className='flex items-center gap-2 w-full text-left text-[12px] font-semibold text-ink/60 bg-ink/60 border border-ink/[0.25] px-3 py-2 rounded-lg hover:bg-ink/40 transition-colors'>
                  <Shield className='w-3.5 h-3.5' aria-hidden />Change role
                </button>
              )}
              {!isDeactivated && !isSelf && (
                <button onClick={() => onAction('deactivate', user.id)}
                  className='flex items-center gap-2 w-full text-left text-[12px] font-semibold text-red-400 bg-red-900/20 border border-red-900 px-3 py-2 rounded-lg hover:bg-red-900/40 transition-colors'>
                  <X className='w-3.5 h-3.5' aria-hidden />Deactivate permanently
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type ActionType = 'suspend' | 'unlock' | 'reset_password' | 'force_logout' | 'deactivate' | 'role_change'

export default function AdminUsers() {
  const { data: me }                = useAdminMe()
  const [statusFilter, setStatus]   = useState('all')
  const { data: users = [], isLoading } = useAdminUsers(statusFilter)

  const [search,     setSearch]     = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [actionTarget, setActionTarget] = useState<{ type: ActionType; userId: string } | null>(null)
  const [actionNote,   setActionNote]   = useState('')
  const [roleChangeTarget, setRoleChangeTarget] = useState<AdminUser | null>(null)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)

  const suspend        = useSuspendAdminUser()
  const unlock         = useUnlockAdminUser()
  const resetPw        = useResetAdminPassword()
  const forceLogout    = useForceLogout()
  const deactivate     = useDeactivateAdminUser()

  const filtered = useMemo(() => {
    const lc = search.toLowerCase()
    return users.filter(u =>
      !search || u.email.toLowerCase().includes(lc) || u.display_name.toLowerCase().includes(lc)
    )
  }, [users, search])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 6000)
  }

  const handleAction = useCallback((type: string, userId: string) => {
    if (type === 'role_change') {
      const user = users.find(u => u.id === userId)
      if (user) setRoleChangeTarget(user)
    } else {
      setActionTarget({ type: type as ActionType, userId })
    }
    setActionNote('')
  }, [users])

  const handleConfirm = useCallback(async () => {
    if (!actionTarget || !actionNote.trim()) return
    const { type, userId } = actionTarget
    let dcId: string

    switch (type) {
      case 'suspend':
        dcId = await suspend.mutateAsync({ admin_user_id: userId, suspension_reason: actionNote }) as string
        showSuccess(`Suspension submitted for approval (action ${dcId.slice(0,8)})`)
        break
      case 'unlock':
        dcId = await unlock.mutateAsync({ admin_user_id: userId, note: actionNote }) as string
        showSuccess(`Unlock submitted for approval (action ${dcId.slice(0,8)})`)
        break
      case 'reset_password':
        dcId = await resetPw.mutateAsync({ admin_user_id: userId, reason: actionNote }) as string
        showSuccess(`Password reset submitted for approval (action ${dcId.slice(0,8)})`)
        break
      case 'force_logout':
        dcId = await forceLogout.mutateAsync({ admin_user_id: userId, session_ids: [], reason: actionNote }) as string
        showSuccess(`Force logout submitted for approval (action ${dcId.slice(0,8)})`)
        break
      case 'deactivate':
        dcId = await deactivate.mutateAsync({ admin_user_id: userId, reason: actionNote }) as string
        showSuccess(`Deactivation submitted for approval (action ${dcId.slice(0,8)})`)
        break
    }

    setActionTarget(null)
    setActionNote('')
    setExpanded(null)
  }, [actionTarget, actionNote, suspend, unlock, resetPw, forceLogout, deactivate])

  const actionMeta: Record<ActionType, { label: string; risk: 'low' | 'medium' | 'high' | 'critical'; placeholder: string }> = {
    suspend:        { label: 'Suspend account',           risk: 'high',     placeholder: 'Reason for suspension (required)…'     },
    unlock:         { label: 'Unlock account',            risk: 'medium',   placeholder: 'Reason for unlocking (required)…'      },
    reset_password: { label: 'Force password reset',      risk: 'high',     placeholder: 'Reason for password reset (required)…' },
    force_logout:   { label: 'Force logout all sessions', risk: 'medium',   placeholder: 'Reason for forced logout (required)…'  },
    deactivate:     { label: 'Permanently deactivate',    risk: 'critical', placeholder: 'Reason for deactivation (required)…'   },
    role_change:    { label: 'Change role',               risk: 'critical', placeholder: 'Reason (required)…'                   },
  }

  const meta = actionTarget ? actionMeta[actionTarget.type] : null

  return (
    <main className='p-6 lg:p-8 max-w-[1440px] mx-auto'>
      <ASectionHeader
        title='Admin Users'
        subtitle={`${filtered.length} user${filtered.length !== 1 ? 's' : ''} · all writes enter dual-control queue`}
        actions={
          <ABtn variant='primary' size='sm' icon={UserPlus} onClick={() => setShowCreate(true)}>
            Create user
          </ABtn>
        }
      />

      {successMsg && (
        <div className='mb-5'>
          <AAlert variant='success' onDismiss={() => setSuccessMsg(null)}>
            {successMsg} — check{' '}
            <a href='/admin/dual-control' className='underline'>Dual Control</a> to approve.
          </AAlert>
        </div>
      )}

      <AAlert variant='warning'>
        All user management actions enter the dual-control queue. You cannot approve your own actions.
        All decisions are immutably logged.
      </AAlert>

      <div className='flex flex-col lg:flex-row lg:items-center gap-3 my-5'>
        <AFilterPills options={STATUS_OPTS} value={statusFilter} onChange={setStatus} />
        <div className='relative lg:ml-auto'>
          <Search className='w-3.5 h-3.5 text-ink/30 absolute left-3.5 top-1/2 -translate-y-1/2' aria-hidden />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search email or name…'
            aria-label='Search users'
            className='bg-ink/80 border border-ficium/[0.20] rounded-xl pl-9 pr-4 py-2 text-[12px] text-ink/75 outline-none focus:border-ficium font-mono w-60 transition-all'
          />
        </div>
      </div>

      {isLoading ? (
        <ADataTable headers={['User', 'Role', 'Status', 'MFA', 'Last login', 'Fails', 'Created', '']} caption='Loading…'>
          {Array.from({ length: 5 }).map((_, i) => <ASkeletonRow key={i} cols={8} />)}
        </ADataTable>
      ) : filtered.length === 0 ? (
        <AEmptyState icon={UserPlus} title='No users found' description='Adjust the filter or search term' />
      ) : (
        <ADataTable headers={['User', 'Role', 'Status', 'MFA', 'Last login', 'Fails', 'Created', '']}
          caption='Admin user list'>
          {filtered.map(u => {
            const isSelf = u.id === me?.id
            const isOpen = expanded === u.id
            return (
              <>
                <ATr key={u.id} selected={isOpen} onClick={() => setExpanded(isOpen ? null : u.id)}>
                  <ATd>
                    <div className='font-semibold text-ink/90 text-[13px]'>{u.display_name}</div>
                    <div className='text-[10px] text-ink/30 font-mono'>{u.email}</div>
                    {isSelf && <span className='text-[9px] text-ficium font-bold'>YOU</span>}
                  </ATd>
                  <ATd>
                    <span className='text-[11px] font-mono text-ficium-bright'>
                      {ROLE_LABELS[u.role_slug] ?? u.role_slug}
                    </span>
                  </ATd>
                  <ATd><AStatusBadge status={u.status} /></ATd>
                  <ATd>
                    <span className={`text-[11px] font-bold ${u.mfa_enabled ? 'text-emerald-400' : 'text-red-400'}`}>
                      {u.mfa_enabled ? '✓ ON' : '✗ OFF'}
                    </span>
                  </ATd>
                  <ATd className='text-[11px] text-ink/45 whitespace-nowrap'>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-MU') : '—'}
                  </ATd>
                  <ATd>
                    <span className={`text-[12px] font-bold ${u.failed_login_count > 0 ? 'text-amber-400' : 'text-ink/30'}`}>
                      {u.failed_login_count}
                    </span>
                  </ATd>
                  <ATd className='text-[11px] text-ink/30 whitespace-nowrap'>
                    {new Date(u.created_at).toLocaleDateString('en-MU')}
                  </ATd>
                  <td className='px-5 py-3.5'>
                    <button aria-label={isOpen ? 'Collapse' : 'Expand'}
                      className='text-ink/30 hover:text-ink/75 transition-colors'>
                      {isOpen ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
                    </button>
                  </td>
                </ATr>
                {isOpen && (
                  <UserDetailPanel
                    key={`${u.id}-detail`}
                    user={u}
                    isSelf={isSelf}
                    onAction={handleAction}
                  />
                )}
              </>
            )
          })}
        </ADataTable>
      )}

      {/* Create user modal */}
      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={dcId => showSuccess(`User creation submitted for approval (action ${dcId.slice(0, 8)})`)}
      />

      {/* Role change modal */}
      {roleChangeTarget && (
        <RoleChangeModal
          user={roleChangeTarget}
          open={!!roleChangeTarget}
          onClose={() => setRoleChangeTarget(null)}
          onSuccess={dcId => showSuccess(`Role change submitted for approval (action ${dcId.slice(0, 8)})`)}
        />
      )}

      {/* Generic confirm modal */}
      {meta && (
        <AConfirmModal
          open={!!actionTarget}
          onClose={() => setActionTarget(null)}
          onConfirm={handleConfirm}
          title={meta.label}
          risk={meta.risk}
          notePlaceholder={meta.placeholder}
          noteRequired
          note={actionNote}
          onNoteChange={setActionNote}
          isPending={suspend.isPending || unlock.isPending || resetPw.isPending || forceLogout.isPending || deactivate.isPending}
          confirmLabel='Submit for approval'
        />
      )}
    </main>
  )
}
