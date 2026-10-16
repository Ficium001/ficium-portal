/**
 * @page InstitutionInbox
 * @route /inbox
 * @description
 *   Pending authorisation: every maker-checker queue in one place. Queues are
 *   contributed by modules (manifest.inboxQueues); this page only lays them
 *   out. A queue shows if the user holds its module key.
 */
import { HubPage, type HubSection } from '@/shared/components/HubPage'
import { INBOX_QUEUES } from '@/app/registry/select'
import { useInboxCounts } from '@/app/registry/hooks'

export default function InstitutionInbox() {
  const counts = useInboxCounts()
  const sections: HubSection<string>[] = INBOX_QUEUES.map((q) => ({
    key: q.key, label: q.label, moduleKey: q.moduleKey, element: q.element,
    badge: counts[q.key] ? String(counts[q.key]) : undefined,
  }))

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
