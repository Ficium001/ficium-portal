/**
 * @page AdminSessions
 * @route /admin/sessions
 * @access protected — sessions:view
 * @description Live and historical admin session monitor with force-terminate.
 * @owner Ficium Engineering
 */

import { useState } from 'react'
import { Radio, MonitorOff, RefreshCw } from 'lucide-react'
import { useAdminSessions, useAdminMe, useTerminateSession } from '../../hooks/useAdmin'
import { ASectionHeader, ALiveBadge, AFilterPills, ADataTable, ATr, ATd, AStatusBadge, ASkeletonRow, AEmptyState, ABtn, AConfirmModal, AMonoRef, AAlert } from '../../components/primitives'

const OPTS = [{ key: 'true', label: 'Active' }, { key: 'false', label: 'All' }]

function fmtDuration(start: string, end?: string | null) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function AdminSessions() {
  const { data: me } = useAdminMe()
  const [activeOnly, setActiveOnly] = useState('true')
  const { data: sessions = [], isLoading, refetch } = useAdminSessions(activeOnly === 'true')
  const terminate = useTerminateSession()
  const [target, setTarget] = useState<{ id: string; email: string } | null>(null)
  const [reason, setReason] = useState('')
  const [success, setSuccess] = useState<string | null>(null)

  const canTerminate = me?.role_slug === 'super_admin' || me?.permissions?.includes('sessions:terminate')

  const handleTerminate = async () => {
    if (!target) return
    await terminate.mutateAsync({ sessionId: target.id, reason })
    setSuccess(`Session ${target.id.slice(0, 8)} terminated`)
    setTarget(null); setReason('')
    setTimeout(() => setSuccess(null), 5000)
  }

  const live   = sessions.filter(s => s.is_active).length
  const unique = new Set(sessions.map(s => s.admin_user_id)).size

  return (
    <main className='p-6 lg:p-8 max-w-[1440px] mx-auto'>
      <ASectionHeader title='Sessions' subtitle={`${live} active · ${unique} unique users · auto-refreshes every 30 s`}
        badge={<ALiveBadge />}
        actions={<ABtn variant='secondary' size='sm' icon={RefreshCw} onClick={() => refetch()}>Refresh</ABtn>}
      />

      {success && <div className='mb-5'><AAlert variant='success' onDismiss={() => setSuccess(null)}>{success}</AAlert></div>}

      <div className='mb-5'>
        <AFilterPills options={OPTS} value={activeOnly} onChange={setActiveOnly} />
      </div>

      {isLoading ? (
        <ADataTable headers={['User', 'Role', 'IP', 'Location', 'Started', 'Last active', 'Duration', 'Status', '']} caption='Loading…'>
          {Array.from({ length: 5 }).map((_, i) => <ASkeletonRow key={i} cols={9} />)}
        </ADataTable>
      ) : sessions.length === 0 ? (
        <AEmptyState icon={Radio} title='No sessions' description='No sessions match the current filter' />
      ) : (
        <ADataTable headers={['User', 'Role', 'IP address', 'Location', 'Started', 'Last active', 'Duration', 'Status', '']} caption='Admin sessions'>
          {sessions.map(s => {
            const isSelf = s.admin_user_id === me?.id
            return (
              <ATr key={s.id}>
                <ATd>
                  <div className='font-semibold text-[12px] text-white/90'>{s.admin_email ?? '—'}</div>
                  <AMonoRef value={s.id} />
                  {isSelf && <span className='text-[9px] text-ficium font-bold block'>CURRENT SESSION</span>}
                </ATd>
                <ATd className='text-[11px] font-mono text-ficium-bright'>{s.admin_role ?? '—'}</ATd>
                <ATd className='text-[11px] font-mono'>{s.ip_address}</ATd>
                <ATd className='text-[11px] text-white/45'>
                  {[s.city, s.country].filter(Boolean).join(', ') || '—'}
                </ATd>
                <ATd className='text-[11px] text-white/45 whitespace-nowrap'>
                  {new Date(s.started_at).toLocaleString('en-MU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </ATd>
                <ATd className='text-[11px] text-white/45 whitespace-nowrap'>
                  {new Date(s.last_active_at).toLocaleTimeString('en-MU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </ATd>
                <ATd className='text-[11px] font-mono'>{fmtDuration(s.started_at, s.ended_at)}</ATd>
                <ATd><AStatusBadge status={s.is_active ? 'active' : 'logged'} label={s.is_active ? 'Active' : s.end_reason ?? 'Ended'} /></ATd>
                <ATd>
                  {s.is_active && !isSelf && canTerminate && (
                    <button onClick={() => setTarget({ id: s.id, email: s.admin_email ?? s.admin_user_id })}
                      className='flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors'>
                      <MonitorOff className='w-3 h-3' aria-hidden />Kill
                    </button>
                  )}
                </ATd>
              </ATr>
            )
          })}
        </ADataTable>
      )}

      <AConfirmModal
        open={!!target}
        onClose={() => { setTarget(null); setReason('') }}
        onConfirm={handleTerminate}
        title='Terminate session'
        description={`Force-logout ${target?.email}. They will be signed out immediately.`}
        confirmLabel='Terminate session'
        risk='medium'
        notePlaceholder='Reason for forced termination (required)…'
        noteRequired
        note={reason}
        onNoteChange={setReason}
        isPending={terminate.isPending}
      />
    </main>
  )
}
