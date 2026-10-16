/**
 * BookingPanel — the deal's hand-off to the bank's core banking system.
 *
 * Processing incomplete → explains what must happen first.
 * Not booked            → form: core reference, booking date, disbursed amount.
 * Booked                → the record, with "Correct" (audited, keeps old values).
 *
 * The bank's own system can post the same record through
 * POST /v1/pipeline/{id}/booking; either way it shows up here.
 */
import { useState } from 'react'
import { Landmark, Pencil } from 'lucide-react'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'
import { Btn, FormField, InlineAlert, SkeletonCard, inputCls } from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'
import { formatMUR } from '@/shared/lib/format'
import { useBooking, useSaveBooking } from '../hooks/useBooking'
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
  const [ref, setRef]           = useState(existing?.core_reference ?? '')
  const [bookedOn, setBookedOn] = useState(existing?.booked_on ?? today())
  const [amount, setAmount]     = useState(String(existing?.disbursed_amount ?? deal.deal_amount ?? ''))
  const [disbOn, setDisbOn]     = useState(existing?.disbursed_on ?? '')
  const [notes, setNotes]       = useState(existing?.notes ?? '')
  const [error, setError]       = useState<string | null>(null)

  const amountNum = Number(amount)
  const valid = ref.trim() !== '' && ref.trim().length <= 64 && bookedOn !== ''
    && Number.isFinite(amountNum) && amountNum > 0
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
        <FormField label="Disbursed amount (MUR)" required
                   hint={deal.deal_amount ? `Accepted amount ${formatMUR(deal.deal_amount)}` : undefined}>
          <input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls}
                 aria-label="Disbursed amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Disbursed on" hint="Leave empty if not disbursed yet.">
          <input type="date" className={inputCls} aria-label="Disbursed on" value={disbOn}
                 min={minDate} max={today()} onChange={(e) => setDisbOn(e.target.value)} />
        </FormField>
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

function BookingRecord({ booking, onCorrect }: { booking: Booking; onCorrect: () => void }) {
  const rows: [string, string][] = [
    ['Core banking reference', booking.core_reference],
    ['Booked on',              fmtDate(booking.booked_on)],
    ['Disbursed amount',       formatMUR(booking.disbursed_amount)],
    ['Disbursed on',           fmtDate(booking.disbursed_on)],
    ['Recorded via',           booking.source === 'api' ? 'Core banking API' : `Portal${booking.recorded_by_name ? `, ${booking.recorded_by_name}` : ''}`],
  ]
  if (booking.corrected_count > 0) rows.push(['Corrections', String(booking.corrected_count)])
  return (
    <div className="bg-white border border-line rounded-card shadow-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-ficium" aria-hidden />
          <h2 className="text-[14px] font-bold text-ink">Booked in core banking</h2>
        </div>
        <Btn size="sm" variant="ghost" icon={Pencil} onClick={onCorrect}>Correct</Btn>
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

  if (booking && !editing) return <BookingRecord booking={booking} onCorrect={() => setEditing(true)} />
  return <BookingForm deal={deal} existing={booking ?? null} onDone={() => setEditing(false)} />
}
