/** Inbox queue: autobid rules and setting changes waiting for this person's approval. */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DataRow, DataTable, EmptyState, InlineAlert, SkeletonCard, Td } from '@/institution/components/primitives'
import { useAutobidOverview, useRules } from '../hooks/useAutobid'
import { mur } from '../lib/labels'
import { Steps } from './RulesPanel'
import { PendingChange } from './SetupPanel'

export function AutobidInbox() {
  const overview = useAutobidOverview()
  const licensed = overview.data?.licensed === true
  const rules = useRules(licensed)
  const [error, setError] = useState<string | null>(null)
  if (overview.isLoading) return <SkeletonCard />
  if (!overview.data || overview.data.licensed !== true) return null
  const o = overview.data.data
  const waiting = (rules.data ?? []).filter((r) => r.status === 'pending_approval')
  if (!waiting.length && !o.pending_change) {
    return <EmptyState title="Nothing to approve" description="Autobid rules and setting changes waiting for a second person show up here." />
  }
  return (
    <div className="space-y-4">
      {error && <InlineAlert variant="error" onDismiss={() => setError(null)}>{error}</InlineAlert>}
      {o.pending_change && <PendingChange o={o} />}
      {waiting.length > 0 && (
        <DataTable headers={['Rule', 'Asked by', 'Offer', 'Daily limits', '']}>
          {waiting.map((r) => (
            <DataRow key={r.id}>
              <Td><Link to="/autobid" className="font-semibold text-ink hover:text-ficium">{r.name}</Link>
                <div className="text-[11px] text-muted">v{r.current_version_no} · priority {r.priority}</div></Td>
              <Td>{r.submitted_by_name ?? '—'}</Td>
              <Td>{r.action ? `${r.action.rate_pct}% ${r.action.rate_type}` : '—'}</Td>
              <Td>{r.guardrails ? `${r.guardrails.max_bids_per_day} bids · ${mur(r.guardrails.max_amount_per_day)}` : '—'}</Td>
              <Td><Steps r={r} mayApprove={o.me.may_approve} onEdit={() => undefined} onError={setError} /></Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  )
}
