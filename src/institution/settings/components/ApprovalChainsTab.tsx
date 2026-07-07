/**
 * @component ApprovalChainsTab
 * @description
 *   Configuration surface for the configurable approval engine
 *   (inst:approvals). Institutions compose their own chains:
 *
 *     - Committees   — named voting bodies (quorum: count / fraction /
 *                      unanimous, chair tie-break, date-bounded membership
 *                      for rotation)
 *     - Templates    — ordered stage chains (single / dual / committee /
 *                      checklist / external hold), each stage carrying an
 *                      SLA and a breach behaviour. Activation is dual
 *                      control: the creator submits, a DIFFERENT admin
 *                      activates.
 *     - Routing      — the delegation-of-authority matrix (amount / risk
 *                      tier / product / secured → template), evaluated
 *                      top-down by priority. The simulator calls the
 *                      exact same evaluator production routing uses —
 *                      what you test is what will happen.
 *
 *   Coexists with the existing maker-checker (/approvals) — this tab
 *   configures the newer, richer engine used for committee-based and
 *   multi-stage decisions; existing dual-control flows are untouched.
 *
 * @dataSource useApprovalCommittees, useApprovalTemplates, useDoaRules,
 *             useSimulateRouting → ficium-portal-api /approval-engine/*
 * @owner Ficium Engineering
 */
import { useState } from 'react'
import { Users, GitBranch, Route, Plus, ChevronUp, ChevronDown, Trash2, UserPlus } from 'lucide-react'
import {
  useApprovalCommittees, useCreateCommittee, useAddCommitteeMember, useEndCommitteeMembership,
  useApprovalTemplates, useCreateTemplate, useActivateTemplate,
  useDoaRules, useCreateDoaRule, useSimulateRouting,
} from '@/institution/hooks/useApprovalEngine'
import { useInstitutionMembers } from '@/institution/hooks/useInstitutionMembers'
import { MemberPickerModal } from '@/institution/components/MemberPickerModal'
import type {
  Committee, StageDef, StageType, EntityType, DoaConditions,
} from '@/institution/types/approvalEngine'
import {
  SectionHeader, StatusBadge, EmptyState, InlineAlert,
  Btn, FormField, inputCls, Modal,
} from '@/institution/components/primitives'

const STAGE_TYPES: { value: StageType; label: string; hint: string }[] = [
  { value: 'single',        label: 'Single approver', hint: 'One role holder signs off' },
  { value: 'dual',          label: 'Dual control',    hint: 'Two distinct role holders' },
  { value: 'committee',     label: 'Committee',       hint: 'Quorum vote by a defined committee' },
  { value: 'checklist',     label: 'Checklist',       hint: 'Gated on required checks (e.g. legal)' },
  { value: 'external_hold', label: 'External hold',  hint: 'Waiting on outside sanction' },
]

const ROLES = ['checker', 'officer', 'credit_manager', 'legal', 'admin']

// ─────────────────────────────────────────────────────────────────────────────
// Sub-tabs within the tab (Committees / Templates / Routing)
// ─────────────────────────────────────────────────────────────────────────────

type SubTab = 'committees' | 'templates' | 'routing'

