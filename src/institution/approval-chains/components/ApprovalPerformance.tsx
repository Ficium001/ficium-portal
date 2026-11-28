/**
 * How the bank's approval chains perform: median time per stage, SLA breaches,
 * and deals lost while waiting in committee (the borrower's window closed first).
 * GET /approval-engine/analytics (inst:approvals or institution admin).
 */
import { useQuery } from '@tanstack/react-query'
import { Timer, AlertTriangle, TrendingDown } from 'lucide-react'
import { DataRow, DataTable, KpiCard, SkeletonCard, Td } from '@/institution/components/primitives'
import { portalApi, PortalApiError } from '@/shared/lib/portalApi'

interface StageCycle { template: string; stage: string; median_hours: number | null; sla_breaches: number; total: number }
export interface ApprovalAnalytics {
  stage_cycle_times: StageCycle[]
  lost_in_committee: { deals_lost?: number; amount_lost?: number | string }
}

export const hours = (h: number | null) =>
  h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`

export function ApprovalPerformance() {
  const { data, isLoading, error } = useQuery<ApprovalAnalytics | null>({
    queryKey: ['approval-engine', 'analytics'],
    queryFn: async () => {
      try { return await portalApi.get<ApprovalAnalytics>('/approval-engine/analytics') }
      catch (e) { if (e instanceof PortalApiError && e.status === 403) return null; throw e }
    },
    staleTime: 5 * 60_000,
  })
  if (isLoading) return <SkeletonCard />
  if (error || data === null || data === undefined) return null

  const rows = data.stage_cycle_times
  const decided = rows.reduce((n, r) => n + Number(r.total), 0)
  const breaches = rows.reduce((n, r) => n + Number(r.sla_breaches), 0)
  const lost = Number(data.lost_in_committee.deals_lost ?? 0)
  const lostAmount = Number(data.lost_in_committee.amount_lost ?? 0)
  const slowest = rows.find((r) => r.median_hours != null)

  return (
    <section aria-label="How your approvals perform" className="space-y-4 mb-8">
      <h2 className="text-[15px] font-bold text-ink">How your approvals perform</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Slowest stage (median)" value={slowest ? hours(slowest.median_hours) : '—'}
                 sub={slowest ? `${slowest.template} · ${slowest.stage}` : 'No decisions yet'} icon={Timer} />
        <KpiCard label="Stage deadlines missed" value={breaches} sub={`of ${decided} stage decisions`}
                 icon={AlertTriangle} alert={breaches > 0} />
        <KpiCard label="Deals lost waiting for approval" value={lost}
                 sub={lost ? `MUR ${Math.round(lostAmount).toLocaleString('en-MU')}` : 'The borrower’s window closed first'}
                 icon={TrendingDown} alert={lost > 0} />
      </div>
      {rows.length > 0 && (
        <DataTable headers={['Chain', 'Stage', 'Median time', 'Deadlines missed', 'Decisions']}>
          {rows.map((r) => (
            <DataRow key={`${r.template}-${r.stage}`}>
              <Td>{r.template}</Td>
              <Td>{r.stage}</Td>
              <Td>{hours(r.median_hours)}</Td>
              <Td className={Number(r.sla_breaches) > 0 ? 'text-red-600 font-semibold' : ''}>{r.sla_breaches}</Td>
              <Td>{r.total}</Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </section>
  )
}
