import { useState } from 'react'
import { useCastApprovalVote } from '@/institution/hooks/useApprovalEngine'
import type { ApprovalInboxItem, VoteAction } from '@/institution/types/approvalEngine'
import { Modal, Btn, InlineAlert } from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'

/**
 * @component DecisionDrawer
 * @description
 *   One screen, one decision: the entity snapshot frozen at routing time,
 *   an optional comment (required for reject/recuse — enforced by the
 *   engine, not just this form), then Approve / Reject / Abstain.
 */
export function DecisionDrawer({
  item, onClose,
}: { item: ApprovalInboxItem; onClose: () => void }) {
  const cast = useCastApprovalVote(item.instance_id)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rows = Object.entries(item.entity_snapshot ?? {})
    .filter(([, v]) => v !== null && typeof v !== 'object')

  async function vote(action: VoteAction) {
    setError(null)
    if (action === 'reject' && comment.trim().length === 0) {
      setError('A comment is required to reject.')
      return
    }
    try {
      await cast.mutateAsync({
        stage_instance_id: item.stage_instance_id,
        action,
        comment: comment.trim() || undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'Action failed. Please retry.')
    }
  }

  return (
    <Modal open onClose={onClose} title={item.stage_name} width="max-w-md">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink/4 px-2 py-0.5 text-[11px] text-muted uppercase tracking-wide">
            {item.entity_type.replace(/_/g, ' ')}
          </span>
          {item.stage_type === 'committee' && item.quorum_value != null && (
            <span className="rounded-full bg-ficium/8 text-ficium px-2 py-0.5 text-[11px] font-semibold">
              {item.approvals_in} of {item.quorum_value} votes
            </span>
          )}
        </div>

        <div>
          <p className="mb-2 text-[12px] font-semibold text-muted">
            What you're approving (frozen at routing)
          </p>
          <dl className="divide-y divide-ink/[0.06] rounded-lg border border-ink/[0.07]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-3 py-2 text-[13px]">
                <dt className="capitalize text-muted">{k.replace(/_/g, ' ')}</dt>
                <dd className="font-medium text-ink">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>

        {item.my_vote ? (
          <InlineAlert variant="info">
            You already voted: <strong>{item.my_vote}</strong>.
          </InlineAlert>
        ) : (
          <>
            <div>
              <label htmlFor="vote-comment" className="block text-[12px] font-semibold text-ink mb-1.5">
                Comment (required for reject)
              </label>
              <textarea
                id="vote-comment"
                rows={3}
                className="w-full rounded-xl border border-ink/12 px-4 py-2.5 text-[13px] text-ink outline-hidden focus:border-ficium focus:ring-2 focus:ring-ficium/20"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Rationale, conditions, references…"
              />
            </div>
            {error && <InlineAlert variant="error">{error}</InlineAlert>}
            <div className="grid grid-cols-3 gap-2">
              <Btn variant="danger" loading={cast.isPending} onClick={() => vote('reject')}>Reject</Btn>
              <Btn variant="secondary" loading={cast.isPending} onClick={() => vote('abstain')}>Abstain</Btn>
              <Btn loading={cast.isPending} onClick={() => vote('approve')}>Approve</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
