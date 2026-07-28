/**
 * @page InstitutionBenefits
 * @route /benefits
 * @module inst:benefits
 * @description
 *   Institution benefit management. Members define perks shown to clients
 *   on bid cards (free insurance, rate discounts, relationship manager, etc.).
 *
 *   Write model:
 *     - is_guaranteed=true  → maker-checker (pending_actions) — contractual
 *     - is_guaranteed=false → direct insert — discretionary perk
 *
 *   Bank-grade guarantees:
 *     - All writes institution-scoped via JWT (never body-supplied institution_id)
 *     - RLS enforced at DB layer (institution.benefit)
 *     - Soft-delete only (bid_benefit snapshots preserved)
 *
 * @owner Ficium Engineering
 */

import { useState } from 'react'
import {
  Gift, Plus, Shield, Star, Zap, Tag, Percent,
  Users, Package, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  useBenefits, useCreateBenefit, useUpdateBenefit,
  useDeactivateBenefit, useBenefitCategories, useProducts,
} from '@/institution/hooks/useInstitution'
import type { Benefit, Product } from '@/institution/types/institution'
import {
  SectionHeader, EmptyState, Modal, FormField,
  inputCls, Btn, InlineAlert, SkeletonRow,
} from '@/institution/components/primitives'

// ─── Icon map for benefit categories ──────────────────────────
const CAT_ICONS: Record<string, React.ElementType> = {
  fee_waiver:       Tag,
  rate_discount:    Percent,
  insurance:        Shield,
  relationship_mgr: Users,
  fast_track:       Zap,
  reward:           Gift,
  bundled_product:  Package,
  other:            Star,
}

