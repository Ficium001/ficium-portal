/**
 * DealSignaturesPanel — e-signature envelopes raised against one deal.
 *
 * Envelopes are only raised from a deal and carry entity_id = pipeline id
 * (EnvelopeCreateModal's dealId), so the deal's envelopes are the
 * subset of the institution's list with that entity_id.
 *
 * Filtering is client-side: GET /esign/envelopes has no entity filter yet.
 * Fine at current volume; add ?entity_id= server-side before it isn't.
 */
import { useState } from 'react'
import { PenLine, Plus } from 'lucide-react'
import { useSealedUrl } from '@/institution/esign/hooks/useEsign'
import { useDealEnvelopes } from '@/institution/pipeline/hooks/useDealEnvelopes'
import { EnvelopeCard } from '@/institution/esign/components/EnvelopeCard'
import { EnvelopeCreateModal } from '@/institution/esign/components/EnvelopeCreateModal'
import { EnvelopeTimeline } from '@/institution/esign/components/EnvelopeTimeline'
import type { EsignEnvelope } from '@/institution/types/approvalEngine'
import { Btn, EmptyState, InlineAlert, SkeletonCard } from '@/institution/components/primitives'

export function DealSignaturesPanel({
  pipelineId,
  dealLabel,
  borrowerName,
  borrowerEmail,
}: {
  pipelineId: string
  dealLabel: string
  borrowerName?: string | null
  borrowerEmail?: string | null
}) {
  const { data, isLoading, isError } = useDealEnvelopes(pipelineId, true)
  const sealed = useSealedUrl()
  const [creating, setCreating] = useState(false)
  const [trailFor, setTrailFor] = useState<EsignEnvelope | null>(null)
  const [sealError, setSealError] = useState<string | null>(null)

  const openSealed = async (env: EsignEnvelope) => {
    setSealError(null)
    try {
      const { url } = await sealed.mutateAsync(env.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      setSealError('The sealed document is not available yet. Try again in a minute.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted">
          Documents sent to the borrower and your countersigner for this deal.
        </p>
        <Btn size="sm" icon={Plus} onClick={() => setCreating(true)}>Send for signature</Btn>
      </div>

      {sealError && <InlineAlert variant="error">{sealError}</InlineAlert>}
      {isError && <InlineAlert variant="error">Signatures could not be loaded. Refresh the page to try again.</InlineAlert>}

      {isLoading && <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <EmptyState
          icon={PenLine}
          title="Nothing sent for signature yet"
          description="Generate the offer letter under Documents, then send it for signature from there or here."
        />
      )}

      {data?.map(env => (
        <EnvelopeCard
          key={env.id}
          env={env}
          onShowTrail={setTrailFor}
          onOpenSealed={openSealed}
          sealedLoading={sealed.isPending}
        />
      ))}

      {creating && (
        <EnvelopeCreateModal
          onClose={() => setCreating(false)}
          dealId={pipelineId}
          presetTitle={dealLabel}
          presetBorrowerName={borrowerName}
          presetBorrowerEmail={borrowerEmail}
        />
      )}
      {trailFor && <EnvelopeTimeline envelope={trailFor} onClose={() => setTrailFor(null)} />}
    </div>
  )
}