export function ApprovalChainsTab({ isAdmin }: { isAdmin: boolean }) {
  const [sub, setSub] = useState<SubTab>('committees')

  const SUBS: { key: SubTab; label: string; icon: typeof Users }[] = [
    { key: 'committees', label: 'Committees', icon: Users },
    { key: 'templates',  label: 'Workflows',  icon: GitBranch },
    { key: 'routing',    label: 'Routing',    icon: Route },
  ]

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 bg-ink/[0.03] rounded-xl p-1 w-fit">
        {SUBS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
              sub === s.key ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'
            }`}
          >
            <s.icon className="w-3.5 h-3.5" aria-hidden />
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'committees' && <CommitteesSection isAdmin={isAdmin} />}
      {sub === 'templates'  && <TemplatesSection isAdmin={isAdmin} />}
      {sub === 'routing'    && <RoutingSection isAdmin={isAdmin} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Committees
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  chair: 'Chair', vice_chair: 'Vice-chair', member: 'Member',
  secretary: 'Secretary', observer: 'Observer',
}

function quorumLabel(c: Committee): string {
  if (c.quorum_type === 'count') return `${c.quorum_value} votes`
  if (c.quorum_type === 'fraction') return `${Math.round(Number(c.quorum_value) * 100)}%+`
  return 'Unanimous'
}

function CommitteesSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: committees = [], isLoading } = useApprovalCommittees()
  const [showCreate, setShowCreate] = useState(false)

  if (isLoading) return <p className="text-[13px] text-muted">Loading committees…</p>

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Committees"
        subtitle="Who decides — membership is date-bounded to support rotation."
        actions={isAdmin && (
          <Btn icon={Plus} onClick={() => setShowCreate(true)}>New committee</Btn>
        )}
      />

      {committees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No committees yet"
          description="Single and dual-control stages don't need one — create a committee when a decision needs a quorum vote."
        />
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <CommitteeCard key={c.id} committee={c} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {showCreate && <CreateCommitteeModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CommitteeCard({ committee, isAdmin }: { committee: Committee; isAdmin: boolean }) {
  const addMember = useAddCommitteeMember(committee.id)
  const endMembership = useEndCommitteeMembership(committee.id)
  const { data: members = [] } = useInstitutionMembers(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [role, setRole] = useState<Committee['members'][number]['role']>('member')

  const active = committee.members.filter((m) => !m.valid_to || new Date(m.valid_to) >= new Date())
  const activeAuthUserIds = active.map((m) => m.member_id)

  const displayName = (authUserId: string) => {
    const person = members.find((m) => m.auth_user_id === authUserId)
    return person?.full_name || person?.email || authUserId
  }

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] p-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink text-[14px]">{committee.name}</p>
        <span className="inline-flex items-center rounded-full bg-ficium/8 text-ficium px-2.5 py-1 text-[11px] font-semibold">
          Quorum: {quorumLabel(committee)} · tie-break {committee.tie_break}
        </span>
      </div>

      <div className="mt-3 divide-y divide-ink/[0.06]">
        {active.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2 text-[13px]">
            <span className="text-ink truncate">{displayName(m.member_id)}</span>
            <span className="flex items-center gap-2">
              <span className="rounded bg-ink/4 px-1.5 py-0.5 text-[11px] text-muted">
                {ROLE_LABEL[m.role]}{!m.is_voting && ' · non-voting'}
              </span>
              {isAdmin && (
                <button
                  onClick={() => endMembership.mutate(m.id)}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  End
                </button>
              )}
            </span>
          </div>
        ))}
        {active.length === 0 && (
          <p className="py-2 text-[13px] text-muted">No active members.</p>
        )}
      </div>

      {isAdmin && (
        <div className="mt-3 flex gap-2">
          <Btn
            variant="secondary"
            icon={UserPlus}
            onClick={() => setPickerOpen(true)}
          >
            Add member
          </Btn>
          <select
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}

      <MemberPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={`Add to ${committee.name}`}
        excludeAuthUserIds={activeAuthUserIds}
        onSelect={(person) => {
          addMember.mutate({
            member_id: person.auth_user_id, role, is_voting: role !== 'secretary' && role !== 'observer',
            valid_from: new Date().toISOString().slice(0, 10),
          })
        }}
      />
    </div>
  )
}

function CreateCommitteeModal({ onClose }: { onClose: () => void }) {
  const create = useCreateCommittee()
  const [name, setName] = useState('')
  const [quorumType, setQuorumType] = useState<Committee['quorum_type']>('count')
  const [quorumValue, setQuorumValue] = useState('3')
  const [tieBreak, setTieBreak] = useState<Committee['tie_break']>('chair')

  return (
    <Modal open onClose={onClose} title="New committee">
      <div className="space-y-4">
        <FormField label="Name" required>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Credit Committee" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quorum type">
            <select className={inputCls} value={quorumType}
              onChange={(e) => setQuorumType(e.target.value as typeof quorumType)}>
              <option value="count">Fixed count</option>
              <option value="fraction">Fraction</option>
              <option value="unanimous">Unanimous</option>
            </select>
          </FormField>
          {quorumType !== 'unanimous' && (
            <FormField label={quorumType === 'count' ? 'Votes required' : 'Fraction (0–1)'}>
              <input type="number" className={inputCls} value={quorumValue}
                step={quorumType === 'fraction' ? 0.05 : 1}
                onChange={(e) => setQuorumValue(e.target.value)} />
            </FormField>
          )}
        </div>
        <FormField label="Tie-break">
          <select className={inputCls} value={tieBreak}
            onChange={(e) => setTieBreak(e.target.value as typeof tieBreak)}>
            <option value="chair">Chair decides</option>
            <option value="reject">Reject</option>
            <option value="escalate">Escalate</option>
          </select>
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            disabled={!name || create.isPending}
            loading={create.isPending}
            onClick={() => create.mutate({
              name, description: null, quorum_type: quorumType,
              quorum_value: quorumType === 'unanimous' ? null : Number(quorumValue),
              tie_break: tieBreak, allow_abstain: true,
            }, { onSuccess: onClose })}
          >
            Create
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates (stage builder)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, 'active' | 'pending' | 'inactive'> = {
  active: 'active', draft: 'inactive', pending_activation: 'pending', retired: 'inactive',
}

function TemplatesSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: templates = [] } = useApprovalTemplates()
  const { data: committees = [] } = useApprovalCommittees()
  const activate = useActivateTemplate()
  const [editing, setEditing] = useState(false)

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Workflow templates"
        subtitle="Compose your chain. Activation needs a second admin — dual control on governance changes."
        actions={isAdmin && <Btn icon={Plus} onClick={() => setEditing(true)}>New template</Btn>}
      />

      {templates.length === 0 ? (
        <EmptyState icon={GitBranch} title="No templates yet"
          description="Create your first approval chain to route bids, offer letters, or mandates." />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-ink/[0.07] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink text-[14px]">
                    {t.name} <span className="text-[11px] text-muted font-normal">v{t.version}</span>
                  </p>
                  <p className="text-[11px] text-muted uppercase tracking-wide mt-0.5">
                    {t.entity_type.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={STATUS_TONE[t.status] ?? 'inactive'} label={t.status.replace(/_/g, ' ')} />
                  {isAdmin && (t.status === 'draft' || t.status === 'pending_activation') && (
                    <Btn size="sm" variant="secondary" loading={activate.isPending}
                      onClick={() => activate.mutate(t.id)}>
                      {t.status === 'draft' ? 'Submit' : 'Activate (2nd admin)'}
                    </Btn>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {t.stages.map((s) => (
                  <span key={s.seq} className="flex items-center gap-1.5">
                    <span className="rounded-lg bg-ink/4 px-2 py-1 text-[11px] text-ink/70">
                      {s.seq}. {s.name}{s.sla_hours ? ` · ${s.sla_hours}h` : ''}
                    </span>
                    {s.seq < t.stages.length && <span className="text-ink/25">→</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateBuilderModal committees={committees} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

function TemplateBuilderModal({
  committees, onClose,
}: { committees: Committee[]; onClose: () => void }) {
  const create = useCreateTemplate()
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('bid')
  const [stages, setStages] = useState<StageDef[]>([])

  function addStage() {
    setStages((s) => [...s, {
      seq: s.length + 1, name: `Stage ${s.length + 1}`, stage_type: 'single',
      committee_id: null, approver_role: ROLES[0]!, sla_hours: 48, on_sla_breach: 'notify',
    }])
  }
  function updateStage(i: number, patch: Partial<StageDef>) {
    setStages((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)))
  }
  function removeStage(i: number) {
    setStages((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, seq: idx + 1 })))
  }
  function moveStage(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= stages.length) return
    setStages((s) => {
      const next = [...s]
      const a = next[i]
      const b = next[j]
      if (!a || !b) return s
      next[i] = b
      next[j] = a
      return next.map((st, idx) => ({ ...st, seq: idx + 1 }))
    })
  }

  const valid = name.length >= 2 && stages.length >= 1 && stages.every((s) =>
    (s.stage_type === 'committee' && s.committee_id) ||
    (s.stage_type !== 'committee' && s.approver_role))

  return (
    <Modal open onClose={onClose} title="New workflow template" width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Template name" required>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Secured lending > MUR 5M" />
          </FormField>
          <FormField label="Applies to">
            <select className={inputCls} value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}>
              <option value="bid">Marketplace bid</option>
              <option value="offer_letter">Offer letter release</option>
              <option value="countersign">Countersignature</option>
              <option value="investment_mandate">Investment mandate</option>
            </select>
          </FormField>
        </div>

        <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
          {stages.map((s, i) => (
            <div key={i} className="rounded-xl border border-ink/[0.08] p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ficium/10 text-[10px] font-bold text-ficium">
                    {s.seq}
                  </span>
                  <input
                    className="border-b border-transparent bg-transparent text-[13px] font-semibold text-ink focus:border-ficium focus:outline-hidden"
                    value={s.name} onChange={(e) => updateStage(i, { name: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-1 text-muted">
                  <button onClick={() => moveStage(i, -1)} aria-label="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => moveStage(i, 1)} aria-label="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeStage(i)} aria-label="Remove" className="text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[12px]">
                <select className={inputCls} value={s.stage_type}
                  onChange={(e) => updateStage(i, {
                    stage_type: e.target.value as StageType, committee_id: null, approver_role: ROLES[0],
                  })}>
                  {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {s.stage_type === 'committee' ? (
                  <select className={inputCls} value={s.committee_id ?? ''}
                    onChange={(e) => updateStage(i, { committee_id: e.target.value || null })}>
                    <option value="">Select committee…</option>
                    {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <select className={inputCls} value={s.approver_role ?? ''}
                    onChange={(e) => updateStage(i, { approver_role: e.target.value || null })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
                <input type="number" className={inputCls} placeholder="SLA hours"
                  value={s.sla_hours ?? ''}
                  onChange={(e) => updateStage(i, { sla_hours: e.target.value ? Number(e.target.value) : null })} />
                <select className={inputCls} value={s.on_sla_breach}
                  onChange={(e) => updateStage(i, { on_sla_breach: e.target.value as StageDef['on_sla_breach'] })}>
                  <option value="notify">Notify on breach</option>
                  <option value="auto_reject">Auto-reject</option>
                  <option value="escalate">Escalate</option>
                </select>
              </div>
            </div>
          ))}
          <button onClick={addStage}
            className="w-full rounded-xl border border-dashed border-ink/15 py-2.5 text-[12px] font-semibold text-muted hover:border-ficium hover:text-ficium">
            + Add stage
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            disabled={!valid || create.isPending}
            loading={create.isPending}
            onClick={() => create.mutate({ name, entity_type: entityType, stages }, { onSuccess: onClose })}
          >
            Save draft
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing (DoA matrix + simulator)
// ─────────────────────────────────────────────────────────────────────────────

function conditionPills(c: DoaConditions): string[] {
  const pills: string[] = []
  if (c.amount_min != null) pills.push(`≥ ${Number(c.amount_min).toLocaleString()}`)
  if (c.amount_max != null) pills.push(`≤ ${Number(c.amount_max).toLocaleString()}`)
  if (c.risk_tiers?.length) pills.push(`Tier ${c.risk_tiers.join('/')}`)
  if (c.secured === true) pills.push('Secured')
  if (c.secured === false) pills.push('Unsecured')
  return pills.length ? pills : ['Catch-all']
}

function RoutingSection({ isAdmin }: { isAdmin: boolean }) {
  const [entityType, setEntityType] = useState<EntityType>('bid')
  const { data: rules = [] } = useDoaRules(entityType)
  const { data: templates = [] } = useApprovalTemplates()
  const createRule = useCreateDoaRule(entityType)
  const simulate = useSimulateRouting()

  const [priority, setPriority] = useState('10')
  const [amountMax, setAmountMax] = useState('')
  const [secured, setSecured] = useState<'any' | 'yes' | 'no'>('any')
  const [templateId, setTemplateId] = useState('')

  const [simAmount, setSimAmount] = useState('')
  const [simTier, setSimTier] = useState('')
  const [simSecured, setSimSecured] = useState<'yes' | 'no'>('no')

  const activeTemplates = templates.filter((t) => t.status === 'active' && t.entity_type === entityType)

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <SectionHeader title="Routing" subtitle="Rules evaluate top-down; first match wins. The catch-all (priority 9999) is pinned." />

        <select className={inputCls + ' max-w-xs'} value={entityType}
          onChange={(e) => setEntityType(e.target.value as EntityType)}>
          <option value="bid">Marketplace bids</option>
          <option value="offer_letter">Offer letters</option>
          <option value="investment_mandate">Investment mandates</option>
        </select>

        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className={`flex items-center justify-between rounded-xl border p-3 ${
              r.priority === 9999 ? 'border-dashed border-ink/12 bg-ink/[0.015]' : 'border-ink/[0.07] bg-white'
            }`}>
              <div className="flex items-center gap-3">
                <span className="w-9 text-[11px] text-muted">#{r.priority}</span>
                <div className="flex flex-wrap gap-1">
                  {conditionPills(r.conditions).map((p, i) => (
                    <span key={i} className="rounded-full bg-ficium/8 text-ficium px-2 py-0.5 text-[11px]">{p}</span>
                  ))}
                </div>
              </div>
              <span className="text-[13px] font-semibold text-ink">→ {r.template_name}</span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="rounded-xl border border-dashed border-ink/12 p-3.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Add rule</p>
            <div className="flex flex-wrap items-end gap-2">
              <FormField label="Priority"><input type="number" min={1} max={9998} className={inputCls + ' w-20'}
                value={priority} onChange={(e) => setPriority(e.target.value)} /></FormField>
              <FormField label="Max amount (MUR)"><input type="number" className={inputCls + ' w-36'}
                value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="any" /></FormField>
              <FormField label="Secured">
                <select className={inputCls} value={secured} onChange={(e) => setSecured(e.target.value as typeof secured)}>
                  <option value="any">Any</option><option value="yes">Secured</option><option value="no">Unsecured</option>
                </select>
              </FormField>
              <FormField label="Route to">
                <select className={inputCls + ' min-w-48'} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Select template…</option>
                  {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </FormField>
              <Btn
                disabled={!templateId || createRule.isPending}
                loading={createRule.isPending}
                onClick={() => {
                  const conditions: DoaConditions = {}
                  if (amountMax) conditions.amount_max = Number(amountMax)
                  if (secured !== 'any') conditions.secured = secured === 'yes'
                  createRule.mutate({ priority: Number(priority), conditions, template_id: templateId })
                }}
              >
                Add
              </Btn>
            </div>
          </div>
        )}
      </div>

      <aside className="h-fit rounded-xl border border-ink/[0.07] bg-white p-4">
        <p className="font-semibold text-ink text-[13px]">Simulator</p>
        <p className="text-[11px] text-muted mt-0.5">Runs the exact production evaluator.</p>
        <div className="mt-3 space-y-2.5">
          <FormField label="Amount (MUR)"><input type="number" className={inputCls}
            value={simAmount} onChange={(e) => setSimAmount(e.target.value)} /></FormField>
          <FormField label="Risk tier"><input className={inputCls}
            value={simTier} onChange={(e) => setSimTier(e.target.value)} placeholder="A–E" /></FormField>
          <FormField label="Secured">
            <select className={inputCls} value={simSecured} onChange={(e) => setSimSecured(e.target.value as typeof simSecured)}>
              <option value="no">Unsecured</option><option value="yes">Secured</option>
            </select>
          </FormField>
          <Btn className="w-full" loading={simulate.isPending}
            onClick={() => simulate.mutate({
              entity_type: entityType,
              amount: simAmount ? Number(simAmount) : undefined,
              risk_tier: simTier || undefined,
              secured: simSecured === 'yes',
            })}
          >
            Test routing
          </Btn>
        </div>

        {simulate.data?.template && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-[12px]">
            <p className="text-emerald-700 text-[11px]">Matched rule #{simulate.data.rule_priority}</p>
            <p className="font-semibold text-ink">{simulate.data.template.name}</p>
            <ol className="mt-1 space-y-0.5 text-[11px] text-muted">
              {simulate.data.template.stages.map((s) => (
                <li key={s.seq}>{s.seq}. {s.name}{s.sla_hours ? ` (${s.sla_hours}h)` : ''}</li>
              ))}
            </ol>
          </div>
        )}
        {simulate.isError && (
          <InlineAlert variant="error">No rule matched — the catch-all is missing.</InlineAlert>
        )}
      </aside>
    </div>
  )
}
