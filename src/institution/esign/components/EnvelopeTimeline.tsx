/**
 * @component EnvelopeTimeline
 * @description
 *   Hash-chained event trail for one e-sign envelope, shown in a modal.
 *   The chain-integrity verdict comes from the backend, which walks
 *   prev_hash → hash across every event; a broken chain is surfaced
 *   loudly since it means the audit trail was altered.
 *
 * @dataSource useEnvelopeEvents → ficium-portal-api /esign/envelopes/:id/events
 * @owner Ficium Engineering
 */
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { useEnvelopeEvents } from '@/institution/esign/hooks/useEsign'
import type { EsignEnvelope } from '@/institution/types/approvalEngine'
import { Modal, InlineAlert, SkeletonRow, MonoRef } from '@/institution/components/primitives'

const EVENT_LABELS: Record<string, string> = {
  created:      'Envelope created',
  sent:         'Sent to signers',
  viewed:       'Document viewed',
  otp_sent:     'Verification code sent',
  otp_verified: 'Identity verified',
  otp_failed:   'Verification code rejected',
  signed:       'Signed',
  declined:     'Declined',
  completed:    'All parties signed',
  sealed:       'Sealed with certificate',
}

export function EnvelopeTimeline({
  envelope,
  onClose,
}: {
  envelope: EsignEnvelope
  onClose: () => void
}) {
  const { data, isLoading, isError } = useEnvelopeEvents(envelope.id)

  return (
    <Modal open onClose={onClose} title={`Audit trail — ${envelope.title}`} width="max-w-xl">
      {isLoading && (
        <table className="w-full"><tbody><SkeletonRow cols={3} /><SkeletonRow cols={3} /></tbody></table>
      )}

      {isError && (
        <InlineAlert variant="error">Could not load the audit trail. Please retry shortly.</InlineAlert>
      )}

      {data && (
        <>
          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 mb-4 text-[12px] font-semibold ${
              data.chain_intact
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {data.chain_intact
              ? <><ShieldCheck className="w-4 h-4" aria-hidden /> Hash chain intact — every event links to the one before it.</>
              : <><ShieldAlert className="w-4 h-4" aria-hidden /> Hash chain broken — this trail may have been altered. Escalate to compliance.</>}
          </div>

          <ol className="relative border-l border-line ml-2 space-y-4">
            {data.events.map((e, i) => (
              <li key={`${e.hash}-${i}`} className="ml-4">
                <span
                  className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-ficium"
                  aria-hidden
                />
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink">
                    {EVENT_LABELS[e.event] ?? e.event.replace(/_/g, ' ')}
                  </p>
                  <time className="text-[11px] text-muted whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </time>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <MonoRef value={e.hash} />
                  {e.ip && <span className="text-[11px] text-muted">from {e.ip}</span>}
                </div>
              </li>
            ))}
          </ol>

          {data.events.length === 0 && (
            <p className="text-[12px] text-muted">No events recorded yet.</p>
          )}
        </>
      )}
    </Modal>
  )
}
