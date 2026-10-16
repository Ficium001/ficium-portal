/**
 * @page EsignEnvelopes
 * @route /esign
 * @access protected — module inst:esign
 * @description
 *   Envelope tracking surface for the e-signature module: create
 *   envelopes (borrower signs first, institution countersigns), watch
 *   signing progress, open the hash-chained audit trail, and download
 *   the sealed PDF once completed. Signing itself happens on the
 *   public /sign/:token ceremony reached from the signer's email.
 *
 * @dataSource useEsignEnvelopes → ficium-portal-api /esign/envelopes
 * @owner Ficium Engineering
 */
import { useState } from 'react'
import { PenLine, Plus } from 'lucide-react'
import { useEsignEnvelopes, useSealedUrl } from '@/institution/esign/hooks/useEsign'
import type { EsignEnvelope } from '@/institution/types/approvalEngine'
import {
  SectionHeader, EmptyState, InlineAlert, SkeletonCard, Btn, FilterPills,
} from '@/institution/components/primitives'
import { EnvelopeCreateModal } from '../components/EnvelopeCreateModal'
import { EnvelopeTimeline } from '../components/EnvelopeTimeline'
import { EnvelopeCard } from '../components/EnvelopeCard'

type Filter = 'all' | 'in_progress' | 'completed' | 'closed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed',   label: 'Completed' },
  { key: 'closed',      label: 'Declined / expired' },
]

function matches(env: EsignEnvelope, f: Filter): boolean {
  if (f === 'all') return true
  if (f === 'in_progress') return env.status === 'sent' || env.status === 'partially_signed' || env.status === 'draft'
  if (f === 'completed') return env.status === 'completed'
  return env.status === 'declined' || env.status === 'expired' || env.status === 'voided'
}

export default function EsignEnvelopes() {
  const { data, isLoading, isError } = useEsignEnvelopes()
  const sealed = useSealedUrl()
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [trailFor, setTrailFor] = useState<EsignEnvelope | null>(null)
  const [sealError, setSealError] = useState<string | null>(null)

  const openSealed = async (env: EsignEnvelope) => {
    setSealError(null)
    try {
      const { url } = await sealed.mutateAsync(env.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      setSealError('The sealed document is not available yet. Please retry shortly.')
    }
  }

  const visible = data?.filter(e => matches(e, filter)) ?? []

  return (
    <main className="p-6 lg:p-8 max-w-3xl mx-auto">
      <SectionHeader
        title="E-signatures"
        subtitle="Send documents for signature, track progress, and download sealed originals with their audit certificate."
      />

      <div className="flex items-center justify-between mb-4">
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
        <Btn icon={Plus} onClick={() => setCreating(true)}>New envelope</Btn>
      </div>

      {sealError && <InlineAlert variant="error">{sealError}</InlineAlert>}

      {isLoading && (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      )}

      {isError && (
        <InlineAlert variant="error">Could not load envelopes. Please retry shortly.</InlineAlert>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <EmptyState
          icon={PenLine}
          title={filter === 'all' ? 'No envelopes yet' : 'Nothing here'}
          description={filter === 'all'
            ? 'Create an envelope to send an offer letter or mandate for signature.'
            : 'No envelopes match this filter.'}
        />
      )}

      <div className="space-y-3">
        {visible.map(env => (
          <EnvelopeCard
            key={env.id}
            env={env}
            onShowTrail={setTrailFor}
            onOpenSealed={openSealed}
            sealedLoading={sealed.isPending}
          />
        ))}
      </div>

      {creating && <EnvelopeCreateModal onClose={() => setCreating(false)} />}
      {trailFor && <EnvelopeTimeline envelope={trailFor} onClose={() => setTrailFor(null)} />}
    </main>
  )
}