// ─── BenefitCard ──────────────────────────────────────────────
function BenefitCard({
  benefit,
  onEdit,
  onToggle,
}: {
  benefit:  Benefit
  onEdit:   (b: Benefit) => void
  onToggle: (b: Benefit) => void
}) {
  const Icon = CAT_ICONS[benefit.cat_code] ?? Star

  return (
    <div className={`bg-white rounded-xl border transition-opacity ${
      benefit.is_active ? 'border-ink/[0.07]' : 'border-ink/4 opacity-60'
    }`}>
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="w-9 h-9 rounded-lg bg-ficium/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon size={16} className="text-ficium" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[14px] text-ink">{benefit.title}</span>
            {benefit.is_guaranteed && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                GUARANTEED
              </span>
            )}
            {!benefit.is_active && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-ink/5 text-muted">
                INACTIVE
              </span>
            )}
          </div>
          {benefit.description && (
            <p className="text-[12px] text-muted mt-0.5 line-clamp-2">{benefit.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-[11px] text-muted">{benefit.cat_label}</span>
            {benefit.product_label && (
              <span className="text-[11px] text-ficium bg-ficium/5 px-2 py-0.5 rounded-full">
                {benefit.product_label}
              </span>
            )}
            {benefit.value_display && (
              <span className="text-[11px] font-medium text-ink">{benefit.value_display}</span>
            )}
            {benefit.valid_until && (
              <span className="text-[11px] text-amber-600">
                Expires {new Date(benefit.valid_until).toLocaleDateString()}
              </span>
            )}
          </div>
          {benefit.conditions && (
            <p className="text-[11px] text-muted mt-1 italic">{benefit.conditions}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(benefit)}
            className="px-3 py-1.5 text-[11px] font-medium text-muted hover:text-ink rounded-lg hover:bg-ink/5 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onToggle(benefit)}
            className="p-1.5 text-muted hover:text-ink rounded-lg hover:bg-ink/5 transition-colors"
            title={benefit.is_active ? 'Deactivate' : 'Activate'}
          >
            {benefit.is_active
              ? <ToggleRight size={18} className="text-ficium" />
              : <ToggleLeft size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── BenefitForm ──────────────────────────────────────────────
interface BenefitFormProps {
  initial?: Partial<Benefit>
  onSubmit: (data: Partial<Benefit>) => void
  loading:  boolean
  error?:   string | null
  onClose:  () => void
}

function BenefitForm({ initial, onSubmit, loading, error, onClose }: BenefitFormProps) {
  const { data: cats = [] }     = useBenefitCategories()
  const { data: products = [] } = useProducts()

  const [form, setForm] = useState({
    cat_id:        initial?.cat_id        ?? '',
    product_id:    initial?.product_id    ?? '',
    title:         initial?.title         ?? '',
    description:   initial?.description   ?? '',
    value_display: initial?.value_display ?? '',
    is_guaranteed: initial?.is_guaranteed ?? false,
    conditions:    initial?.conditions    ?? '',
    valid_from:    initial?.valid_from    ?? '',
    valid_until:   initial?.valid_until   ?? '',
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <FormField label="Category *">
        <select
          className={inputCls}
          value={form.cat_id}
          onChange={e => set('cat_id', e.target.value)}
        >
          <option value="">Select category</option>
          {cats.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Title *">
        <input
          className={inputCls}
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="e.g. Free Life Insurance"
          maxLength={100}
        />
      </FormField>

      <FormField label="Description">
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Brief description shown to clients"
        />
      </FormField>

      <FormField label="Value (display)">
        <input
          className={inputCls}
          value={form.value_display}
          onChange={e => set('value_display', e.target.value)}
          placeholder="e.g. Up to MUR 2,000,000"
        />
      </FormField>

      <FormField label="Product (optional — leave blank for all products)">
        <select
          className={inputCls}
          value={form.product_id}
          onChange={e => set('product_id', e.target.value)}
        >
          <option value="">All products</option>
          {products.map((p: Product) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Conditions">
        <input
          className={inputCls}
          value={form.conditions}
          onChange={e => set('conditions', e.target.value)}
          placeholder="e.g. Applicable on loans above MUR 500,000"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Valid from">
          <input
            type="date"
            className={inputCls}
            value={form.valid_from}
            onChange={e => set('valid_from', e.target.value)}
          />
        </FormField>
        <FormField label="Valid until">
          <input
            type="date"
            className={inputCls}
            value={form.valid_until}
            onChange={e => set('valid_until', e.target.value)}
          />
        </FormField>
      </div>

      <div
        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
          form.is_guaranteed
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-ink/[0.07] bg-ink/2 hover:bg-ink/4'
        }`}
        onClick={() => set('is_guaranteed', !form.is_guaranteed)}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.is_guaranteed}
          onChange={() => set('is_guaranteed', !form.is_guaranteed)}
        />
        <div>
          <p className="text-[13px] font-semibold text-ink">Guaranteed benefit</p>
          <p className="text-[11px] text-muted mt-0.5">
            Contractual commitment shown with a guarantee badge. Requires checker approval before publishing.
          </p>
        </div>
      </div>

      {form.is_guaranteed && (
        <InlineAlert variant="info">
          This benefit will be submitted for checker approval before it appears on bids.
        </InlineAlert>
      )}

      <div className="flex gap-2 pt-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          loading={loading}
          onClick={() => onSubmit({
            ...form,
            product_id:  form.product_id  || undefined,
            valid_from:  form.valid_from  || undefined,
            valid_until: form.valid_until || undefined,
            conditions:  form.conditions  || undefined,
          })}
        >
          {initial?.id ? 'Save changes' : 'Add benefit'}
        </Btn>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function InstitutionBenefits() {
  const { data: benefits = [], isLoading } = useBenefits()
  const createBenefit     = useCreateBenefit()
  const updateBenefit     = useUpdateBenefit()
  const deactivateBenefit = useDeactivateBenefit()

  const [showForm, setShowForm]         = useState(false)
  const [editing, setEditing]           = useState<Benefit | null>(null)
  const [formError, setFormError]       = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const active   = benefits.filter(b => b.is_active)
  const inactive = benefits.filter(b => !b.is_active)
  const displayed = showInactive ? benefits : active

  const handleSubmit = async (data: Partial<Benefit>) => {
    setFormError(null)
    try {
      if (editing) {
        const res = await updateBenefit.mutateAsync({ id: editing.id, ...data }) as { pending?: boolean }
        if (res.pending) { setShowForm(false); setEditing(null); return }
      } else {
        await createBenefit.mutateAsync(data)
      }
      setShowForm(false)
      setEditing(null)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  const handleToggle = async (benefit: Benefit) => {
    if (benefit.is_active) {
      await deactivateBenefit.mutateAsync(benefit.id)
    } else {
      await updateBenefit.mutateAsync({ id: benefit.id, is_active: true })
    }
  }

  const openCreate = () => { setEditing(null); setShowForm(true) }
  const closeForm  = () => { setShowForm(false); setEditing(null); setFormError(null) }

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <SectionHeader
        title="Benefits"
        subtitle="Define perks shown to clients on your bid cards. Guaranteed benefits require checker approval."
        actions={
          <Btn variant="primary" onClick={openCreate}>
            <Plus size={14} />
            Add benefit
          </Btn>
        }
      />

      {isLoading && (
        <div className="space-y-2">
          <SkeletonRow cols={1} />
          <SkeletonRow cols={1} />
          <SkeletonRow cols={1} />
        </div>
      )}

      {!isLoading && displayed.length === 0 && (
        <EmptyState
          icon={Gift}
          title="No benefits yet"
          description="Add perks to differentiate your bids — free insurance, rate discounts, relationship manager access, and more."
          action={<Btn variant="primary" onClick={openCreate}><Plus size={14} /> Add first benefit</Btn>}
        />
      )}

      {!isLoading && displayed.length > 0 && (
        <div className="space-y-2">
          {displayed.map(b => (
            <BenefitCard
              key={b.id}
              benefit={b}
              onEdit={benefit => { setEditing(benefit); setShowForm(true) }}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <button
          onClick={() => setShowInactive(v => !v)}
          className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink transition-colors"
        >
          {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showInactive ? 'Hide' : 'Show'} {inactive.length} inactive benefit{inactive.length !== 1 ? 's' : ''}
        </button>
      )}

      <Modal open={showForm} title={editing ? 'Edit benefit' : 'Add benefit'} onClose={closeForm}>
        <BenefitForm
          initial={editing ?? undefined}
          onSubmit={handleSubmit}
          loading={createBenefit.isPending || updateBenefit.isPending}
          error={formError}
          onClose={closeForm}
        />
      </Modal>
    </main>
  )
}
