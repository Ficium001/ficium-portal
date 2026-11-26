/** ActivityPanel — every autobid evaluation for this bank, newest first, with why. */
import { useState } from 'react'
import { DataRow, DataTable, EmptyState, FilterPills, SkeletonCard, StatusBadge, Td } from '@/institution/components/primitives'
import { useExecutions } from '../hooks/useAutobid'
import { OUTCOMES, mur } from '../lib/labels'
import type { Execution, Outcome } from '../types'

type Filter = 'all' | 'bid_placed' | 'queued_for_approval' | 'no_match' | 'engine_unavailable' | 'error'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bid_placed', label: 'Sent' },
  { key: 'queued_for_approval', label: 'Waiting' },
  { key: 'no_match', label: 'No match' },
  { key: 'engine_unavailable', label: 'Engine' },
  { key: 'error', label: 'Errors' },
]

function why(e: Execution): string {
  const d = e.detail
  if (e.outcome === 'bid_placed' || e.outcome === 'queued_for_approval')
    return `${d.rate_pct}% on ${mur(Number(d.amount ?? 0))} for ${d.term_months} months`
  if (d.reason) return String(d.reason)
  if (d.engine?.reason) return String(d.engine.reason)
  if (e.outcome === 'no_match') return `Checked ${String(d.rules_checked ?? 0)} active rule(s)`
  return ''
}

export function ActivityPanel() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading } = useExecutions(filter)
  return (
    <div className="space-y-4">
      <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
      {isLoading ? <SkeletonCard /> : !data?.length ? (
        <EmptyState title="Nothing yet" description="Each new request your bank can bid on shows up here with what autobid did and why." />
      ) : (
        <DataTable headers={['When', 'Request', 'Outcome', 'Rule', 'Detail']}>
          {data.map((e) => (
            <DataRow key={e.id}>
              <Td>{new Date(e.occurred_at).toLocaleString('en-MU', { dateStyle: 'medium', timeStyle: 'short' })}</Td>
              <Td><code className="text-[11px]">{e.loan_request_id.slice(0, 8)}</code></Td>
              <Td>
                <StatusBadge status={OUTCOMES[e.outcome as Outcome]?.tone ?? 'inactive'}
                             label={OUTCOMES[e.outcome as Outcome]?.label ?? e.outcome} />
              </Td>
              <Td>{e.rule_name ?? (e.detail.engine ? 'Your engine' : '—')}</Td>
              <Td className="text-[12px] text-muted">
                {why(e)}
                {e.detail.engine?.reference ? ` · ref ${e.detail.engine.reference}` : ''}
              </Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  )
}
