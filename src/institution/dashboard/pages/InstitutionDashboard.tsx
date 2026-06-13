/**
 * @page InstitutionDashboard
 * @route /dashboard (institution users)
 * @description
 *   2026 revamp. Same storytelling layout and shared dashboard kit as
 *   the admin dashboard — only the content differs:
 *     1. Hero — greeting, open-request count, count-up KPIs
 *     2. "New requests for you" — open marketplace requests as bid cards
 *        (amount, term, client readiness from client_health_score)
 *     3. "How you're bidding" — bids/day chart + live bid feed
 *     4. "Your standing" — win rate, accepted, pending approvals
 *     5. "Your recent bids" + one-best-action dark callout
 *
 *   Every number on this page is real (react-query hooks) — no mock data.
 *
 * @owner Ficium Engineering
 */

import { useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Gavel, BarChart2, Store, Trophy,
} from 'lucide-react'
import {
  useMyInstitution, useMyBids, usePendingActions, useMarketplace,
} from '../../hooks/useInstitution'
import {
  Hero, HeroButton, GradText, type HeroStat,
  Reveal, SectionHead, Panel, PanelHead, HoverCard, CardIcon,
  StatMini, Feed, FeedItem, DarkCallout, Tag, statusTone, ProgressBar,
  LineChart, type ChartPoint, SkeletonBlock,
} from '../../../shared/ui/dashboard'

