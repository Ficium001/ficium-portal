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
import { PenLine, Plus, History, FileDown, CheckCircle2, Circle } from 'lucide-react'
import { useEsignEnvelopes, useSealedUrl } from '@/institution/esign/hooks/useEsign'
import type { EsignEnvelope } from '@/institution/types/approvalEngine'
import {
  SectionHeader, EmptyState, InlineAlert, SkeletonCard, Btn, StatusBadge, FilterPills,
} from '@/institution/components/primitives'
import { EnvelopeCreateModal } from '../components/EnvelopeCreateModal'
import { EnvelopeTimeline } from '../components/EnvelopeTimeline'

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

function SignerDots({ env }: { env: EsignEnvelope }) {
  return (
    <div className="flex items-center gap-3">
      {env.signers.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          {s.status === 'signed'
            ? <CheckCircle2 className="w-3.5 h-3.5 text-good" aria-hidden />
            : <Circle className="w-3.5 h-3.5 text-line" aria-hidden />}
          {s.display_name}
          <span className="uppercase tracking-wide text-[9px] text-muted/70">{s.party}</span>
        </span>
      ))}
    </div>
  )
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
          <div
            key={env.id}
            className="bg-white border border-line rounded-card shadow-card px-5 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-ink truncate">{env.title}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {env.entity_type.replace(/_/g, ' ')}
                  {' · '}
                  {env.status === 'completed' && env.completed_at
                    ? `completed ${new Date(env.completed_at).toLocaleDateString()}`
                    : `expires ${new Date(env.expires_at).toLocaleString()}`}
                </p>
              </div>
              <StatusBadge status={env.status} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <SignerDots env={env} />
              <div className="flex items-center gap-2">
                <Btn size="sm" variant="ghost" icon={History} onClick={() => setTrailFor(env)}>
                  Audit trail
                </Btn>
                {env.status === 'completed' && (
                  <Btn size="sm" variant="secondary" icon={FileDown}
                       loading={sealed.isPending} onClick={() => openSealed(env)}>
                    Sealed PDF
                  </Btn>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {creating && <EnvelopeCreateModal onClose={() => setCreating(false)} />}
      {trailFor && <EnvelopeTimeline envelope={trailFor} onClose={() => setTrailFor(null)} />}
    </main>
  )
}
