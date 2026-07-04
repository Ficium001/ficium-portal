/**
 * @page AdminDashboard
 * @route /dashboard (admin users)
 * @access protected — all admin roles
 * @description
 *   2026 revamp. Storytelling layout on the shared dashboard kit:
 *     1. Hero — greeting, platform status, count-up KPIs (useSystemMetrics)
 *     2. "Waiting on you" — dual-control queue as action cards
 *     3. "Today's pulse" — audit-activity chart + live audit feed
 *     4. "Platform health" — metric minis
 *     5. "Who's on right now" + one-best-action dark callout
 *
 *   All panels independent: one slow query never blocks the page.
 *   Every number on this page is real (react-query hooks) — no mock data.
 *
 * @owner Ficium Engineering
 */

import { useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  GitMerge, Lock, ShieldCheck, Activity,
} from 'lucide-react'
import {
  useAdminMe, useSystemMetrics, useDualControlActions, useAdminAudit, useAdminSessions,
} from '@/admin/hooks/useAdmin'
import {
  Hero, HeroButton, GradText, type HeroStat,
  Reveal, SectionHead, Panel, PanelHead, HoverCard, CardIcon,
  StatMini, Feed, FeedItem, DarkCallout, Tag,
  LineChart, type ChartPoint, SkeletonBlock,
} from '@/shared/ui/dashboard'

// ─── Helpers ──────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-MU', { hour: '2-digit', minute: '2-digit' })
}

function fmtAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function expiresIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

const metricNum = (v: string | number): number =>
  typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.]/g, '')) || 0

// ─── Sections ─────────────────────────────────────────────────

function AdminHero() {
  const navigate = useNavigate()
  const { data: me }            = useAdminMe()
  const { data: metrics = [] }  = useSystemMetrics()
  const { data: pending = [] }  = useDualControlActions('pending')

  const byKey = Object.fromEntries(metrics.map(m => [m.key, m]))
  const anyTrouble = metrics.some(m => m.status !== 'ok')

  const stats: HeroStat[] = [
    { label: 'Admin users',     value: metricNum(byKey.total_admins?.value ?? 0) },
    { label: 'Active sessions', value: metricNum(byKey.active_sessions?.value ?? 0) },
    { label: 'Pending dual-control', value: pending.length },
    { label: 'Audit failure rate', value: metricNum(byKey.audit_fail_rate?.value ?? 0), suffix: '%' },
  ]

  const emailLocalPart = (me?.email ?? 'there').split('@')[0] ?? 'there'
  const firstName = emailLocalPart.split('.')[0] ?? emailLocalPart
  const niceName  = firstName.charAt(0).toUpperCase() + firstName.slice(1)
  const dateLabel = new Date()
    .toLocaleDateString('en-MU', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase()

  return (
    <Hero
      eyebrow={`${anyTrouble ? 'ATTENTION NEEDED' : 'ALL SYSTEMS OPERATIONAL'} · ${dateLabel}`}
      live={!anyTrouble}
      headline={
        pending.length > 0 ? (
          <>
            {greeting()}, {niceName}.<br />
            <GradText>{pending.length} action{pending.length > 1 ? 's' : ''}</GradText> need{pending.length === 1 ? 's' : ''} your sign-off.
          </>
        ) : (
          <>
            {greeting()}, {niceName}.<br />
            Your platform is <GradText>running itself.</GradText>
          </>
        )
      }
      subline={
        pending.length > 0
          ? 'The dual-control queue is waiting on a checker. Everything else is healthy.'
          : 'Dual-control queue is clear and all systems are operational.'
      }
      actions={
        <>
          <HeroButton onClick={() => navigate('/admin/dual-control')}>Review queue</HeroButton>
          <HeroButton variant='ghost' onClick={() => navigate('/admin/audit')}>Audit log</HeroButton>
        </>
      }
      stats={stats}
    />
  )
}

function WaitingOnYou() {
  const { data: pending = [], isLoading } = useDualControlActions('pending')
  const top = pending
    .slice()
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())
    .slice(0, 3)

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead
        title='Waiting on you'
        subtitle={
          pending.length === 0
            ? 'Dual-control queue is clear'
            : `${pending.length} pending action${pending.length > 1 ? 's' : ''} need a checker`
        }
        to='/admin/dual-control'
      />
      {isLoading ? (
        <div className='grid sm:grid-cols-2 xl:grid-cols-3 gap-4'>
          {[...Array(3)].map((_, i) => <SkeletonBlock key={i} className='h-44' />)}
        </div>
      ) : top.length === 0 ? (
        <Panel className='text-center py-10'>
          <ShieldCheck className='w-8 h-8 text-good mx-auto mb-2' aria-hidden />
          <p className='text-[13.5px] text-muted'>Nothing needs your sign-off right now.</p>
        </Panel>
      ) : (
        <div className='grid sm:grid-cols-2 xl:grid-cols-3 gap-4'>
          {top.map(a => {
            const urgent = new Date(a.expires_at).getTime() - Date.now() < 2 * 3_600_000
            return (
              <HoverCard key={a.id}>
                <div className='flex items-center gap-3 mb-3.5'>
                  <CardIcon>
                    <GitMerge className='w-5 h-5 text-ficium' aria-hidden />
                  </CardIcon>
                  <div className='min-w-0'>
                    <h3 className='text-[15.5px] font-semibold text-ink truncate'>{a.action_label}</h3>
                    <div className='text-[12.5px] text-muted mt-0.5 truncate'>
                      {a.resource_label ?? a.resource_type}
                    </div>
                  </div>
                </div>
                <div className='text-[13px] text-muted leading-relaxed mb-4'>
                  Requested by <b className='text-ink font-semibold'>{a.maker_email}</b>
                </div>
                <div className='flex items-center gap-2 mb-4 flex-wrap'>
                  <Tag tone={a.risk === 'high' || a.risk === 'critical' ? 'red' : a.risk === 'medium' ? 'amber' : 'blue'}>
                    {a.risk} risk
                  </Tag>
                  <Tag tone={urgent ? 'red' : 'grey'}>expires {expiresIn(a.expires_at)}</Tag>
                </div>
                <Link
                  to='/admin/dual-control'
                  className='inline-block bg-ink hover:bg-ficium text-white text-[13px] font-semibold px-4 py-2 rounded-[11px] transition-colors'
                >
                  Review
                </Link>
              </HoverCard>
            )
          })}
        </div>
      )}
    </Reveal>
  )
}

