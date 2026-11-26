/**
 * RuleBuilder — create a rule, or a new version of one. A rule is:
 *   which requests (products + conditions, all must be true),
 *   the bid it makes (rate, optional rate per risk tier, amount, term, validity),
 *   its own daily limits.
 * "Preview" runs it against the requests this bank saw in the last 30 days.
 * Saving makes a draft; it does nothing until someone submits it and a second
 * person approves it.
 */
import { useMemo, useState } from 'react'
import { Plus, Trash2, Eye, Save } from 'lucide-react'
import { Btn, FormField, InlineAlert, Modal, inputCls } from '@/institution/components/primitives'
import { PortalApiError } from '@/shared/lib/portalApi'
import { useCreateRule, useNewVersion, usePreview } from '../hooks/useAutobid'
import { FIELD_LABELS, OP_LABELS, TIER_OP_LABELS, mur, productLabel } from '../lib/labels'
import type { Leaf, Op, Predicate, PreviewResult, RuleAction, RuleDetail, RuleGuardrails, Vocabulary } from '../types'

interface Cond { field: string; op: Op; value: string; value2: string; values: string[] }

const emptyCond = (): Cond => ({ field: 'risk_tier', op: 'lte', value: 'B', value2: '', values: [] })

function toLeaf(c: Cond, kind: string): Leaf | null {
  if (c.op === 'in') {
    const vals = kind === 'num' ? c.values.map(Number) : c.values
    return vals.length ? { field: c.field, op: 'in', value: vals } : null
  }
  if (c.op === 'between') {
    const lo = Number(c.value), hi = Number(c.value2)
    return Number.isFinite(lo) && Number.isFinite(hi) && c.value !== '' && c.value2 !== ''
      ? { field: c.field, op: 'between', value: [lo, hi] } : null
  }
  if (c.value === '') return null
  const value = kind === 'num' ? Number(c.value) : kind === 'bool' ? c.value === 'true' : c.value
  if (kind === 'num' && !Number.isFinite(value as number)) return null
  return { field: c.field, op: c.op, value }
}

function fromLeaf(l: Leaf): Cond {
  const v = l.value
  if (l.op === 'in') return { field: l.field, op: 'in', value: '', value2: '', values: (v as unknown[]).map(String) }
  if (l.op === 'between') {
    const [lo, hi] = v as number[]
    return { field: l.field, op: 'between', value: String(lo), value2: String(hi), values: [] }
  }
  return { field: l.field, op: l.op, value: String(v), value2: '', values: [] }
}

/** Split a stored predicate back into products + flat conditions (the shape this builder writes). */
function parse(p: Predicate | undefined): { products: string[]; conds: Cond[] } {
  if (!p) return { products: [], conds: [] }
  const leaves: Leaf[] = 'all' in p ? (p.all.filter((x) => 'field' in x) as Leaf[]) : 'field' in p ? [p] : []
  const prod = leaves.find((l) => l.field === 'product')
  const products = prod ? (prod.op === 'in' ? (prod.value as string[]) : [prod.value as string]) : []
  return { products, conds: leaves.filter((l) => l.field !== 'product').map(fromLeaf) }
}

