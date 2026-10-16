/**
 * @page InstitutionInbox
 * @route /inbox
 * @description
 *   Everything waiting on this user's decision, in one place. Replaces three
 *   separate queues; each tab is the existing screen, unchanged:
 *     Bids          — maker-checker on bid submit/withdraw   (inst:bid_approval)
 *     Credit        — approval-chain stages: committees, DoA  (inst:approvals)
 *     Team & setup  — four-eyes on users, keys, webhooks      (inst:dual_control)
 *   Old routes (/approvals, /approval-chains, /inst-dual-control) redirect here.
 */
import { lazy } from 'react'
import { HubPage, type HubSection } from '@/shared/components/HubPage'
import { useInboxCounts } from '@/institution/inbox/hooks/useInboxCounts'

const InstitutionApprovals   = lazy(() => import('@/institution/approvals/pages/InstitutionApprovals'))
const ApprovalChainsInbox    = lazy(() => import('@/institution/approval-chains/pages/ApprovalChainsInbox'))
const InstitutionDualControl = lazy(() => import('@/institution/dual-control/pages/InstitutionDualControl'))

type Section = 'bids' | 'credit' | 'internal'

const count = (n: number) => (n > 0 ? String(n) : undefined)

export default function InstitutionInbox() {
  const counts = useInboxCounts()

  const sections: HubSection<Section>[] = [
    { key: 'bids',     label: 'Bids',         moduleKey: 'inst:bid_approval',
      badge: count(counts.bids),     element: <InstitutionApprovals /> },
    { key: 'credit',   label: 'Credit',       moduleKey: 'inst:approvals',
      badge: count(counts.credit), element: <ApprovalChainsInbox /> },
    { key: 'internal', label: 'Team & setup', moduleKey: 'inst:dual_control',
      badge: count(counts.internal), element: <InstitutionDualControl /> },
  ]

  return (
    <HubPage
      title="Inbox"
      subtitle="Requests waiting for a second approver. You can't approve your own."
      idPrefix="inbox"
      sections={sections}
      emptyText="Your role has no approval queues. Ask your institution admin if you should be reviewing requests."
    />
  )
}
