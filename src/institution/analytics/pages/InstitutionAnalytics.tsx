/**
 * @page InstitutionAnalytics
 * @route /analytics
 * @module inst:analytics
 * @description
 *   Institution performance analytics. Computed client-side from the
 *   existing /marketplace/my-bids endpoint — zero extra serverless functions.
 *
 *   Sections:
 *     1. KPI summary strip (total bids, win rate, deal value, avg rate)
 *     2. Bid trend line chart (7d / 30d / 90d selector)
 *     3. By-product breakdown table (win rate, avg rate, deal value)
 *     4. Competitiveness panel (my win rate vs market avg per product)
 *
 *   Module-gated: inst:analytics — enable/disable per institution in modules[].
 *
 * @owner Ficium Engineering
 */

import { useMemo } from 'react'
import {
  BarChart2, TrendingUp, TrendingDown, Award, Zap,
  Target, DollarSign,
} from 'lucide-react'
import { useAnalytics, usePeriodSelector } from '../hooks/useAnalytics'
import {
  SectionHeader, KpiCard, FilterPills, DataTable, DataRow, Td,
  EmptyState, SkeletonCard, InlineAlert,
} from '@/institution/components/primitives'
import {
  Panel, PanelHead, SkeletonBlock,
} from '@/shared/ui/dashboard'
import LineChart from '@/shared/ui/dashboard/LineChart'
import type { ChartPoint } from '@/shared/ui/dashboard/LineChart'

// ─── Helpers ──────────────────────────────────────────────────

function fmtMUR(v: number): string {
  if (v >= 1_000_000) return `MUR ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `MUR ${Math.round(v / 1_000)}K`
  return `MUR ${v.toLocaleString()}`
}

function WinRateBadge({ pct }: { pct: number }) {
  const tone = pct >= 60 ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
    : pct >= 30 ? 'text-amber-600 bg-amber-50 border-amber-100'
    : 'text-red-500 bg-red-50 border-red-100'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${tone}`}>
      {pct >= 30 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pct}%
    </span>
  )
}

// ─── KPI Strip ────────────────────────────────────────────────

function KpiStrip({ summary, isLoading }: {
  summary: ReturnType<typeof useAnalytics>['data']
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!summary) return null

  const s = summary.summary
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KpiCard label="Total bids"   value={s.total_bids}                   icon={BarChart2} />
      <KpiCard label="Win rate"     value={`${s.win_rate_pct}%`}           icon={Award} />
      <KpiCard label="Deal value"   value={fmtMUR(s.total_deal_value_mur)} icon={DollarSign} />
      <KpiCard label="Avg rate"     value={`${s.avg_rate_offered_pct}%`}   icon={Target} />
    </div>
  )
}

// ─── Bid Trend Chart ──────────────────────────────────────────

function BidTrendPanel({ analytics, isLoading, days, setDays, periodOptions }: {
  analytics: ReturnType<typeof useAnalytics>['data']
  isLoading: boolean
  days: number
  setDays: (d: number) => void
  periodOptions: { label: string; value: number }[]
}) {
  const chartData: ChartPoint[] = useMemo(() => {
    if (!analytics?.bid_trend) return []
    // Show every Nth label for readability
    const skip = days <= 7 ? 1 : days <= 30 ? 3 : 7
    return analytics.bid_trend
      .filter((_, i) => i % skip === 0 || i === analytics.bid_trend.length - 1)
      .map(p => ({ label: p.date, value: p.bids }))
  }, [analytics, days])

  const weekAccepted = analytics?.bid_trend.reduce((s, p) => s + p.accepted, 0) ?? 0
  const weekTotal = analytics?.bid_trend.reduce((s, p) => s + p.bids, 0) ?? 0

  return (
    <Panel className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <PanelHead
          title="Bid activity"
          subtitle={
            isLoading ? undefined : (
              <span>
                <b className="text-ink text-[22px] font-display tracking-display">{weekTotal}</b>
                <span className="ml-2 text-emerald-600 font-semibold">{weekAccepted} accepted this period</span>
              </span>
            )
          }
        />
        <FilterPills
          options={periodOptions.map(o => ({ key: String(o.value), label: o.label }))}
          value={String(days)}
          onChange={v => setDays(Number(v))}
        />
      </div>
      {isLoading
        ? <SkeletonBlock className="h-52 mt-5" />
        : chartData.length > 0
        ? <LineChart data={chartData} unit="bids" ariaLabel="Bids submitted over time" />
        : <p className="text-[13px] text-muted text-center py-10">No bid data for this period.</p>
      }
    </Panel>
  )
}

// ─── By-product table ─────────────────────────────────────────