function PulseAndFeed() {
  const { data: entries = [], isLoading } = useAdminAudit(100)

  // Audit events per day, last 7 days
  const chartData: ChartPoint[] = useMemo(() => {
    const days: Record<string, number> = {}
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      days[d.toLocaleDateString('en-MU', { month: 'short', day: 'numeric' })] = 0
    }
    entries.forEach(e => {
      const label = new Date(e.created_at).toLocaleDateString('en-MU', { month: 'short', day: 'numeric' })
      if (label in days) days[label] = (days[label] ?? 0) + 1
    })
    return Object.entries(days).map(([label, value]) => ({ label, value }))
  }, [entries])

  const todayCount = chartData.at(-1)?.value ?? 0
  const recent = entries.slice(0, 5)

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead title="Today's pulse" subtitle='Admin activity across the platform' to='/admin/audit' toLabel='Full log' />
      <div className='grid lg:grid-cols-[1.6fr_1fr] gap-4'>
        <Panel>
          <PanelHead
            title='Audit events'
            subtitle={
              <span>
                <b className='text-ink text-[22px] font-display tracking-display'>{todayCount}</b>
                <span className='ml-2 text-good font-semibold'>today</span>
              </span>
            }
          />
          {isLoading
            ? <SkeletonBlock className='h-52 mt-5' />
            : <LineChart data={chartData} unit='events' ariaLabel='Audit events, last 7 days' />}
        </Panel>
        <Panel>
          <PanelHead title='Just happened' subtitle='Live audit trail' />
          {isLoading ? (
            <SkeletonBlock className='h-52 mt-5' />
          ) : recent.length === 0 ? (
            <p className='text-[13px] text-muted text-center py-10'>No recent events.</p>
          ) : (
            <Feed>
              {recent.map((e, i) => (
                <FeedItem
                  key={e.id}
                  tone={
                    e.outcome === 'success' ? 'good'
                    : e.outcome === 'failed' || e.outcome === 'blocked' ? 'bad'
                    : 'blue'
                  }
                  title={e.event_label}
                  detail={`${e.actor_email ?? 'system'} · ${e.action_category}`}
                  time={fmtTime(e.created_at)}
                  last={i === recent.length - 1}
                />
              ))}
            </Feed>
          )}
        </Panel>
      </div>
    </Reveal>
  )
}

