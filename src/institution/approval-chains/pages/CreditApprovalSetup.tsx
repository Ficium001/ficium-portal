/**
 * Setup › Credit approval — who approves what: approval chains (single,
 * dual, committee, checklist), the delegation-of-authority rules that route
 * a facility or a bid to a chain by amount and product, committees and
 * delegations. (Was Settings › Approval chains.)
 */
import { PageFrame } from '@/shared/components/PageFrame'
import { SectionHeader } from '@/institution/components/primitives'
import { ApprovalChainsTab } from '@/institution/settings/components/ApprovalChainsTab'
import { useIsInstitutionAdmin } from '@/institution/settings/hooks/useIsInstitutionAdmin'

export default function CreditApprovalSetup() {
  const isAdmin = useIsInstitutionAdmin()
  return (
    <PageFrame className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <SectionHeader
        title="Credit approval"
        subtitle="Approval limits: which chain decides a facility or bid, by amount and product."
      />
      <ApprovalChainsTab isAdmin={isAdmin} />
    </PageFrame>
  )
}
