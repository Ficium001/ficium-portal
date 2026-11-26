/**
 * SetupPanel — how this bank runs autobid: on/off, who decides (Ficium rules,
 * the bank's own decision engine, or both), whether a person approves each
 * auto-bid, bank-wide daily limits and products. Every change is a request a
 * second person approves; switching OFF is instant (Overview).
 */
import { useEffect, useState } from 'react'
import { Send, Check, X, KeyRound, PlugZap } from 'lucide-react'
import { Btn, ConfirmModal, FormField, InlineAlert, StatusBadge, inputCls } from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'
import { useConfigHistory, useDecideConfig, useProposeConfig, useRotateSecret, useTestEngine } from '../hooks/useAutobid'
import { APPROVAL_MODES, DECISION_MODES, mur, productLabel } from '../lib/labels'
import type { AutobidOverview, ConfigFields } from '../types'

const FIELDS: { key: keyof ConfigFields; label: string; show: (v: ConfigFields[keyof ConfigFields]) => string }[] = [
  { key: 'enabled', label: 'Autobid', show: (v) => (v ? 'On' : 'Off') },
  { key: 'decision_mode', label: 'Who decides', show: (v) => DECISION_MODES.find((m) => m.key === v)?.label ?? String(v) },
  { key: 'approval_mode', label: 'Approval', show: (v) => APPROVAL_MODES.find((m) => m.key === v)?.label ?? String(v) },
  { key: 'engine_url', label: 'Decision engine', show: (v) => (v ? String(v) : '—') },
  { key: 'engine_timeout_ms', label: 'Engine timeout', show: (v) => `${v} ms` },
  { key: 'engine_failure_mode', label: 'If the engine does not answer',
    show: (v) => (v === 'use_rule' ? "Use the rule's price" : 'Skip the request') },
  { key: 'max_bids_per_day', label: 'Bids a day (whole bank)', show: (v) => String(v) },
  { key: 'max_amount_per_day', label: 'Amount a day (whole bank)', show: (v) => mur(Number(v)) },
  { key: 'product_codes', label: 'Products',
    show: (v) => (Array.isArray(v) && v.length ? v.map(productLabel).join(', ') : 'Every product you have enabled') },
]

