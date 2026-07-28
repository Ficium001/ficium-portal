/**
 * @page ApprovalChainsInbox
 * @route /approval-chains
 * @access protected — module inst:approvals
 * @description
 *   Approver's daily surface for the configurable approval engine:
 *   pending single/dual/committee/checklist stages, sorted by SLA
 *   urgency. Distinct from /approvals (the existing maker-checker
 *   queue) — this covers the newer institution-composed chains
 *   (committee quorum votes, multi-stage secured-lending flows, etc).
 *
 * @dataSource useApprovalInbox → ficium-portal-api /approval-engine/inbox
 * @owner Ficium Engineering
 */
import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { useApprovalInbox } from '@/institution/hooks/useApprovalEngine'
import type { ApprovalInboxItem } from '@/institution/types/approvalEngine'
import { SectionHeader, EmptyState, InlineAlert, SkeletonCard } from '@/institution/components/primitives'
import { DecisionDrawer } from '../components/DecisionDrawer'
import { SlaChip } from '../components/SlaChip'

function summarise(snapshot: Record<string, unknown>): string {
  const parts: string[] = []
  if (snapshot.amount != null) parts.push(`MUR ${Number(snapshot.amount).toLocaleString()}`)
  if (snapshot.product_type) parts.push(String(snapshot.product_type).replace(/_/g, ' '))
  if (snapshot.risk_tier) parts.push(`Tier ${snapshot.risk_tier}`)
  return parts.join(' · ') || 'View details'
}

export default function ApprovalChainsInbox() {
  const { data, isLoading, isError } = useApprovalInbox()
  const [selected, setSelected] = useState<ApprovalInboxItem | null>(null)

  return (
    <main className="p-6 lg:p-8 max-w-3xl mx-auto">
      <SectionHeader
        title="Approval chains"
        subtitle="Committee votes, secured-lending chains, and other multi-stage approvals awaiting your decision."
      />

      {isLoading && (
        <div className="space-y-3">
          <SkeletonCard /><SkeletonCard />
        </div>
      )}

      {isError && (
        <InlineAlert variant="error">Could not load your approvals. Please retry shortly.</InlineAlert>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <EmptyState icon={Inbox} title="Nothing waiting on you" description="You're all caught up." />
      )}

      <div className="space-y-3">
        {data?.map((item) => (
          <button
            key={item.stage_instance_id}
            onClick={() => setSelected(item)}
            className="w-full text-left bg-white rounded-xl border border-ink/[0.07] p-4 transition hover:border-ficium/40 hover:shadow-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  {item.entity_type.replace(/_/g, ' ')}
                </p>
                <p className="font-semibold text-ink text-[14px]">{item.stage_name}</p>
                <p className="mt-0.5 text-[13px] text-muted">{summarise(item.entity_snapshot)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <SlaChip startedAt={item.started_at} dueAt={item.due_at} />
                {item.stage_type === 'committee' && item.quorum_value != null && (
                  <span className="rounded-full bg-ficium/8 text-ficium px-2.5 py-1 text-[11px] font-semibold">
                    {item.approvals_in} of {item.quorum_value} votes
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && <DecisionDrawer item={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