function ByProductTable({ analytics, isLoading }: {
  analytics: ReturnType<typeof useAnalytics>['data']
  isLoading: boolean
}) {
  if (isLoading) return <SkeletonBlock className="h-48 mb-4" />
  if (!analytics?.by_product?.length) {
    return (
      <EmptyState
        icon={BarChart2}
        title="No product breakdown yet"
        description="Submit bids to see performance by product"
      />
    )
  }

  return (
    <Panel className="mb-4">
      <PanelHead title="Performance by product" subtitle="Win rate, avg rate, and deal value per product" />
      <div className="mt-4 overflow-x-auto">
        <DataTable
          headers={['Product', 'Bids', 'Accepted', 'Win rate', 'Avg rate', 'Deal value']}
          caption="Institution performance by product"
        >
          {analytics.by_product.map(p => (
            <DataRow key={p.product_type} onClick={() => {}}>
              <Td>
                <div className="font-semibold text-[13px] capitalize">
                  {p.product_label}
                </div>
              </Td>
              <Td className="text-muted">{p.total_bids}</Td>
              <Td className="text-muted">{p.accepted}</Td>
              <Td><WinRateBadge pct={p.win_rate_pct} /></Td>
              <Td className="font-bold text-ficium">{p.avg_rate_pct}%</Td>
              <Td className="font-semibold text-ink">{fmtMUR(p.total_value_mur)}</Td>
            </DataRow>
          ))}
        </DataTable>
      </div>
    </Panel>
  )
}

// ─── Competitiveness panel ────────────────────────────────────

function CompetitivenessPanel({ analytics, isLoading }: {
  analytics: ReturnType<typeof useAnalytics>['data']
  isLoading: boolean
}) {
  if (isLoading) return <SkeletonBlock className="h-32 mb-4" />
  if (!analytics?.competitiveness?.length) return null

  return (
    <Panel>
      <PanelHead
        title="Market competitiveness"
        subtitle="Your win rate vs market average per product"
      />
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {analytics.competitiveness.map(c => {
          const ahead = c.my_win_rate_pct >= c.market_win_rate_pct
          return (
            <div key={c.product_type} className="bg-cream rounded-xl p-4">
              <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 capitalize">
                {c.product_type.replace(/_/g, ' ')}
              </div>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="text-[10px] text-muted">Your win rate</div>
                  <div className={`text-[22px] font-extrabold leading-none ${ahead ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {c.my_win_rate_pct}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted">Market avg</div>
                  <div className="text-[16px] font-bold text-ink/60">{c.market_win_rate_pct}%</div>
                </div>
              </div>
              {/* Bar */}
              <div className="relative h-2 bg-ink/[0.08] rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(c.my_win_rate_pct, 100)}%`,
                    background: ahead ? '#10b981' : '#f59e0b',
                  }}
                />
                {/* Market avg marker */}
                <div
                  className="absolute top-0 w-0.5 h-full bg-ink/30"
                  style={{ left: `${Math.min(c.market_win_rate_pct, 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold">
                {ahead
                  ? <><TrendingUp className="w-3 h-3 text-emerald-600" /><span className="text-emerald-600">+{c.my_win_rate_pct - c.market_win_rate_pct}pp ahead of market</span></>
                  : <><TrendingDown className="w-3 h-3 text-amber-600" /><span className="text-amber-600">{c.market_win_rate_pct - c.my_win_rate_pct}pp behind market</span></>
                }
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function InstitutionAnalytics() {
  const { days, setDays, options: periodOptions } = usePeriodSelector(30)
  const { data: analytics, isLoading, error } = useAnalytics(days)

  return (
    <main className="p-6 lg:p-8 max-w-[1440px] mx-auto">
      <SectionHeader
        title="Analytics"
        subtitle="Your institution's performance on the Ficium marketplace"
        badge={
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-ficium" />
            <span className="text-[11px] font-semibold text-ficium">Live</span>
          </div>
        }
      />

      {error && (
        <div className="mb-5">
          <InlineAlert variant="warning">
            Could not load analytics data. Check your connection and try again.
          </InlineAlert>
        </div>
      )}

      <KpiStrip summary={analytics} isLoading={isLoading} />

      <BidTrendPanel
        analytics={analytics}
        isLoading={isLoading}
        days={days}
        setDays={setDays}
        periodOptions={periodOptions}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <ByProductTable analytics={analytics} isLoading={isLoading} />
        </div>
        <div>
          <CompetitivenessPanel analytics={analytics} isLoading={isLoading} />
        </div>
      </div>

      {!isLoading && analytics?.summary.total_bids === 0 && (
        <EmptyState
          icon={BarChart2}
          title="No analytics yet"
          description={`No bids submitted in the last ${days} days. Start bidding on marketplace requests to see performance data.`}
        />
      )}
    </main>
  )
}
