/**
 * @page InstitutionAdminDashboard
 * @route /dashboard (institution users WITHOUT inst:marketplace)
 * @description
 *   Dashboard for institution admins and checkers — focused on:
 *     1. Hero    — institution health, team size, pending approvals
 *     2. Queue   — live dual-control actions needing sign-off
 *     3. Team    — member list with group + role at a glance
 *     4. Audit   — recent activity feed
 *     5. Callout — one best action
 *
 * @owner Ficium Engineering
 */

import { useNavigate, Link } from 'react-router-dom'
import { Users, ShieldCheck, ScrollText, GitMerge, UserPlus, Settings } from 'lucide-react'
import {
  usePendingActions, useInstitutionUsers, useMyInstitution, useAuditEvents,
} from '@/institution/hooks/useInstitution'
import {
  Hero, HeroButton, GradText, type HeroStat,
  Reveal, SectionHead, Panel, PanelHead, Feed, FeedItem,
  StatMini, DarkCallout, Tag, SkeletonBlock,
} from '@/shared/ui/dashboard'

// ─── Helpers ──────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const RISK_STYLE: Record<string, string> = {
  low:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  high:   'bg-red-50 text-red-600 border border-red-200',
}

// ─── Hero ─────────────────────────────────────────────────────

function AdminHero() {
  const navigate = useNavigate()
  const { data: institution }  = useMyInstitution()
  const { data: pending = [] } = usePendingActions()
  const { data: members = [] } = useInstitutionUsers()

  const pendingCount   = pending.filter(a => a.action_status === 'pending').length
  const unassigned     = members.filter((m) => !m.custom_group_id).length
  const dateLabel      = new Date()
    .toLocaleDateString('en-MU', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase()

  const stats: HeroStat[] = [
    { label: 'Team members',      value: members.length },
    { label: 'Pending approvals', value: pendingCount   },
    { label: 'Unassigned users',  value: unassigned     },
  ]

  const name = institution?.name ?? 'Admin'

  return (
    <Hero
      eyebrow={`INSTITUTION ADMIN · ${dateLabel}`}
      headline={
        pendingCount > 0 ? (
          <>
            {greeting()}, {name}.<br />
            <GradText>{pendingCount} action{pendingCount > 1 ? 's' : ''}</GradText> waiting for your sign-off.
          </>
        ) : (
          <>
            {greeting()}, {name}.<br />
            Your institution is <GradText>all clear.</GradText>
          </>
        )
      }
      subline={
        pendingCount > 0
          ? 'Internal actions are pending your approval. Review and sign off to keep your team moving.'
          : unassigned > 0
          ? `${unassigned} team member${unassigned > 1 ? 's are' : ' is'} not yet assigned to a group.`
          : 'No pending actions. Your dual-control queue is clear and your team is set up.'
      }
      actions={
        <>
          <HeroButton onClick={() => navigate('/inst-dual-control')}>Review queue</HeroButton>
          <HeroButton variant='ghost' onClick={() => navigate('/team/users')}>Team</HeroButton>
        </>
      }
      stats={stats}
    />
  )
}

// ─── Dual control queue ───────────────────────────────────────

function DualControlQueue() {
  const { data: actions = [], isLoading } = usePendingActions()

  const pending = actions
    .filter((a) => a.action_status === 'pending')
    .slice(0, 5)

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead
        title='Waiting for your sign-off'
        subtitle='Dual-control queue'
        to='/inst-dual-control'
        toLabel='View all'
      />
      {isLoading ? (
        <div className='space-y-3'>
          {[...Array(3)].map((_, i) => <SkeletonBlock key={i} className='h-16' />)}
        </div>
      ) : pending.length === 0 ? (
        <Panel className='text-center py-10'>
          <ShieldCheck className='w-8 h-8 text-good/60 mx-auto mb-2' aria-hidden />
          <p className='text-[13.5px] text-muted'>Dual-control queue is clear.</p>
        </Panel>
      ) : (
        <div className='space-y-3'>
          {pending.map((action) => {
            const risk = (action.payload?.risk as string | undefined) ?? 'medium'
            const expiresMs = new Date(action.expires_at).getTime() - Date.now()
            const urgent = expiresMs < 4 * 3_600_000
            return (
              <Panel key={action.id} className={urgent ? 'border-amber-300' : ''}>
                <div className='flex items-center gap-4'>
                  <div className='w-9 h-9 rounded-xl bg-ficium/8 flex items-center justify-center flex-shrink-0'>
                    <GitMerge className='w-4 h-4 text-ficium' aria-hidden />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='text-[13.5px] font-semibold text-ink'>
                        {titleCase(action.action_category)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RISK_STYLE[risk] ?? RISK_STYLE.medium}`}>
                        {risk} risk
                      </span>
                    </div>
                    <div className='text-[11.5px] text-muted mt-0.5'>
                      By {action.maker_role ?? 'maker'} · {timeAgo(action.initiated_at)}
                      {urgent && <span className='text-amber-600 font-semibold ml-2'>· Expires soon</span>}
                    </div>
                  </div>
                  <Link
                    to='/inst-dual-control'
                    className='text-[12.5px] font-semibold text-ficium hover:underline flex-shrink-0'
                  >
                    Review →
                  </Link>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </Reveal>
  )
}

// ─── Team overview ────────────────────────────────────────────

function TeamOverview() {
  const { data: members = [], isLoading } = useInstitutionUsers()

  const recent = [...members].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5)

  const unassigned = members.filter((m) => !m.custom_group_id).length

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead
        title='Your team'
        subtitle={`${members.length} member${members.length !== 1 ? 's' : ''}${unassigned > 0 ? ` · ${unassigned} unassigned` : ''}`}
        to='/team/users'
        toLabel='Manage team'
      />
      {isLoading ? (
        <SkeletonBlock className='h-48' />
      ) : (
        <Panel>
          <div className='divide-y divide-line'>
            {recent.map((m) => {
              const initials = (m.full_name ?? m.email ?? '?')
                .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div key={m.id} className='flex items-center gap-3 py-3 first:pt-0 last:pb-0'>
                  <div className='w-8 h-8 rounded-full bg-ficium/10 flex items-center justify-center text-[11px] font-bold text-ficium flex-shrink-0'>
                    {initials}
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='text-[13px] font-semibold text-ink truncate'>
                      {m.full_name || m.email}
                    </div>
                    {m.full_name && (
                      <div className='text-[11px] text-muted truncate'>{m.email}</div>
                    )}
                  </div>
                  <div className='flex items-center gap-2 flex-shrink-0'>
                    {m.custom_group_id ? (
                      <Tag tone='blue'>{m.member_role ?? m.role}</Tag>
                    ) : (
                      <Tag tone='warn'>Unassigned</Tag>
                    )}
                    {m.is_primary_admin && (
                      <Tag tone='good'>Primary</Tag>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}
    </Reveal>
  )
}

// ─── Stats + Audit ────────────────────────────────────────────

function StatsAndAudit() {
  const { data: members = [] }    = useInstitutionUsers()
  const { data: pending = [] }    = usePendingActions()
  const { data: events = [], isLoading } = useAuditEvents(8)

  const pendingCount = pending.filter((a) => a.action_status === 'pending').length
  const recent       = events.slice(0, 6)

  return (
    <Reveal as='section' className='mt-12'>
      <div className='grid lg:grid-cols-[1fr_1.4fr] gap-4'>

        {/* Stats */}
        <div className='space-y-3'>
          <SectionHead title='At a glance' subtitle='Institution metrics' />
          <div className='grid grid-cols-2 gap-3'>
            <StatMini
              icon={<Users className='w-[18px] h-[18px] text-[#7C3AED]' />}
              label='Team members' value={members.length} to='/team/users'
            />
            <StatMini
              icon={<GitMerge className='w-[18px] h-[18px] text-[#7C3AED]' />}
              label='Pending approvals' value={pendingCount} to='/inst-dual-control'
            />
            <StatMini
              icon={<ShieldCheck className='w-[18px] h-[18px] text-[#7C3AED]' />}
              label='Groups' value={
                [...new Set(members.filter((m) => m.custom_group_id).map((m) => m.custom_group_id))].length
              } to='/settings'
            />
            <StatMini
              icon={<ScrollText className='w-[18px] h-[18px] text-[#7C3AED]' />}
              label='Audit events' value={events.length} to='/audit'
            />
          </div>
        </div>

        {/* Audit feed */}
        <div>
          <SectionHead title='Recent activity' subtitle='Audit trail' to='/audit' toLabel='Full audit' />
          <Panel>
            {isLoading ? (
              <SkeletonBlock className='h-48' />
            ) : recent.length === 0 ? (
              <p className='text-[13px] text-muted text-center py-8'>No activity yet.</p>
            ) : (
              <Feed>
                {recent.map((e, i: number) => (
                  <FeedItem
                    key={e.id}
                    tone={e.outcome === 'success' ? 'good' : ['rejected','failed'].includes(e.outcome) ? 'bad' : 'blue'}
                    title={titleCase(e.action_category ?? e.event_label ?? 'Event')}
                    detail={e.actor_role ?? e.actor_id?.slice(0, 8) ?? '—'}
                    time={timeAgo(e.created_at)}
                    last={i === recent.length - 1}
                  />
                ))}
              </Feed>
            )}
          </Panel>
        </div>

      </div>
    </Reveal>
  )
}

// ─── Callout ──────────────────────────────────────────────────

function AdminCallout() {
  const navigate = useNavigate()
  const { data: pending = [] }    = usePendingActions()
  const { data: members = [] }    = useInstitutionUsers()

  const pendingCount = pending.filter((a) => a.action_status === 'pending').length
  const unassigned   = members.filter((m) => !m.custom_group_id).length

  const callout = pendingCount > 0
    ? {
        title: `${pendingCount} action${pendingCount > 1 ? 's are' : ' is'} waiting for approval.`,
        body: 'Your team can\'t proceed until a checker signs off. Clearing the queue keeps operations moving.',
        cta: 'Review queue', to: '/inst-dual-control',
      }
    : unassigned > 0
    ? {
        title: `${unassigned} team member${unassigned > 1 ? 's have' : ' has'} no group assigned.`,
        body: 'Users without a group can\'t access any modules. Assign them to the right group to unlock their access.',
        cta: 'Manage team', to: '/team/users',
      }
    : {
        title: 'Everything is in order.',
        body: 'No pending approvals, no unassigned users. A good time to review your group permissions or check the audit trail.',
        cta: 'View audit trail', to: '/audit',
      }

  return (
    <Reveal as='section' className='mt-12'>
      <div className='grid lg:grid-cols-2 gap-4'>

        {/* Quick actions */}
        <Panel>
          <PanelHead title='Quick actions' subtitle='Common admin tasks' />
          <div className='mt-4 grid grid-cols-2 gap-2.5'>
            {[
              { icon: UserPlus,   label: 'Create user',  to: '/team/users'         },
              { icon: ShieldCheck,label: 'Create group', to: '/settings'           },
              { icon: GitMerge,   label: 'Dual control', to: '/inst-dual-control'  },
              { icon: Settings,   label: 'Settings',     to: '/settings'           },
            ].map(({ icon: Icon, label, to }) => (
              <button
                key={label}
                onClick={() => navigate(to)}
                className='flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-line hover:border-ficium hover:text-ficium text-ink transition-all text-left group'
              >
                <Icon className='w-4 h-4 flex-shrink-0 group-hover:text-ficium text-muted transition-colors' aria-hidden />
                <span className='text-[13px] font-semibold'>{label}</span>
              </button>
            ))}
          </div>
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

export default function InstitutionAdminDashboard() {
  return (
    <div className='max-w-[1180px] mx-auto px-4 sm:px-6 pt-4 pb-20'>
      <AdminHero />
      <DualControlQueue />
      <TeamOverview />
      <StatsAndAudit />
      <AdminCallout />
    </div>
  )
}