function ChangeTable({ rows }: { rows: { field: string; before: string; after: string }[] }) {
  return (
    <div className="bg-white border border-ink/8 rounded-xl overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-semibold">Setting</th>
            <th className="px-3 py-2 font-semibold">Now</th>
            <th className="px-3 py-2 font-semibold">After approval</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field} className="border-t border-ink/6">
              <td className="px-3 py-2 text-muted">{r.field}</td>
              <td className="px-3 py-2 break-all">{r.before}</td>
              <td className="px-3 py-2 font-semibold text-ink break-all">{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function changeRows(before: ConfigFields, after: ConfigFields) {
  return FIELDS.filter((f) => JSON.stringify(before[f.key]) !== JSON.stringify(after[f.key]))
    .map((f) => ({ field: f.label, before: f.show(before[f.key]), after: f.show(after[f.key]) }))
}

export function PendingChange({ o }: { o: AutobidOverview }) {
  const p = o.pending_change!
  const decide = useDecideConfig()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (decision: 'approve' | 'cancel') => {
    setError(null)
    try {
      const r = await decide.mutateAsync({ id: p.id, decision })
      if (r.engine_signing_secret) setSecret(r.engine_signing_secret)
    } catch (e) { setError(e instanceof PortalApiError ? e.message : 'That did not work. Please retry.') }
  }
  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-card p-4 space-y-3">
      <div className="text-[13px] text-ink">
        <strong>{p.proposed_by_name ?? 'A colleague'}</strong> asked for this change: “{p.reason}”
      </div>
      <ChangeTable rows={changeRows(p.before, p.proposed)} />
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <div className="flex gap-2 justify-end">
        {p.mine && <Btn variant="ghost" onClick={() => act('cancel')} loading={decide.isPending}>Cancel my request</Btn>}
        {p.can_approve && (
          <>
            <Btn variant="secondary" icon={X} onClick={() => setRejecting(true)}>Reject</Btn>
            <Btn icon={Check} onClick={() => act('approve')} loading={decide.isPending}>Approve</Btn>
          </>
        )}
        {!p.mine && !p.can_approve && <span className="text-[12px] text-muted">Needs an approver or an admin.</span>}
      </div>
      <ConfirmModal open={rejecting} onClose={() => setRejecting(false)} title="Reject this change" variant="danger"
                    confirmLabel="Reject" noteRequired note={note} onNoteChange={setNote} isPending={decide.isPending}
                    onConfirm={async () => {
                      try { await decide.mutateAsync({ id: p.id, decision: 'reject', note }); setRejecting(false) }
                      catch (e) { setError(e instanceof PortalApiError ? e.message : 'Could not reject.') }
                    }} />
      {secret && <SecretOnce secret={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

function SecretOnce({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <InlineAlert variant="warning" onDismiss={onClose}>
      <div className="space-y-1">
        <div><strong>Signing secret for your decision engine.</strong> Shown once: copy it now.</div>
        <code className="block break-all bg-white border border-line rounded px-2 py-1 text-[12px]">{secret}</code>
        <div className="text-[12px]">Your engine checks the <code>Ficium-Signature</code> header with it on every call.</div>
      </div>
    </InlineAlert>
  )
}

function EngineTools({ o }: { o: AutobidOverview }) {
  const test = useTestEngine()
  const rotate = useRotateSecret()
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const c = o.config
  if (!c.engine_url) return null
  const a = test.data?.answer
  return (
    <div className="bg-white border border-line rounded-card p-4 space-y-3">
      <div className="text-[13px] font-semibold text-ink">Your decision engine</div>
      <div className="text-[12px] text-muted break-all">{c.engine_url}</div>
      <div className="text-[12px] text-muted">
        Signing secret {c.engine_secret_set_at ? `set ${new Date(c.engine_secret_set_at).toLocaleDateString('en-MU')}` : 'not set'}
        {' · '}contract <code>{o.decision_contract}</code>
      </div>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {a && (
        <InlineAlert variant={a.decision === 'unavailable' ? 'error' : 'success'}>
          {a.decision === 'bid' && `Answered bid: ${a.rate_pct}% on ${mur(a.amount ?? 0)} for ${a.term_months} months`}
          {a.decision === 'decline' && `Answered decline${a.reason ? ` (${a.reason})` : ''}`}
          {a.decision === 'unavailable' && `No usable answer: ${a.reason}`}
          {a.latency_ms != null && ` · ${a.latency_ms} ms`}
        </InlineAlert>
      )}
      <div className="flex gap-2">
        <Btn variant="secondary" icon={PlugZap} loading={test.isPending}
             onClick={() => test.mutate(undefined, {
               onError: (e) => setError(e instanceof PortalApiError ? e.message : 'Test failed.'),
             })}>
          Send a test request
        </Btn>
        {o.me.is_admin && (
          <Btn variant="ghost" icon={KeyRound} loading={rotate.isPending}
               onClick={async () => {
                 try { setSecret((await rotate.mutateAsync()).engine_signing_secret) }
                 catch (e) { setError(e instanceof PortalApiError ? e.message : 'Could not replace the secret.') }
               }}>
            Replace signing secret
          </Btn>
        )}
      </div>
      {secret && <SecretOnce secret={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

function History() {
  const { data } = useConfigHistory()
  const decided = (data ?? []).filter((h) => h.status !== 'pending')
  if (!decided.length) return null
  return (
    <section aria-label="Recent changes" className="bg-white border border-line rounded-card p-4">
      <h3 className="text-[13px] font-semibold text-ink mb-2">Recent changes</h3>
      <ul className="divide-y divide-ink/6">
        {decided.slice(0, 10).map((h) => (
          <li key={h.id} className="py-2 text-[12px] flex flex-wrap items-center gap-2">
            <StatusBadge status={h.status === 'approved' ? 'approved' : h.status === 'rejected' ? 'rejected' : 'cancelled'}
                         label={h.status} size="xs" />
            <span className="text-ink">{changeRows(h.before, h.proposed).map((r) => `${r.field}: ${r.after}`).join(' · ') || '—'}</span>
            <span className="text-muted">
              asked by {h.proposed_by_name ?? '—'}{h.decided_by_name ? `, ${h.status} by ${h.decided_by_name}` : ''}
              {' · '}{new Date(h.decided_at ?? h.created_at).toLocaleDateString('en-MU')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SetupPanel({ o }: { o: AutobidOverview }) {
  const c = o.config
  const live: ConfigFields = {
    enabled: c.enabled, decision_mode: c.decision_mode, approval_mode: c.approval_mode, engine_url: c.engine_url,
    engine_timeout_ms: c.engine_timeout_ms, engine_failure_mode: c.engine_failure_mode,
    max_bids_per_day: c.max_bids_per_day, max_amount_per_day: c.max_amount_per_day, product_codes: c.product_codes,
  }
  const [draft, setDraft] = useState<ConfigFields>(live)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const propose = useProposeConfig()
  // Reload the form when the live setting changes (approved, paused).
  useEffect(() => { setDraft(live) }, [c.version])

  const set = <K extends keyof ConfigFields>(k: K, v: ConfigFields[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const rows = changeRows(live, draft)
  const needsEngine = draft.decision_mode !== 'rules'

  const submit = async () => {
    setError(null); setDone(false)
    try {
      await propose.mutateAsync({ proposed: draft, reason: reason.trim() })
      setReason(''); setDone(true)
    } catch (e) { setError(e instanceof PortalApiError ? e.message : 'The request could not be sent.') }
  }

  return (
    <div className="space-y-5">
      {o.pending_change && <PendingChange o={o} />}
      <EngineTools o={o} />

      <div className="bg-white border border-line rounded-card shadow-card p-5 space-y-5">
        <FormField label="Autobid">
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            On {o.active_rules === 0 && draft.decision_mode !== 'external' && draft.enabled && (
              <span className="text-amber-700">(no active rule yet: nothing will be bid until one is approved)</span>
            )}
          </label>
        </FormField>

        <fieldset>
          <legend className="text-[12px] font-semibold text-ink mb-2">Who decides</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {DECISION_MODES.map((m) => (
              <label key={m.key} className={`border rounded-lg p-3 cursor-pointer ${draft.decision_mode === m.key
                ? 'border-ficium bg-ficium/5' : 'border-line'}`}>
                <input type="radio" name="decision_mode" className="sr-only" checked={draft.decision_mode === m.key}
                       onChange={() => set('decision_mode', m.key)} />
                <div className="text-[13px] font-semibold text-ink">{m.label}</div>
                <div className="text-[12px] text-muted mt-1">{m.hint}</div>
              </label>
            ))}
          </div>
        </fieldset>

        {needsEngine && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <FormField label="Decision engine address" required hint="Public https only. Ficium signs every call.">
                <input className={inputCls} aria-label="Decision engine address" value={draft.engine_url ?? ''}
                       placeholder="https://decisions.yourbank.mu/ficium"
                       onChange={(e) => set('engine_url', e.target.value.trim() || null)} />
              </FormField>
            </div>
            <FormField label="Timeout (ms)">
              <input type="number" min={500} max={10000} step={100} className={inputCls} aria-label="Engine timeout"
                     value={draft.engine_timeout_ms} onChange={(e) => set('engine_timeout_ms', Number(e.target.value))} />
            </FormField>
            {draft.decision_mode === 'rules_then_external' && (
              <FormField label="If your engine does not answer">
                <select className={inputCls} aria-label="Engine failure mode" value={draft.engine_failure_mode}
                        onChange={(e) => set('engine_failure_mode', e.target.value as ConfigFields['engine_failure_mode'])}>
                  <option value="skip">Skip the request</option>
                  <option value="use_rule">Use the rule’s price</option>
                </select>
              </FormField>
            )}
          </div>
        )}

        <fieldset>
          <legend className="text-[12px] font-semibold text-ink mb-2">Approval</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {APPROVAL_MODES.map((m) => (
              <label key={m.key} className={`border rounded-lg p-3 cursor-pointer ${draft.approval_mode === m.key
                ? 'border-ficium bg-ficium/5' : 'border-line'}`}>
                <input type="radio" name="approval_mode" className="sr-only" checked={draft.approval_mode === m.key}
                       onChange={() => set('approval_mode', m.key)} />
                <div className="text-[13px] font-semibold text-ink">{m.label}</div>
                <div className="text-[12px] text-muted mt-1">{m.hint}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Bids a day, whole bank" required>
            <input type="number" min={1} max={10000} className={inputCls} aria-label="Bank max bids per day"
                   value={draft.max_bids_per_day} onChange={(e) => set('max_bids_per_day', Number(e.target.value))} />
          </FormField>
          <FormField label="Amount a day, whole bank (MUR)" required>
            <input type="number" min={1} className={inputCls} aria-label="Bank max amount per day"
                   value={draft.max_amount_per_day} onChange={(e) => set('max_amount_per_day', Number(e.target.value))} />
          </FormField>
        </div>

        <FormField label="Products" hint="None selected = every product your bank has enabled.">
          <div className="flex flex-wrap gap-1.5">
            {o.vocabulary.products.map((p) => {
              const on = (draft.product_codes ?? []).includes(p)
              return (
                <button key={p} type="button" aria-pressed={on}
                        onClick={() => {
                          const cur = draft.product_codes ?? []
                          const next = on ? cur.filter((x) => x !== p) : [...cur, p]
                          set('product_codes', next.length ? next : null)
                        }}
                        className={`px-2.5 py-1 rounded-full text-[12px] border ${on
                          ? 'bg-ficium text-white border-ficium' : 'bg-white text-ink border-line hover:border-ficium/40'}`}>
                  {productLabel(p)}
                </button>
              )
            })}
          </div>
        </FormField>

        {rows.length > 0 && (
          <div className="space-y-3 border-t border-line pt-4">
            <ChangeTable rows={rows} />
            <FormField label="Why" required>
              <input className={inputCls} aria-label="Reason for the change" maxLength={500} value={reason}
                     onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pilot on salaried personal loans" />
            </FormField>
          </div>
        )}
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        {done && <InlineAlert variant="success">Sent for approval. A second person approves it before it takes effect.</InlineAlert>}
        <div className="flex justify-end">
          <Btn icon={Send} onClick={submit} loading={propose.isPending}
               disabled={!rows.length || reason.trim().length < 3 || !!o.pending_change}>
            Ask for approval
          </Btn>
        </div>
      </div>
      <History />
    </div>
  )
}