function PlatformHealth() {
  const { data: metrics = [], isLoading } = useSystemMetrics()
  const allOk = metrics.every(m => m.status === 'ok')

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead
        title={allOk ? 'Everything is healthy' : 'Platform health'}
        subtitle={allOk ? 'All systems operational' : 'Some metrics need attention'}
      />
      {isLoading ? (
        <div className='grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5'>
          {[...Array(6)].map((_, i) => <SkeletonBlock key={i} className='h-20' />)}
        </div>
      ) : (
        <div className='grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5'>
          {metrics.map(m => (
            <StatMini
              key={m.key}
              icon={
                m.status === 'ok'
                  ? <Activity className='w-[18px] h-[18px] text-good' aria-hidden />
                  : <Lock className='w-[18px] h-[18px] text-warn' aria-hidden />
              }
              tone={m.status === 'ok' ? 'green' : 'violet'}
              label={m.label}
              value={String(m.value)}
            />
          ))}
        </div>
      )}
    </Reveal>
  )
}

function SessionsAndCallout() {
  const navigate = useNavigate()
  const { data: sessions = [], isLoading } = useAdminSessions(true)
  const { data: pending = [] }             = useDualControlActions('pending')
  const { data: metrics = [] }             = useSystemMetrics()

  const locked = metricNum(
    metrics.find(m => m.key === 'locked_accounts')?.value ?? 0,
  )

  // One best action: most urgent thing on the platform right now.
  const soonestPending = pending.length
    ? pending.slice().sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())[0]
    : undefined

  const callout = pending.length > 0
    ? {
        title: `${pending.length} action${pending.length > 1 ? 's' : ''} waiting in dual-control.`,
        body: 'The soonest one expires ' +
          (soonestPending ? `in ${expiresIn(soonestPending.expires_at)}` : 'soon') +
          '. A quick review keeps makers unblocked and the platform moving.',
        cta: 'Review queue',
        to: '/admin/dual-control',
      }
    : locked > 0
    ? {
        title: `${locked} account${locked > 1 ? 's are' : ' is'} locked.`,
        body: 'Locked admins can\'t work. Unlocking takes a minute from the users page.',
        cta: 'Open users',
        to: '/admin/users',
      }
    : {
        title: 'All clear.',
        body: 'No pending approvals, no locked accounts, systems healthy. A good moment to review the audit trail or tidy up groups.',
        cta: 'Browse audit log',
        to: '/admin/audit',
      }

  return (
    <Reveal as='section' className='mt-12'>
      <div className='grid lg:grid-cols-2 gap-4'>
        <Panel>
          <PanelHead
            title="Who's on right now"
            subtitle={`${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}
            action={
              <Link to='/admin/sessions' className='text-[13px] font-semibold text-ficium hover:underline'>
                All sessions
              </Link>
            }
          />
          {isLoading ? (
            <SkeletonBlock className='h-48 mt-4' />
          ) : sessions.length === 0 ? (
            <p className='text-[13px] text-muted text-center py-10'>No active sessions.</p>
          ) : (
            <div className='mt-2 flex flex-col'>
              {sessions.slice(0, 5).map(s => {
                const name = s.admin_email ?? s.admin_user_id.slice(0, 12)
                return (
                  <div key={s.id} className='flex items-center gap-3 px-1.5 py-3 rounded-xl hover:bg-[#F7F7FB] transition-colors'>
                    <div
                      className='w-9 h-9 rounded-full grid place-items-center shrink-0 text-[12px] font-bold text-white'
                      style={{ background: 'linear-gradient(135deg,#1E6CF5,#7C3AED)' }}
                      aria-hidden
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='text-[13.5px] font-semibold text-ink truncate'>{name}</div>
                      <div className='text-[11.5px] text-muted font-mono truncate'>
                        {s.ip_address}{s.admin_role ? ` · ${s.admin_role}` : ''}
                      </div>
                    </div>
                    <span className='text-[12px] text-muted shrink-0'>{fmtAgo(s.last_active_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <DarkCallout
          title={callout.title}
          body={callout.body}
          action={<HeroButton onClick={() => navigate(callout.to)}>{callout.cta}</HeroButton>}
        />
      </div>
    </Reveal>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function AdminDashboard() {
  return (
    <div className='max-w-[1180px] mx-auto px-4 sm:px-6 pt-4 pb-20'>
      <AdminHero />
      <WaitingOnYou />
      <PulseAndFeed />
      <PlatformHealth />
      <SessionsAndCallout />
    </div>
  )
}