// ─── Helpers ──────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtMUR(v: number): string {
  if (v >= 1_000_000) return `Rs ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `Rs ${(v / 1_000).toFixed(0)}K`
  return `Rs ${v.toLocaleString()}`
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

// ─── Sections ─────────────────────────────────────────────────

function InstitutionHero() {
  const navigate = useNavigate()
  const { data: institution }      = useMyInstitution()
  const { data: marketplace = [] } = useMarketplace()
  const { data: bids = [] }        = useMyBids()
  const { data: pending = [] }     = usePendingActions()

  const open      = marketplace.filter(r => r.status === 'open' || r.status === 'bidding')
  const accepted  = bids.filter(b => b.status === 'accepted').length
  const active    = bids.filter(b => b.status === 'submitted').length
  const winRate   = bids.length > 0 ? Math.round((accepted / bids.length) * 100) : 0

  const stats: HeroStat[] = [
    { label: 'Open requests',     value: open.length },
    { label: 'Your active bids',  value: active },
    { label: 'Win rate',          value: winRate, suffix: '%' },
    { label: 'Pending approvals', value: pending.length },
  ]

  const name = institution?.primary_contact_name?.split(' ')[0]
    ?? institution?.name
    ?? 'there'
  const dateLabel = new Date()
    .toLocaleDateString('en-MU', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase()

  return (
    <Hero
      eyebrow={`MARKETPLACE LIVE · ${dateLabel}`}
      live
      headline={
        open.length > 0 ? (
          <>
            {greeting()}, {name}.<br />
            <GradText>{open.length} request{open.length > 1 ? 's' : ''}</GradText> {open.length > 1 ? 'are' : 'is'} open for bids.
          </>
        ) : (
          <>
            {greeting()}, {name}.<br />
            The marketplace is <GradText>quiet — for now.</GradText>
          </>
        )
      }
      subline={
        pending.length > 0
          ? `${pending.length} bid${pending.length > 1 ? 's' : ''} in your approval queue need a checker before they reach clients.`
          : open.length > 0
          ? 'Fresh financing requests are matched to your products. First credible offers win attention.'
          : 'New client requests will appear here the moment they\'re posted.'
      }
      actions={
        <>
          <HeroButton onClick={() => navigate('/marketplace')}>Browse requests</HeroButton>
          <HeroButton variant='ghost' onClick={() => navigate('/bids')}>My bids</HeroButton>
        </>
      }
      stats={stats}
    />
  )
}

function NewRequests() {
  const { data: marketplace = [], isLoading } = useMarketplace()
  const open = marketplace
    .filter(r => r.status === 'open' || r.status === 'bidding')
    .slice(0, 3)
  const total = marketplace.filter(r => r.status === 'open' || r.status === 'bidding').length

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead
        title='New requests for you'
        subtitle='Matched to your product catalogue'
        to='/marketplace'
        toLabel={total > 3 ? `Browse all ${total}` : 'Marketplace'}
      />
      {isLoading ? (
        <div className='grid sm:grid-cols-2 xl:grid-cols-3 gap-4'>
          {[...Array(3)].map((_, i) => <SkeletonBlock key={i} className='h-56' />)}
        </div>
      ) : open.length === 0 ? (
        <Panel className='text-center py-10'>
          <Store className='w-8 h-8 text-muted/50 mx-auto mb-2' aria-hidden />
          <p className='text-[13.5px] text-muted'>No open requests right now — new ones land here automatically.</p>
        </Panel>
      ) : (
        <div className='grid sm:grid-cols-2 xl:grid-cols-3 gap-4'>
          {open.map(req => {
            const readiness = req.client_health_score ?? null
            return (
              <HoverCard key={req.id}>
                <div className='flex items-center gap-3 mb-3'>
                  <CardIcon>
                    <Store className='w-5 h-5 text-ficium' aria-hidden />
                  </CardIcon>
                  <div className='min-w-0'>
                    <h3 className='text-[15.5px] font-semibold text-ink truncate'>
                      {titleCase(req.product_label ?? req.product_type)}
                    </h3>
                    <div className='text-[12.5px] text-muted mt-0.5'>
                      Posted {timeAgo(req.created_at)}
                    </div>
                  </div>
                </div>

                <div className='font-display font-bold tracking-display text-[24px] text-ink'>
                  {fmtMUR(Number(req.amount) || 0)}
                  <span className='font-body font-medium tracking-normal text-[12.5px] text-muted ml-1.5'>
                    {req.term_months ? `· ${req.term_months} months` : ''}
                  </span>
                </div>

                {readiness !== null ? (
                  <ProgressBar value={readiness} label='Client readiness' />
                ) : (
                  <div className='my-3' />
                )}

                <div className='flex items-center gap-2 mb-4 flex-wrap'>
                  <Tag tone={statusTone(req.status)}>{req.status}</Tag>
                  {req.client_employment_status && (
                    <Tag tone='blue'>{titleCase(req.client_employment_status)}</Tag>
                  )}
                </div>

                <div className='flex gap-2.5'>
                  <Link
                    to='/marketplace'
                    className='bg-ink hover:bg-ficium text-white text-[13px] font-semibold px-4 py-2 rounded-[11px] transition-colors'
                  >
                    Place bid
                  </Link>
                  <Link
                    to='/marketplace'
                    className='border border-line hover:border-ficium hover:text-ficium text-ink text-[13px] font-semibold px-4 py-2 rounded-[11px] transition-colors'
                  >
                    Details
                  </Link>
                </div>
              </HoverCard>
            )
          })}
        </div>
      )}
    </Reveal>
  )
}

function BiddingPulse() {
  const { data: bids = [], isLoading } = useMyBids()

  const chartData: ChartPoint[] = useMemo(() => {
    const days: Record<string, number> = {}
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      days[d.toLocaleDateString('en-MU', { month: 'short', day: 'numeric' })] = 0
    }
    bids.forEach(b => {
      const label = new Date(b.submitted_at).toLocaleDateString('en-MU', { month: 'short', day: 'numeric' })
      if (label in days) days[label]++
    })
    return Object.entries(days).map(([label, value]) => ({ label, value }))
  }, [bids])

  const weekTotal = chartData.reduce((s, p) => s + p.value, 0)
  const accepted  = bids.filter(b => b.status === 'accepted').length
  const recent    = bids.slice(0, 5)

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead title="How you're bidding" subtitle='Your bids across the marketplace' to='/bids' toLabel='All bids' />
      <div className='grid lg:grid-cols-[1.6fr_1fr] gap-4'>
        <Panel>
          <PanelHead
            title='Bids placed'
            subtitle={
              <span>
                <b className='text-ink text-[22px] font-display tracking-display'>{weekTotal}</b>
                <span className='ml-2 text-good font-semibold'>this week · {accepted} accepted all-time</span>
              </span>
            }
          />
          {isLoading
            ? <SkeletonBlock className='h-52 mt-5' />
            : <LineChart data={chartData} unit='bids' ariaLabel='Bids placed, last 7 days' />}
        </Panel>
        <Panel>
          <PanelHead title='Bid updates' subtitle='Latest from your bids' />
          {isLoading ? (
            <SkeletonBlock className='h-52 mt-5' />
          ) : recent.length === 0 ? (
            <p className='text-[13px] text-muted text-center py-10'>
              No bids yet — your first one starts the story.
            </p>
          ) : (
            <Feed>
              {recent.map((b, i) => (
                <FeedItem
                  key={b.id}
                  tone={
                    b.status === 'accepted' ? 'good'
                    : b.status === 'rejected' ? 'bad'
                    : b.status === 'expired' ? 'warn'
                    : 'blue'
                  }
                  title={`${titleCase(b.product_label ?? b.product_type ?? 'Bid')} — ${fmtMUR(Number(b.amount_offered) || 0)}`}
                  detail={titleCase(b.status)}
                  time={timeAgo(b.submitted_at)}
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

function Standing() {
  const { data: bids = [], isLoading }    = useMyBids()
  const { data: pending = [] }            = usePendingActions()
  const { data: marketplace = [] }        = useMarketplace()

  const accepted = bids.filter(b => b.status === 'accepted').length
  const winRate  = bids.length > 0 ? Math.round((accepted / bids.length) * 100) : 0

  return (
    <Reveal as='section' className='mt-12'>
      <SectionHead title='Your standing' subtitle='How your institution is performing on Ficium' />
      {isLoading ? (
        <div className='grid grid-cols-2 xl:grid-cols-4 gap-3.5'>
          {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className='h-20' />)}
        </div>
      ) : (
        <div className='grid grid-cols-2 xl:grid-cols-4 gap-3.5'>
          <StatMini
            icon={<BarChart2 className='w-[18px] h-[18px] text-[#7C3AED]' aria-hidden />}
            label='Win rate' value={`${winRate}%`} to='/bids'
          />
          <StatMini
            icon={<Trophy className='w-[18px] h-[18px] text-[#7C3AED]' aria-hidden />}
            label='Bids accepted' value={accepted} to='/bids'
          />
          <StatMini
            icon={<Gavel className='w-[18px] h-[18px] text-[#7C3AED]' aria-hidden />}
            label='Total bids' value={bids.length} to='/bids'
          />
          <StatMini
            icon={<Store className='w-[18px] h-[18px] text-[#7C3AED]' aria-hidden />}
            label='Open requests' value={marketplace.filter(r => r.status === 'open' || r.status === 'bidding').length}
            to='/marketplace'
          />
        </div>
      )}
      {pending.length > 0 && (
        <p className='text-[12.5px] text-muted mt-3'>
          {pending.length} bid{pending.length > 1 ? 's' : ''} waiting in your{' '}
          <Link to='/approvals' className='text-ficium font-semibold hover:underline'>approval queue</Link>.
        </p>
      )}
    </Reveal>
  )
}

function BidsAndCallout() {
  const navigate = useNavigate()
  const { data: bids = [], isLoading }     = useMyBids()
  const { data: pending = [] }             = usePendingActions()
  const { data: marketplace = [] }         = useMarketplace()

  const recent = bids.slice(0, 5)
  const openCount = marketplace.filter(r => r.status === 'open' || r.status === 'bidding').length

  // One best action for this institution right now.
  const callout = pending.length > 0
    ? {
        title: `${pending.length} bid${pending.length > 1 ? 's are' : ' is'} stuck in approvals.`,
        body: 'Bids only reach clients after a checker signs off. Clearing the queue gets your offers in front of clients today.',
        cta: 'Open approvals',
        to: '/approvals',
      }
    : openCount > 0
    ? {
        title: `${openCount} open request${openCount > 1 ? 's' : ''}, zero of your bids on ${openCount > 1 ? 'them' : 'it'} yet.`,
        body: 'Early, credible offers set the benchmark other institutions have to beat. A first bid takes about two minutes.',
        cta: 'Browse requests',
        to: '/marketplace',
      }
    : {
        title: 'Keep your products sharp.',
        body: 'No open requests right now — a good moment to review your product catalogue and rates so the next match is instant.',
        cta: 'Review products',
        to: '/products',
      }

  return (
    <Reveal as='section' className='mt-12'>
      <div className='grid lg:grid-cols-2 gap-4'>
        <Panel>
          <PanelHead
            title='Your recent bids'
            subtitle={`${bids.length} all-time`}
            action={
              <Link to='/bids' className='text-[13px] font-semibold text-ficium hover:underline'>
                All bids
              </Link>
            }
          />
          {isLoading ? (
            <SkeletonBlock className='h-48 mt-4' />
          ) : recent.length === 0 ? (
            <p className='text-[13px] text-muted text-center py-10'>No bids yet.</p>
          ) : (
            <div className='mt-2 flex flex-col'>
              {recent.map(b => (
                <div key={b.id} className='flex items-center gap-3 px-1.5 py-3 rounded-xl hover:bg-[#F7F7FB] transition-colors'>
                  <div
                    className='w-9 h-9 rounded-[11px] grid place-items-center flex-shrink-0'
                    style={{ background: 'linear-gradient(135deg,rgba(30,108,245,.10),rgba(124,58,237,.10))' }}
                    aria-hidden
                  >
                    <Gavel className='w-4 h-4 text-ficium' aria-hidden />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='text-[13.5px] font-semibold text-ink truncate'>
                      {titleCase(b.product_label ?? b.product_type ?? 'Bid')}
                    </div>
                    <div className='text-[11.5px] text-muted'>
                      {fmtMUR(Number(b.amount_offered) || 0)} · {timeAgo(b.submitted_at)}
                    </div>
                  </div>
                  <Tag tone={statusTone(b.status)}>{b.status.replace(/_/g, ' ')}</Tag>
                </div>
              ))}
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

export default function InstitutionDashboard() {
  return (
    <div className='max-w-[1180px] mx-auto px-4 sm:px-6 pt-4 pb-20'>
      <InstitutionHero />
      <NewRequests />
      <BiddingPulse />
      <Standing />
      <BidsAndCallout />
    </div>
  )
}
