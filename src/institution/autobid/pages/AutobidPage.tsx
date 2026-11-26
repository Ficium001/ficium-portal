/**
 * Autobid — the bank's automatic bidding, run its own way.
 *
 * Overview: on or off (with the instant kill switch), today's results against the daily limits.
 * Rules:    Ficium-hosted rules, four-eyes.
 * Setup:    who decides (rules / the bank's own engine / both), approval per bid or not,
 *           limits, products. Every change is approved by a second person.
 * Activity: every evaluation and why.
 *
 * Licensed per bank (AUTOBID). Without the licence the page says so instead of failing.
 */
import { useState } from 'react'
import { Zap, PauseOctagon, Send, Clock, Ban } from 'lucide-react'
import {
  Btn, ConfirmModal, EmptyState, InlineAlert, KpiCard, SectionHeader, SkeletonCard,
} from '@/institution/components/primitives'
import { SectionTabs } from '@/shared/components/SectionTabs'
import { PageFrame } from '@/shared/components/PageFrame'
import { useAutobidOverview, usePauseBank, useSummary } from '../hooks/useAutobid'
import { APPROVAL_MODES, DECISION_MODES, mur } from '../lib/labels'
import type { AutobidOverview } from '../types'
import { RulesPanel } from '../components/RulesPanel'
import { SetupPanel } from '../components/SetupPanel'
import { ActivityPanel } from '../components/ActivityPanel'

type Tab = 'overview' | 'rules' | 'setup' | 'activity'

function Overview({ o, go }: { o: AutobidOverview; go: (t: Tab) => void }) {
  const { data: s } = useSummary()
  const pause = usePauseBank()
  const [confirm, setConfirm] = useState(false)
  const c = o.config
  const decision = DECISION_MODES.find((m) => m.key === c.decision_mode)
  const approval = APPROVAL_MODES.find((m) => m.key === c.approval_mode)
  return (
    <div className="space-y-5">
      <div className={`rounded-card border p-5 flex flex-wrap items-center gap-4 ${c.enabled
        ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-line'}`}>
        <div className="flex-1 min-w-[16rem]">
          <div className="text-[15px] font-bold text-ink">Autobid is {c.enabled ? 'on' : 'off'}</div>
          <div className="text-[13px] text-muted mt-1">
            {decision?.label} · {approval?.label}
            {c.decision_mode !== 'external' && ` · ${o.active_rules} active rule${o.active_rules === 1 ? '' : 's'}`}
          </div>
        </div>
        {c.enabled ? (
          <Btn variant="danger" icon={PauseOctagon} onClick={() => setConfirm(true)}>Stop autobid now</Btn>
        ) : (
          <Btn variant="secondary" onClick={() => go('setup')}>Set up and ask to switch on</Btn>
        )}
      </div>
      {o.pending_change && (
        <InlineAlert variant="warning">
          A setting change is waiting for approval.{' '}
          <button type="button" className="underline" onClick={() => go('setup')}>Review it</button>
        </InlineAlert>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Bids sent today" value={s?.today.bid_placed ?? 0} icon={Send} loading={!s} />
        <KpiCard label="Waiting for approval" value={s?.today.queued_for_approval ?? 0} icon={Clock} loading={!s} />
        <KpiCard label="Daily bid limit used" value={s ? `${s.bids_today} / ${s.max_bids_per_day}` : '—'} icon={Zap}
                 loading={!s} alert={!!s && s.bids_today >= s.max_bids_per_day} />
        <KpiCard label="Daily amount used" value={s ? mur(s.amount_today) : '—'}
                 sub={s ? `of ${mur(s.max_amount_per_day)}` : undefined} icon={Ban} loading={!s} />
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Stop autobid for the whole bank?"
                    description="It stops at once; nothing new is bid. Bids already sent stay. Switching back on needs a second person's approval."
                    confirmLabel="Stop now" variant="danger" isPending={pause.isPending}
                    onConfirm={async () => { await pause.mutateAsync(); setConfirm(false) }} />
    </div>
  )
}

export default function AutobidPage() {
  const { data, isLoading, error } = useAutobidOverview()
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <PageFrame className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-5">
      <SectionHeader title="Autobid"
                     subtitle="Bid automatically on requests that fit, with your rules or your own decision engine" />
      {isLoading && <SkeletonCard />}
      {error && <InlineAlert variant="error">Autobid could not be loaded. Please retry.</InlineAlert>}
      {data && !data.licensed && (
        <EmptyState icon={Zap} title="Autobid is not part of your plan"
                    description="Ask Ficium to add the Autobid module. Your rules and settings stay private to your bank." />
      )}
      {data?.licensed && (
        <>
          <SectionTabs<Tab> idPrefix="autobid" label="Autobid sections" active={tab} onChange={setTab}
                            tabs={[
                              { key: 'overview', label: 'Overview' },
                              { key: 'rules', label: 'Rules',
                                badge: data.data.config.decision_mode === 'external' ? undefined : String(data.data.active_rules) },
                              { key: 'setup', label: 'Setup', badge: data.data.pending_change ? '1 waiting' : undefined },
                              { key: 'activity', label: 'Activity' },
                            ]} />
          <div role="tabpanel" id={`autobid-panel-${tab}`} aria-labelledby={`autobid-tab-${tab}`}>
            {tab === 'overview' && <Overview o={data.data} go={setTab} />}
            {tab === 'rules' && <RulesPanel vocabulary={data.data.vocabulary} mayApprove={data.data.me.may_approve} />}
            {tab === 'setup' && <SetupPanel o={data.data} />}
            {tab === 'activity' && <ActivityPanel />}
          </div>
        </>
      )}
    </PageFrame>
  )
}
