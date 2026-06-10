/**
 * @page AdminDashboard
 * @route /admin/dashboard
 * @access protected — all admin roles
 * @description
 *   System health KPIs, urgent dual-control queue, recent audit activity,
 *   active sessions panel. All panels are independent — one slow query
 *   does not block the rest of the page.
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { Link } from 'react-router-dom'
import { GitMerge, ScrollText, Radio, AlertTriangle, ArrowRight } from 'lucide-react'
import { useAdminMe, useSystemMetrics, useDualControlActions, useAdminAudit, useAdminSessions } from '../../hooks/useAdmin'
import {
  ASectionHeader, AKpiCard, ALiveBadge, ASkeletonCard, ASkeletonRow,
  ADataTable, ATr, ATd, AStatusBadge, RiskBadge,
} from '../../components/primitives'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-MU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricsRow — system health KPIs
// ─────────────────────────────────────────────────────────────────────────────

function MetricsRow() {
  const { data: metrics = [], isLoading } = useSystemMetrics()
  if (isLoading) {
    return (
      <div className='grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6'>
        {Array.from({ length: 6 }).map((_, i) => <ASkeletonCard key={i} />)}
      </div>
    )
  }
  return (
    <div className='grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6'>
      {metrics.map(m => (
        <AKpiCard
          key={m.key}
          label={m.label}
          value={m.value}
          status={m.status as 'ok' | 'warn' | 'critical'}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UrgentDualControl — top pending actions
// ─────────────────────────────────────────────────────────────────────────────

function UrgentDualControl() {
  const { data: pending = [], isLoading } = useDualControlActions('pending')
  const urgent = pending.filter(a =>
    new Date(a.expires_at).getTime() - Date.now() < 2 * 3_600_000
  )

  return (
    <div className='bg-white rounded-xl border border-ink/[0.08] overflow-hidden mb-5'>
      <div className='flex items-center justify-between px-5 py-4 border-b border-ink/[0.08]'>
        <h2 className='font-black text-[14px] text-ink flex items-center gap-2'>
          <GitMerge className='w-4 h-4 text-ficium' aria-hidden />
          Dual-control queue
          {pending.length > 0 && (
            <span className='bg-ficium text-ink text-[9px] font-black px-2 py-0.5 rounded-full'>
              {pending.length}
            </span>
          )}
        </h2>
        <Link to='/admin/dual-control'
          className='flex items-center gap-1 text-[11px] text-ficium font-bold hover:underline'>
          View all <ArrowRight className='w-3 h-3' aria-hidden />
        </Link>
      </div>

      {urgent.length > 0 && (
        <div className='px-5 py-3 bg-amber-900/20 border-b border-amber-900'>
          <p className='text-[11px] text-amber-400 font-bold flex items-center gap-2'>
            <AlertTriangle className='w-3.5 h-3.5' aria-hidden />
            {urgent.length} action{urgent.length > 1 ? 's' : ''} expiring within 2 hours — action required
          </p>
        </div>
      )}

      {isLoading ? (
        <ADataTable headers={['Action', 'Risk', 'Maker', 'Resource', 'Expires']} caption='Loading…'>
          {Array.from({ length: 3 }).map((_, i) => <ASkeletonRow key={i} cols={5} />)}
        </ADataTable>
      ) : pending.length === 0 ? (
        <p className='text-[12px] text-muted/50 text-center py-10 font-mono'>Queue clear — no pending actions</p>
      ) : (
        <ADataTable headers={['Action', 'Risk', 'Maker', 'Resource', 'Expires']} caption='Pending dual-control actions'>
          {pending.slice(0, 5).map(a => {
            const expiresMs = new Date(a.expires_at).getTime() - Date.now()
            const expiresH  = Math.floor(expiresMs / 3_600_000)
            const expiresM  = Math.floor((expiresMs % 3_600_000) / 60_000)
            const isUrgent  = expiresMs < 2 * 3_600_000
            return (
              <ATr key={a.id}>
                <ATd>
                  <span className='font-mono text-ficium-bright text-[11px]'>{a.action_label}</span>
                </ATd>
                <ATd><RiskBadge risk={a.risk} /></ATd>
                <ATd className='text-[11px] font-mono'>{a.maker_email}</ATd>
                <ATd className='text-[11px]'>{a.resource_label ?? a.resource_type}</ATd>
                <ATd className={isUrgent ? 'text-amber-400 font-bold text-[11px]' : 'text-[11px]'}>
                  {expiresMs <= 0 ? 'Expired' : `${expiresH}h ${expiresM}m`}
                </ATd>
              </ATr>
            )
          })}
        </ADataTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RecentAudit
// ─────────────────────────────────────────────────────────────────────────────

function RecentAudit() {
  const { data: entries = [], isLoading } = useAdminAudit(10)
  return (
    <div className='bg-white rounded-xl border border-ink/[0.08] overflow-hidden'>
      <div className='flex items-center justify-between px-5 py-4 border-b border-ink/[0.08]'>
        <h2 className='font-black text-[14px] text-ink flex items-center gap-2'>
          <ScrollText className='w-4 h-4 text-ficium' aria-hidden />
          Recent audit events
        </h2>
        <Link to='/admin/audit'
          className='flex items-center gap-1 text-[11px] text-ficium font-bold hover:underline'>
          Full log <ArrowRight className='w-3 h-3' aria-hidden />
        </Link>
      </div>
      {isLoading ? (
        <ADataTable headers={['Time', 'Event', 'Actor', 'Outcome']} caption='Loading…'>
          {Array.from({ length: 5 }).map((_, i) => <ASkeletonRow key={i} cols={4} />)}
        </ADataTable>
      ) : (
        <ADataTable headers={['Time', 'Event', 'Actor', 'Outcome']} caption='Recent admin audit log'>
          {entries.map(e => (
            <ATr key={e.id}>
              <ATd className='text-[10px] font-mono text-muted/70 whitespace-nowrap'>
                {fmtTime(e.created_at)}
              </ATd>
              <ATd>
                <div className='font-mono text-[11px] text-ink/80'>{e.event_label}</div>
                <div className='text-[10px] text-muted/50'>{e.action_category}</div>
              </ATd>
              <ATd className='text-[11px] text-muted font-mono'>{e.actor_email ?? 'system'}</ATd>
              <ATd><AStatusBadge status={e.outcome} /></ATd>
            </ATr>
          ))}
        </ADataTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ActiveSessionsSummary — right sidebar panel
// ─────────────────────────────────────────────────────────────────────────────

function ActiveSessionsSummary() {
  const { data: sessions = [], isLoading } = useAdminSessions(true)
  return (
    <div className='bg-white rounded-xl border border-ink/[0.08] overflow-hidden h-full'>
      <div className='flex items-center justify-between px-5 py-4 border-b border-ink/[0.08]'>
        <h2 className='font-black text-[14px] text-ink flex items-center gap-2'>
          <Radio className='w-4 h-4 text-emerald-400' aria-hidden />
          Active sessions
        </h2>
        <ALiveBadge />
      </div>
      {isLoading ? (
        <div className='p-5 space-y-3'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='flex gap-3 items-center animate-pulse'>
              <div className='w-6 h-6 bg-cream/50 rounded-full' />
              <div className='flex-1 h-3 bg-cream/50 rounded' />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className='text-[12px] text-muted/50 text-center py-10 font-mono'>No active sessions</p>
      ) : (
        <ul className='divide-y divide-ink/[0.07]'>
          {sessions.slice(0, 8).map(s => (
            <li key={s.id} className='flex items-center gap-3 px-5 py-3'>
              <span className='w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0 animate-pulse' aria-hidden />
              <div className='flex-1 min-w-0'>
                <div className='text-[12px] font-semibold text-ink/80 truncate'>
                  {s.admin_email ?? s.admin_user_id.slice(0, 12)}
                </div>
                <div className='text-[10px] text-muted/50 font-mono'>
                  {s.ip_address} · {fmtAgo(s.last_active_at)}
                </div>
              </div>
              <span className='text-[9px] font-mono text-muted/30 flex-shrink-0'>
                {s.admin_role?.slice(0, 6) ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sessions.length > 8 && (
        <div className='px-5 py-3 border-t border-ink/[0.08]'>
          <Link to='/admin/sessions' className='text-[11px] text-ficium font-bold hover:underline'>
            +{sessions.length - 8} more →
          </Link>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: me } = useAdminMe()
  return (
    <main className='p-6 lg:p-8 max-w-[1440px] mx-auto'>
      <ASectionHeader
        title='Dashboard'
        subtitle={`${me?.email ?? ''} · ${me?.role_slug ?? ''} · ${
          new Date().toLocaleDateString('en-MU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        }`}
        badge={<ALiveBadge />}
      />
      <MetricsRow />
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-5'>
        <div className='lg:col-span-2 space-y-5'>
          <UrgentDualControl />
          <RecentAudit />
        </div>
        <div className='lg:col-span-1'>
          <ActiveSessionsSummary />
        </div>
      </div>
    </main>
  )
}
