/**
 * RulesPanel — the bank's autobid rules: create, edit (a new version), submit,
 * approve or reject (a different person), pause instantly, resume, retire.
 */
import { useState } from 'react'
import { Plus, Pause, Play, Send, Check, X, Archive, Pencil } from 'lucide-react'
import {
  Btn, ConfirmModal, DataRow, DataTable, EmptyState, InlineAlert, SkeletonCard, StatusBadge, Td,
} from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'
import { useRejectRule, useRule, useRules, useRuleStep, type RuleStep } from '../hooks/useAutobid'
import { RULE_TONE, STATUS_LABELS, mur } from '../lib/labels'
import type { RuleSummary, Vocabulary } from '../types'
import { RuleBuilder } from './RuleBuilder'

export function Steps({ r, mayApprove, onEdit, onError }: {
  r: RuleSummary; mayApprove: boolean; onEdit: () => void; onError: (m: string) => void
}) {
  const step = useRuleStep()
  const reject = useRejectRule()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const go = async (s: RuleStep) => {
    try { await step.mutateAsync({ id: r.id, step: s }) }
    catch (e) { onError(e instanceof PortalApiError ? e.message : 'That did not work. Please retry.') }
  }
  const busy = step.isPending
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {(r.status === 'draft' || r.status === 'rejected') && (
        <>
          <Btn size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>Edit</Btn>
          {r.status === 'draft' && <Btn size="sm" icon={Send} onClick={() => go('submit')} loading={busy}>Submit</Btn>}
        </>
      )}
      {r.status === 'pending_approval' && mayApprove && !r.mine && (
        <>
          <Btn size="sm" icon={Check} onClick={() => go('approve')} loading={busy}>Approve</Btn>
          <Btn size="sm" variant="secondary" icon={X} onClick={() => setRejecting(true)}>Reject</Btn>
        </>
      )}
      {r.status === 'pending_approval' && r.mine && <span className="text-[12px] text-muted">Waiting for someone else</span>}
      {r.status === 'active' && <Btn size="sm" variant="danger" icon={Pause} onClick={() => go('pause')} loading={busy}>Pause</Btn>}
      {r.status === 'paused' && (
        <>
          <Btn size="sm" icon={Play} onClick={() => go('resume')} loading={busy}>Resume</Btn>
          <Btn size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>New version</Btn>
        </>
      )}
      {r.status === 'active' && <Btn size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>New version</Btn>}
      {r.status !== 'retired' && r.status !== 'active' && r.status !== 'pending_approval' && (
        <Btn size="sm" variant="ghost" icon={Archive} onClick={() => go('retire')}>Retire</Btn>
      )}
      <ConfirmModal
        open={rejecting} onClose={() => setRejecting(false)} title={`Reject “${r.name}”`}
        description="The maker sees your note and can make a new version." confirmLabel="Reject"
        variant="danger" noteRequired note={note} onNoteChange={setNote} isPending={reject.isPending}
        onConfirm={async () => {
          try { await reject.mutateAsync({ id: r.id, note }); setRejecting(false); setNote('') }
          catch (e) { onError(e instanceof PortalApiError ? e.message : 'Could not reject.') }
        }}
      />
    </div>
  )
}

function EditRule({ id, vocabulary, onClose }: { id: string; vocabulary: Vocabulary; onClose: () => void }) {
  const { data } = useRule(id)
  if (!data) return null
  return <RuleBuilder vocabulary={vocabulary} existing={data} onClose={onClose} />
}

export function RulesPanel({ vocabulary, mayApprove }: { vocabulary: Vocabulary; mayApprove: boolean }) {
  const { data: rules, isLoading } = useRules()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted max-w-2xl">
          The first matching rule (lowest priority number) makes the bid. Every new rule and every change needs a
          second person to approve it. Pausing is instant.
        </p>
        <Btn icon={Plus} onClick={() => setCreating(true)}>New rule</Btn>
      </div>
      {error && <InlineAlert variant="error" onDismiss={() => setError(null)}>{error}</InlineAlert>}
      {isLoading ? <SkeletonCard /> : !rules?.length ? (
        <EmptyState title="No rules yet"
                    description="A rule says which requests to bid on and what to offer. Start with one product." />
      ) : (
        <DataTable headers={['Rule', 'Status', 'Offer', 'Daily limits', 'Approved by', '']}>
          {rules.map((r) => (
            <DataRow key={r.id}>
              <Td>
                <div className="font-semibold text-ink">{r.name}</div>
                <div className="text-[11px] text-muted">Priority {r.priority} · v{r.current_version_no ?? '—'}</div>
              </Td>
              <Td><StatusBadge status={RULE_TONE[r.status] ?? 'inactive'} label={STATUS_LABELS[r.status]} /></Td>
              <Td>{r.action ? `${r.action.rate_pct}% ${r.action.rate_type}` : '—'}</Td>
              <Td>{r.guardrails ? `${r.guardrails.max_bids_per_day} bids · ${mur(r.guardrails.max_amount_per_day)}` : '—'}</Td>
              <Td>{r.approved_by_name ?? '—'}</Td>
              <Td><Steps r={r} mayApprove={mayApprove} onEdit={() => setEditing(r.id)} onError={setError} /></Td>
            </DataRow>
          ))}
        </DataTable>
      )}
      {creating && <RuleBuilder vocabulary={vocabulary} onClose={() => setCreating(false)} />}
      {editing && <EditRule id={editing} vocabulary={vocabulary} onClose={() => setEditing(null)} />}
    </div>
  )
}