export function RuleBuilder({
  vocabulary, existing, onClose,
}: {
  vocabulary: Vocabulary
  existing?: RuleDetail | null
  onClose: () => void
}) {
  const v = existing?.current_version
  const initial = useMemo(() => parse(v?.predicate), [v])
  const [name, setName]         = useState(existing?.rule.name ?? '')
  const [description, setDesc]  = useState(existing?.rule.description ?? '')
  const [priority, setPriority] = useState(String(existing?.rule.priority ?? 100))
  const [products, setProducts] = useState<string[]>(initial.products)
  const [conds, setConds]       = useState<Cond[]>(initial.conds.length || existing ? initial.conds : [emptyCond()])
  const [rate, setRate]         = useState(String(v?.action.rate_pct ?? ''))
  const [tierRates, setTierRates] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(v?.action.rate_by_tier ?? {}).map(([k, x]) => [k, String(x)])))
  const [rateType, setRateType] = useState<RuleAction['rate_type']>(v?.action.rate_type ?? 'fixed')
  const [amountMode, setAmountMode] = useState<RuleAction['amount']['mode']>(v?.action.amount.mode ?? 'requested')
  const [amountVal, setAmountVal]   = useState(String(v?.action.amount.value ?? ''))
  const [termMode, setTermMode] = useState<RuleAction['term']['mode']>(v?.action.term.mode ?? 'requested')
  const [termVal, setTermVal]   = useState(String(v?.action.term.value ?? ''))
  const [validDays, setValidDays] = useState(String(v?.action.rate_valid_days ?? 14))
  const [conditionsText, setConditionsText] = useState(v?.action.conditions ?? '')
  const [maxBids, setMaxBids]   = useState(String(v?.guardrails.max_bids_per_day ?? 20))
  const [maxAmount, setMaxAmount] = useState(String(v?.guardrails.max_amount_per_day ?? 10_000_000))
  const [expires, setExpires]   = useState(v?.guardrails.expires_at?.slice(0, 10) ?? '')
  const [error, setError]       = useState<string | null>(null)
  const [preview, setPreview]   = useState<PreviewResult | null>(null)

  const create = useCreateRule()
  const version = useNewVersion(existing?.rule.id ?? '')
  const previewM = usePreview()
  const kindOf = (f: string) => vocabulary.fields.find((x) => x.field === f)?.kind ?? 'str'
  const fieldChoices = vocabulary.fields.filter((f) => f.field !== 'product')

  const build = (): { predicate: Predicate; action: RuleAction; guardrails: RuleGuardrails } | string => {
    if (!products.length) return 'Choose at least one product.'
    const leaves: Leaf[] = [products.length === 1
      ? { field: 'product', op: 'eq', value: products[0] }
      : { field: 'product', op: 'in', value: products }]
    for (const c of conds) {
      const leaf = toLeaf(c, kindOf(c.field))
      if (!leaf) return `Complete the condition on ${FIELD_LABELS[c.field] ?? c.field}, or remove it.`
      leaves.push(leaf)
    }
    const rateNum = Number(rate)
    if (!(rateNum > 0 && rateNum <= 100)) return 'Enter a rate above 0 and at most 100%.'
    const byTier: Record<string, number> = {}
    for (const [t, x] of Object.entries(tierRates)) {
      if (x.trim() === '') continue
      const n = Number(x)
      if (!(n > 0 && n <= 100)) return `Tier ${t} rate must be above 0 and at most 100%.`
      byTier[t] = n
    }
    const action: RuleAction = {
      rate_pct: rateNum, rate_type: rateType,
      amount: amountMode === 'requested' ? { mode: 'requested' } : { mode: amountMode, value: Number(amountVal) },
      term: termMode === 'requested' ? { mode: 'requested' } : { mode: 'fixed', value: Number(termVal) },
      rate_valid_days: Number(validDays),
      ...(Object.keys(byTier).length ? { rate_by_tier: byTier } : {}),
      ...(conditionsText.trim() ? { conditions: conditionsText.trim() } : {}),
    }
    const guardrails: RuleGuardrails = {
      max_bids_per_day: Number(maxBids), max_amount_per_day: Number(maxAmount),
      ...(expires ? { expires_at: expires } : {}),
    }
    const predicate: Predicate = leaves.length === 1 ? leaves[0]! : { all: leaves }
    return { predicate, action, guardrails }
  }

  const runPreview = async () => {
    setError(null)
    const b = build()
    if (typeof b === 'string') return setError(b)
    try { setPreview(await previewM.mutateAsync({ predicate: b.predicate, action: b.action })) }
    catch (e) { setError(e instanceof PortalApiError ? e.message : 'Preview failed. Please retry.') }
  }

  const save = async () => {
    setError(null)
    const b = build()
    if (typeof b === 'string') return setError(b)
    if (!existing && !name.trim()) return setError('Give the rule a name.')
    try {
      if (existing) await version.mutateAsync(b)
      else await create.mutateAsync({ name: name.trim(), description: description.trim() || null,
                                      priority: Number(priority) || 100, ...b })
      onClose()
    } catch (e) {
      setError(e instanceof PortalApiError ? e.message : 'The rule could not be saved. Please retry.')
    }
  }

  const setCond = (i: number, patch: Partial<Cond>) =>
    setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <Modal open onClose={onClose} title={existing ? `New version of “${existing.rule.name}”` : 'New autobid rule'}
           width="max-w-3xl">
      <div className="space-y-5">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        {!existing && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <FormField label="Name" required>
                <input className={inputCls} aria-label="Rule name" maxLength={120} value={name}
                       onChange={(e) => setName(e.target.value)} placeholder="e.g. Salaried, tier A–B personal loans" />
              </FormField>
            </div>
            <FormField label="Priority" hint="Lower runs first when two rules match.">
              <input type="number" min={1} max={10000} className={inputCls} aria-label="Priority" value={priority}
                     onChange={(e) => setPriority(e.target.value)} />
            </FormField>
            <div className="sm:col-span-3">
              <FormField label="Description">
                <input className={inputCls} aria-label="Description" maxLength={1000} value={description}
                       onChange={(e) => setDesc(e.target.value)} />
              </FormField>
            </div>
          </div>
        )}

        <section aria-label="Which requests">
          <h3 className="text-[13px] font-bold text-ink mb-2">Which requests</h3>
          <FormField label="Products" required>
            <div className="flex flex-wrap gap-1.5">
              {vocabulary.products.map((p) => {
                const on = products.includes(p)
                return (
                  <button key={p} type="button" aria-pressed={on}
                          onClick={() => setProducts((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))}
                          className={`px-2.5 py-1 rounded-full text-[12px] border ${on
                            ? 'bg-ficium text-white border-ficium' : 'bg-white text-ink border-line hover:border-ficium/40'}`}>
                    {productLabel(p)}
                  </button>
                )
              })}
            </div>
          </FormField>

          <div className="mt-3 space-y-2">
            <p className="text-[12px] text-muted">All conditions must be true. A request that doesn’t carry a fact never matches a condition on it.</p>
            {conds.map((c, i) => {
              const f = fieldChoices.find((x) => x.field === c.field) ?? fieldChoices[0]
              if (!f) return null
              const kind = f.kind
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 bg-cream rounded-lg p-2">
                  <select className={`${inputCls} w-auto`} aria-label="Field" value={c.field}
                          onChange={(e) => {
                            const nf = fieldChoices.find((x) => x.field === e.target.value)!
                            setCond(i, { field: nf.field, op: nf.ops[0], value: '', value2: '', values: [] })
                          }}>
                    {fieldChoices.map((x) => <option key={x.field} value={x.field}>{FIELD_LABELS[x.field] ?? x.field}</option>)}
                  </select>
                  <select className={`${inputCls} w-auto`} aria-label="Operator" value={c.op}
                          onChange={(e) => setCond(i, { op: e.target.value as Op, values: [] })}>
                    {f.ops.map((o) => (
                      <option key={o} value={o}>{(kind === 'tier' && TIER_OP_LABELS[o]) || OP_LABELS[o]}</option>
                    ))}
                  </select>
                  {kind === 'tier' && c.op !== 'in' && (
                    <select className={`${inputCls} w-auto`} aria-label="Value" value={c.value}
                            onChange={(e) => setCond(i, { value: e.target.value })}>
                      <option value="">—</option>
                      {vocabulary.risk_tiers.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  {kind === 'bool' && (
                    <select className={`${inputCls} w-auto`} aria-label="Value" value={c.value}
                            onChange={(e) => setCond(i, { value: e.target.value })}>
                      <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                  )}
                  {(kind === 'num' || kind === 'str') && c.op !== 'in' && (
                    <input className={`${inputCls} w-36`} aria-label="Value" value={c.value}
                           inputMode={kind === 'num' ? 'decimal' : undefined}
                           onChange={(e) => setCond(i, { value: e.target.value })} />
                  )}
                  {c.op === 'between' && (
                    <>
                      <span className="text-[12px] text-muted">and</span>
                      <input className={`${inputCls} w-36`} aria-label="Upper value" inputMode="decimal" value={c.value2}
                             onChange={(e) => setCond(i, { value2: e.target.value })} />
                    </>
                  )}
                  {c.op === 'in' && (
                    <input className={`${inputCls} flex-1 min-w-[12rem]`} aria-label="Values, comma separated"
                           placeholder={kind === 'tier' ? 'A, B' : 'comma separated'}
                           value={c.values.join(', ')}
                           onChange={(e) => setCond(i, {
                             values: e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                               .map((x) => (kind === 'tier' ? x.toUpperCase() : x)),
                           })} />
                  )}
                  <button type="button" aria-label="Remove condition" className="ml-auto p-1.5 text-muted hover:text-red-500"
                          onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
            <Btn variant="ghost" size="sm" icon={Plus} onClick={() => setConds((cs) => [...cs, emptyCond()])}>
              Add condition
            </Btn>
          </div>
        </section>

        <section aria-label="The bid">
          <h3 className="text-[13px] font-bold text-ink mb-2">The bid</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Rate (% a year)" required>
              <input type="number" step="0.01" min={0} max={100} className={inputCls} aria-label="Rate"
                     value={rate} onChange={(e) => setRate(e.target.value)} />
            </FormField>
            <FormField label="Rate type">
              <select className={inputCls} aria-label="Rate type" value={rateType}
                      onChange={(e) => setRateType(e.target.value as RuleAction['rate_type'])}>
                <option value="fixed">Fixed</option><option value="variable">Variable</option>
              </select>
            </FormField>
            <FormField label="Offer valid for (days)">
              <input type="number" min={1} max={90} className={inputCls} aria-label="Offer valid days"
                     value={validDays} onChange={(e) => setValidDays(e.target.value)} />
            </FormField>
          </div>
          <div className="mt-3">
            <FormField label="Rate by risk tier (optional)" hint="Overrides the rate for that tier. Leave empty to use the rate above.">
              <div className="flex gap-2">
                {vocabulary.risk_tiers.map((t) => (
                  <label key={t} className="flex items-center gap-1 text-[12px] text-muted">
                    {t}
                    <input type="number" step="0.01" className={`${inputCls} w-20`} aria-label={`Rate for tier ${t}`}
                           value={tierRates[t] ?? ''} onChange={(e) => setTierRates((r) => ({ ...r, [t]: e.target.value }))} />
                  </label>
                ))}
              </div>
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <FormField label="Amount">
              <div className="flex gap-2">
                <select className={`${inputCls} w-auto`} aria-label="Amount mode" value={amountMode}
                        onChange={(e) => setAmountMode(e.target.value as RuleAction['amount']['mode'])}>
                  <option value="requested">What was requested</option>
                  <option value="pct_of_requested">% of requested</option>
                  <option value="fixed">Fixed amount (capped at requested)</option>
                </select>
                {amountMode !== 'requested' && (
                  <input type="number" className={`${inputCls} w-32`} aria-label="Amount value" value={amountVal}
                         onChange={(e) => setAmountVal(e.target.value)} />
                )}
              </div>
            </FormField>
            <FormField label="Term">
              <div className="flex gap-2">
                <select className={`${inputCls} w-auto`} aria-label="Term mode" value={termMode}
                        onChange={(e) => setTermMode(e.target.value as RuleAction['term']['mode'])}>
                  <option value="requested">What was requested</option>
                  <option value="fixed">Fixed (months)</option>
                </select>
                {termMode === 'fixed' && (
                  <input type="number" min={1} max={480} className={`${inputCls} w-24`} aria-label="Term months"
                         value={termVal} onChange={(e) => setTermVal(e.target.value)} />
                )}
              </div>
            </FormField>
          </div>
          <div className="mt-3">
            <FormField label="Conditions shown to the borrower (optional)">
              <textarea rows={2} maxLength={1000} className={inputCls} aria-label="Conditions"
                        value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} />
            </FormField>
          </div>
        </section>

        <section aria-label="Limits">
          <h3 className="text-[13px] font-bold text-ink mb-2">This rule’s daily limits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Bids a day" required>
              <input type="number" min={1} max={10000} className={inputCls} aria-label="Max bids per day"
                     value={maxBids} onChange={(e) => setMaxBids(e.target.value)} />
            </FormField>
            <FormField label="Amount a day (MUR)" required>
              <input type="number" min={1} className={inputCls} aria-label="Max amount per day"
                     value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </FormField>
            <FormField label="Stops on (optional)">
              <input type="date" className={inputCls} aria-label="Expires on" value={expires}
                     onChange={(e) => setExpires(e.target.value)} />
            </FormField>
          </div>
        </section>

        {preview && (
          <InlineAlert variant="info">
            Over the last {preview.days} days this rule would have bid on <strong>{preview.would_bid}</strong> of{' '}
            {preview.requests_checked} requests, {mur(preview.total_amount)} in total.
            {preview.sample.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[12px]">
                {preview.sample.slice(0, 5).map((s) => (
                  <li key={s.request_id}>
                    {productLabel(s.product)} · {mur(s.amount)} · {s.term_months} mo · tier {s.risk_tier ?? '—'}
                    {s.bid ? ` → ${s.bid.rate_pct}% on ${mur(s.bid.amount)} for ${s.bid.term_months} mo` : ' → cannot price'}
                  </li>
                ))}
              </ul>
            )}
          </InlineAlert>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Btn variant="secondary" icon={Eye} onClick={runPreview} loading={previewM.isPending}>Preview on recent requests</Btn>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn icon={Save} onClick={save} loading={create.isPending || version.isPending}>Save as draft</Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
