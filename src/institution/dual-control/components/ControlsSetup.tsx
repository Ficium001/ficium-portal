/**
 * Setup › Controls — which actions need a second person (four-eyes).
 *
 * One switch per action, grouped by the screen it happens on.
 *  - Switching on applies at once.
 *  - Switching off is itself approved by a second admin; until then the row
 *    shows it as waiting, and "Keep on" withdraws the request.
 *  - Locked rows are fixed on by the platform and say why.
 * Every rule is enforced by the database (db/040); this screen only asks.
 */
import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import {
  Btn, ConfirmModal, InlineAlert, SectionHeader, SkeletonCard,
} from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'
import { useFourEyesControls, useSetFourEyes } from '../hooks/useControls'
import type { FourEyesControl } from '../types'

function Switch({
  on, disabled, label, onChange,
}: { on: boolean; disabled: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ficium',
        'disabled:cursor-not-allowed disabled:opacity-60',
        on ? 'bg-ficium' : 'bg-ink/15',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none',
          on ? 'translate-x-[22px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  )
}

function Row({
  c, busy, onAskOff, onTurnOn,
}: {
  c: FourEyesControl
  busy: boolean
  onAskOff: (c: FourEyesControl) => void
  onTurnOn: (c: FourEyesControl) => void
}) {
  const waiting = !!c.pending_disable_action_id
  let status: string
  if (c.locked) status = c.locked_reason ?? 'Always on.'
  else if (waiting) status = 'Switch-off is waiting for a second admin. Until then, a second person still approves.'
  else if (c.enabled) status = 'A second person approves before this takes effect.'
  else status = 'Takes effect straight away. Still recorded in the audit trail as one-person.'

  return (
    <li className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          {c.label}
          {c.locked && <Lock className="h-3.5 w-3.5 text-muted" aria-label="Locked on" />}
        </p>
        <p className={`mt-0.5 text-[12px] leading-snug ${waiting ? 'text-amber-700' : 'text-muted'}`}>
          {status}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-0.5">
        {waiting && c.can_change && (
          <Btn size="sm" variant="secondary" disabled={busy} onClick={() => onTurnOn(c)}>
            Keep on
          </Btn>
        )}
        <Switch
          on={c.enabled}
          label={`Four-eyes for ${c.label}`}
          disabled={c.locked || waiting || !c.can_change || busy}
          onChange={(on) => (on ? onTurnOn(c) : onAskOff(c))}
        />
      </div>
    </li>
  )
}

export function ControlsSetup() {
  const { data: controls, isLoading, isError } = useFourEyesControls()
  const setFourEyes = useSetFourEyes()
  const [confirmOff, setConfirmOff] = useState<FourEyesControl | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const groups = useMemo(() => {
    const byScreen = new Map<string, FourEyesControl[]>()
    for (const c of controls ?? []) {
      byScreen.set(c.screen, [...(byScreen.get(c.screen) ?? []), c])
    }
    return [...byScreen.entries()]
  }, [controls])

  const canChange = controls?.some((c) => c.can_change) ?? false

  const run = (c: FourEyesControl, on: boolean) => {
    setNotice(null)
    setFourEyes.mutate({ category: c.category, on }, {
      onSuccess: () => {
        setConfirmOff(null)
        setNotice({
          kind: 'success',
          text: on
            ? `Four-eyes is on for "${c.label}".`
            : `Switch-off for "${c.label}" sent to a second admin for approval.`,
        })
      },
      onError: (e) => {
        setConfirmOff(null)
        setNotice({
          kind: 'error',
          text: e instanceof PortalApiError ? e.message : 'The change was not saved. Try again.',
        })
      },
    })
  }

  if (isLoading) return <SkeletonCard />
  if (isError || !controls) {
    return <InlineAlert variant="error">Controls could not be loaded. Refresh the page to try again.</InlineAlert>
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Controls"
        subtitle="Choose which actions need a second person to approve them. Locked controls stay on for every bank."
      />
      {!canChange && (
        <InlineAlert variant="info">Only institution admins can change controls.</InlineAlert>
      )}
      {notice && (
        <InlineAlert variant={notice.kind} onDismiss={() => setNotice(null)}>{notice.text}</InlineAlert>
      )}

      {groups.map(([screen, items]) => (
        <section key={screen} aria-labelledby={`ctl-${screen}`} className="rounded-2xl border border-ink/8 bg-white px-5">
          <h3 id={`ctl-${screen}`} className="pt-4 text-[12px] font-semibold text-muted">{screen}</h3>
          <ul className="divide-y divide-ink/6">
            {items.map((c) => (
              <Row
                key={c.category}
                c={c}
                busy={setFourEyes.isPending}
                onAskOff={setConfirmOff}
                onTurnOn={(x) => run(x, true)}
              />
            ))}
          </ul>
        </section>
      ))}

      <ConfirmModal
        open={!!confirmOff}
        onClose={() => setConfirmOff(null)}
        onConfirm={() => confirmOff && run(confirmOff, false)}
        title={`Switch off four-eyes for "${confirmOff?.label ?? ''}"?`}
        description="A second admin must approve this. Once approved, this action takes effect as soon as one person does it, and is recorded as one-person in the audit trail."
        confirmLabel="Send for approval"
        variant="warning"
        isPending={setFourEyes.isPending}
      />
    </div>
  )
}
