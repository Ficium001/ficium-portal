/** E-signature — envelopes sent to borrower and countersigner, sealed on completion. */
import type { ModuleManifest } from '@/app/registry/types'
import type { EsignEnvelope } from '@/institution/types/approvalEngine'
import { DealSignaturesPanel } from '@/institution/pipeline/components/DealSignaturesPanel'
import { useDealEnvelopes } from '@/institution/pipeline/hooks/useDealEnvelopes'
import { useEsignEnvelopes } from './hooks/useEsign'

const waiting = (e: EsignEnvelope) => e.status === 'sent' || e.status === 'partially_signed'

function useAwaitingSignature(enabled: boolean): number {
  const { data } = useEsignEnvelopes(enabled)
  return (data ?? []).filter(waiting).length
}

function useSignatureStep(deal: { id: string }, enabled: boolean) {
  const { data } = useDealEnvelopes(deal.id, enabled)
  const rows = data ?? []
  if (rows.some((e) => e.status === 'completed')) return { state: 'done' as const, detail: 'Signed' }
  const w = rows.filter(waiting).length
  if (w > 0) return { state: 'current' as const, detail: `${w} waiting` }
  return { state: 'todo' as const, detail: 'Not sent' }
}

function SignaturesBadge({ deal }: { deal: { id: string } }) {
  const { data } = useDealEnvelopes(deal.id)
  const n = (data ?? []).filter(waiting).length
  return n > 0 ? <>{n} waiting</> : null
}

export const esignModule: ModuleManifest = {
  id: 'esign',
  stage: 'fulfilment',
  flowSteps: [{
    key: 'signing', label: 'Awaiting signature', path: '/deals',
    moduleKeys: ['inst:esign'], order: 50, useCount: useAwaitingSignature,
  }],
  dealSteps: [{
    key: 'signature', label: 'Signature', moduleKey: 'inst:esign', order: 40, tab: 'signatures',
    useStep: useSignatureStep,
  }],
  dealTabs: [{
    key: 'signatures', label: 'Signatures', moduleKey: 'inst:esign', order: 30,
    render: (deal) => (
      <DealSignaturesPanel
        pipelineId={deal.id}
        dealLabel={`${deal.product_label} — ref ${deal.consumer_ref}`}
        borrowerName={deal.borrower_name}
        borrowerEmail={deal.borrower_email}
      />
    ),
    Badge: SignaturesBadge,
  }],
}
