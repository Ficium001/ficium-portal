/**
 * BookingPanel — the deal's hand-off to the bank's core banking system.
 *
 * Processing incomplete → explains what must happen first.
 * Not booked            → form: core reference, booking date, disbursed amount.
 * Booked                → the record, with "Correct" (audited, keeps old values) and
 *                         "Record closure" when the account ends (plan stopped, deposit closed,
 *                         loan cancelled). A closed booking can't be corrected.
 *
 * Some products need more than the amount: a regular plan needs the monthly amount the
 * client committed to, a term product its term. The server says which
 * (GET /pipelines/{id}/booking/requirements) and the form asks for them.
 *
 * The bank's own system can post the same record through
 * POST /v1/pipeline/{id}/booking; either way it shows up here.
 */
import { useState } from 'react'
import { Landmark, Pencil, CircleSlash } from 'lucide-react'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'
import { Btn, FormField, InlineAlert, SkeletonCard, inputCls } from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'
import { formatMUR } from '@/shared/lib/format'
import { useBooking, useBookingRequirements, useCloseBooking, useSaveBooking } from '../hooks/useBooking'
import type { Booking } from '../types'

const today = () => {
  // Mauritius date, matching the server's "not in the future" rule.
  const d = new Date(Date.now() + 4 * 3_600_000)
  return d.toISOString().slice(0, 10)
}
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function BookingForm({
  deal, existing, onDone,
}: {
  deal:     PipelineDetail
  existing: Booking | null
  onDone:   () => void
}) {
  const save = useSaveBooking(deal.id, existing != null)
  const { data: needs } = useBookingRequirements(deal.id)
  const askMonthly = !!needs?.monthly_amount || existing?.monthly_amount != null
  const askTerm    = !!needs?.term_months || existing?.term_months != null
  const [ref, setRef]           = useState(existing?.core_reference ?? '')
  const [bookedOn, setBookedOn] = useState(existing?.booked_on ?? today())
  const [amount, setAmount]     = useState(String(existing?.disbursed_amount ?? deal.deal_amount ?? ''))
  const [disbOn, setDisbOn]     = useState(existing?.disbursed_on ?? '')
  const [monthly, setMonthly]   = useState(existing?.monthly_amount != null ? String(existing.monthly_amount) : '')
  const [term, setTerm]         = useState(String(existing?.term_months ?? deal.deal_term_months ?? ''))
  const [notes, setNotes]       = useState(existing?.notes ?? '')
  const [error, setError]       = useState<string | null>(null)

  const amountNum = Number(amount)
  const monthlyNum = Number(monthly)
  const termNum = Number(term)
  const monthlyOk = !askMonthly || (monthly.trim() !== '' && Number.isFinite(monthlyNum) && monthlyNum >= 0)
  const termOk = !askTerm || (Number.isInteger(termNum) && termNum >= 1 && termNum <= 600)
  const valid = ref.trim() !== '' && ref.trim().length <= 64 && bookedOn !== ''
    && Number.isFinite(amountNum) && amountNum > 0 && monthlyOk && termOk
  const minDate = deal.started_at.slice(0, 10)

  const submit = async () => {
    if (!valid) return
    setError(null)
    try {
      await save.mutateAsync({
        core_reference:   ref.trim(),
        booked_on:        bookedOn,
        disbursed_amount: amountNum,
        disbursed_on:     disbOn || null,
        monthly_amount:   askMonthly ? monthlyNum : null,
        term_months:      askTerm ? termNum : null,
        notes:            notes.trim() || null,
      })
      onDone()
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'The booking could not be saved. Please retry.')
    }
  }

  return (
    <div className="bg-white border border-line rounded-card shadow-card p-5 space-y-4">
      {existing && (
        <InlineAlert variant="info">
          Correcting a booking keeps the previous values in the audit trail.
        </InlineAlert>
      )}
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <FormField label="Core banking reference" required hint="Loan account or contract number in your core system.">
        <input className={inputCls} aria-label="Core banking reference" value={ref} maxLength={64}
               onChange={(e) => setRef(e.target.value)} placeholder="e.g. LN-2026-004512" />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Booked on" required>
          <input type="date" className={inputCls} aria-label="Booked on" value={bookedOn}
                 min={minDate} max={today()} onChange={(e) => setBookedOn(e.target.value)} />
        </FormField>
        <FormField label={askMonthly ? 'First amount paid in (MUR)' : 'Disbursed amount (MUR)'} required
                   hint={deal.deal_amount ? `Accepted amount ${formatMUR(deal.deal_amount)}` : undefined}>
          <input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls}
                 aria-label="Disbursed amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Disbursed on" hint="Leave empty if not disbursed yet.">
          <input type="date" className={inputCls} aria-label="Disbursed on" value={disbOn}
                 min={minDate} max={today()} onChange={(e) => setDisbOn(e.target.value)} />
        </FormField>
        {askMonthly && (
          <FormField label="Monthly amount committed (MUR)" required
                     hint="The regular contribution the client signed up for. 0 if none.">
            <input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls}
                   aria-label="Monthly amount" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </FormField>
        )}
        {askTerm && (
          <FormField label="Term (months)" required
                     hint={deal.deal_term_months ? `Accepted term ${deal.deal_term_months} months` : undefined}>
            <input type="number" inputMode="numeric" min={1} max={600} step={1} className={inputCls}
                   aria-label="Term in months" value={term} onChange={(e) => setTerm(e.target.value)} />
          </FormField>
        )}
      </div>

      <FormField label="Notes">
        <textarea className={inputCls} aria-label="Notes" rows={2} maxLength={1000} value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
      </FormField>

      <div className="flex items-center justify-end gap-2">
        {existing && <Btn variant="ghost" onClick={onDone}>Cancel</Btn>}
        <Btn onClick={submit} disabled={!valid} loading={save.isPending} icon={Landmark}>
          {existing ? 'Save correction' : 'Record booking'}
        </Btn>
      </div>
    </div>
  )
}

