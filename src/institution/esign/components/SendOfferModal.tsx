/**
 * @component SendOfferModal
 * @description
 *   One step from a deal: pick the offer template (pre-selected), the
 *   countersigner and the signing window, then send. The server generates the
 *   document from the approved template, re-checks the deal's credit approval,
 *   and sends it to the borrower identity the deal holds.
 *
 *   If anything blocks sending (no credit approval, no borrower identity yet,
 *   no approved template) the modal says exactly what, instead of a form that
 *   fails on submit.
 *
 * @dataSource useOfferReadiness → GET  /institution/deals/{id}/offer-readiness
 *             useSendOffer      → POST /institution/deals/{id}/send-offer
 */
import { useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import { useOfferReadiness, useSendOffer } from '@/institution/esign/hooks/useEsign'
import { useInstitutionUsers } from '@/institution/hooks/useInstitution'
import { PortalApiError } from '@/shared/lib/portalApi'
import { Modal, Btn, FormField, InlineAlert, SkeletonCard, inputCls } from '@/institution/components/primitives'

const WINDOWS: { hours: number; label: string }[] = [
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 336, label: '14 days' },
]

export function SendOfferModal({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { data: r, isLoading, isError } = useOfferReadiness(dealId)
  const { data: users } = useInstitutionUsers()
  const send = useSendOffer(dealId)

  const [templateId, setTemplateId] = useState<string | null>(null)
  const [signerId, setSignerId] = useState('')
  const [hours, setHours] = useState(72)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const chosenTemplate = templateId ?? r?.default_template_id ?? ''
  const signers = (users ?? []).filter(u => u.active !== false && !!u.email)
  const canSend = !!r?.ready && !!chosenTemplate && !!signerId && !send.isPending

  const submit = async () => {
    if (!canSend) return
    setError(null)
    try {
      await send.mutateAsync({
        template_id: chosenTemplate,
        countersigner_member_id: signerId,
        expires_hours: hours,
      })
      setSent(true)
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'The offer could not be sent. Please retry.')
    }
  }

  return (
    <Modal open onClose={onClose} title="Send offer for signature" width="max-w-lg">
      <div className="space-y-4">
        {isLoading && <SkeletonCard />}
        {isError && (
          <InlineAlert variant="error">Could not check this deal. Close and try again.</InlineAlert>
        )}

        {sent && r && (
          <>
            <InlineAlert variant="success">
              Sent to {r.borrower.name} ({r.borrower.email}). Your countersigner is notified
              and signs after the borrower.
            </InlineAlert>
            <div className="flex justify-end"><Btn onClick={onClose}>Done</Btn></div>
          </>
        )}

        {!sent && r && !r.ready && (
          <>
            <p className="text-[13px] text-ink">This offer can't be sent yet:</p>
            {r.blockers.map(b => <InlineAlert key={b} variant="warning">{b}</InlineAlert>)}
            <div className="flex justify-end"><Btn variant="secondary" onClick={onClose}>Close</Btn></div>
          </>
        )}

        {!sent && r?.ready && (
          <>
            {error && <InlineAlert variant="error">{error}</InlineAlert>}
            {r.already_sent > 0 && (
              <InlineAlert variant="info">
                This deal already has {r.already_sent} document(s) out for signature or signed.
              </InlineAlert>
            )}

            <div className="flex items-start gap-2 text-[12px] text-muted">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
              <span>
                Credit approved. Goes to <span className="text-ink font-semibold">{r.borrower.name}</span>{' '}
                ({r.borrower.email}).
              </span>
            </div>

            <FormField label="Offer document" required hint="Filled in from this deal when you send.">
              <select className={inputCls} value={chosenTemplate} onChange={e => setTemplateId(e.target.value)}>
                {r.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>

            <FormField label="Countersigner" required hint="Signs for your institution after the borrower.">
              <select className={inputCls} value={signerId} onChange={e => setSignerId(e.target.value)}>
                <option value="">Choose a team member…</option>
                {signers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Signing window">
              <select className={inputCls} value={hours} onChange={e => setHours(Number(e.target.value))}>
                {WINDOWS.map(w => <option key={w.hours} value={w.hours}>{w.label}</option>)}
              </select>
            </FormField>

            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
              <Btn icon={Send} loading={send.isPending} disabled={!canSend} onClick={() => void submit()}>
                Send offer
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