function ClosureForm({ booking, dealId, onDone }: { booking: Booking; dealId: string; onDone: () => void }) {
  const close = useCloseBooking(dealId)
  const [closedOn, setClosedOn] = useState(today())
  const [reason, setReason]     = useState('')
  const [error, setError]       = useState<string | null>(null)
  const valid = closedOn !== '' && closedOn >= booking.booked_on && reason.trim().length >= 5
  const submit = async () => {
    if (!valid) return
    setError(null)
    try {
      await close.mutateAsync({ closed_on: closedOn, reason: reason.trim() })
      onDone()
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'The closure could not be saved. Please retry.')
    }
  }
  return (
    <div className="mt-4 pt-4 border-t border-line space-y-4">
      <InlineAlert variant="warning">
        Record this when the account ends: the client stops the plan, closes the deposit, or the loan is
        cancelled or repaid early. It can't be undone, and the booking can no longer be corrected.
      </InlineAlert>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Closed on" required>
          <input type="date" className={inputCls} aria-label="Closed on" value={closedOn}
                 min={booking.booked_on} max={today()} onChange={(e) => setClosedOn(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Reason" required hint="For example: client stopped the plan.">
        <textarea className={inputCls} aria-label="Closure reason" rows={2} maxLength={500} value={reason}
                  onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <div className="flex items-center justify-end gap-2">
        <Btn variant="ghost" onClick={onDone}>Cancel</Btn>
        <Btn onClick={submit} disabled={!valid} loading={close.isPending} icon={CircleSlash}>Record closure</Btn>
      </div>
    </div>
  )
}

function BookingRecord({ booking, dealId, onCorrect }: { booking: Booking; dealId: string; onCorrect: () => void }) {
  const [closing, setClosing] = useState(false)
  const closed = !!booking.closed_on
  const rows: [string, string][] = [
    ['Core banking reference', booking.core_reference],
    ['Booked on',              fmtDate(booking.booked_on)],
    [booking.monthly_amount != null ? 'First amount' : 'Disbursed amount', formatMUR(booking.disbursed_amount)],
    ['Disbursed on',           fmtDate(booking.disbursed_on)],
  ]
  if (booking.monthly_amount != null) rows.push(['Monthly amount', formatMUR(booking.monthly_amount)])
  if (booking.term_months != null) rows.push(['Term', `${booking.term_months} months`])
  rows.push(['Recorded via', booking.source === 'api' ? 'Core banking API' : `Portal${booking.recorded_by_name ? `, ${booking.recorded_by_name}` : ''}`])
  if (booking.corrected_count > 0) rows.push(['Corrections', String(booking.corrected_count)])
  if (closed) {
    rows.push(['Closed on', fmtDate(booking.closed_on ?? null)])
    rows.push(['Closure reason', booking.closure_reason ?? '—'])
  }
  return (
    <div className="bg-white border border-line rounded-card shadow-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-ficium" aria-hidden />
          <h2 className="text-[14px] font-bold text-ink">{closed ? 'Booked, now closed' : 'Booked in core banking'}</h2>
        </div>
        {!closed && !closing && (
          <div className="flex items-center gap-1">
            <Btn size="sm" variant="ghost" icon={Pencil} onClick={onCorrect}>Correct</Btn>
            <Btn size="sm" variant="ghost" icon={CircleSlash} onClick={() => setClosing(true)}>Record closure</Btn>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd className="text-[13px] font-semibold text-ink break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {booking.notes && <p className="text-[12px] text-muted mt-4 whitespace-pre-wrap">{booking.notes}</p>}
      {closing && <ClosureForm booking={booking} dealId={dealId} onDone={() => setClosing(false)} />}
    </div>
  )
}

export function BookingPanel({ deal }: { deal: PipelineDetail }) {
  const { data: booking, isLoading, isError } = useBooking(deal.id, deal.status === 'completed')
  const [editing, setEditing] = useState(false)

  if (deal.status !== 'completed' && !booking) {
    return (
      <InlineAlert variant="info">
        Booking opens once every processing stage is complete. Then record the loan's reference
        from your core banking system here, or let your core system post it through the API.
      </InlineAlert>
    )
  }
  if (isLoading) return <SkeletonCard />
  if (isError) return <InlineAlert variant="error">The booking could not be loaded. Refresh to try again.</InlineAlert>

  if (booking && (!editing || booking.closed_on)) {
    return <BookingRecord booking={booking} dealId={deal.id} onCorrect={() => setEditing(true)} />
  }
  return <BookingForm deal={deal} existing={booking ?? null} onDone={() => setEditing(false)} />
}
