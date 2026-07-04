/**
 * @page InstitutionProducts
 * @route /products
 * @module inst:products
 * @description
 *   Product catalogue with per-institution rate/amount limits and benefits.
 *   Each product expands to show:
 *     1. Institution-level limits (rate, amount overrides)
 *     2. Benefits — perks shown to clients on bids for this product
 *
 * @owner Ficium Engineering
 */

import { useState } from "react";
import {
  Package, Check, ChevronDown, ChevronUp, Lock,
  Gift, Plus, Shield, Star, Zap, Tag, Percent,
  Users, ToggleRight, ToggleLeft,
} from "lucide-react";
import {
  useProducts, useMyInstitution,
  useBenefits, useCreateBenefit, useUpdateBenefit,
  useDeactivateBenefit, useBenefitCategories,
} from "@/institution/hooks/useInstitution";
import type { Product, Benefit } from "@/institution/types/institution";
import { institutionSupabase } from "@/institution/lib/institutionSupabase";
import {
  SectionHeader, FilterPills, EmptyState, InlineAlert,
  FormField, inputCls, Btn, Modal,
} from "@/institution/components/primitives";

// ─── Helpers ──────────────────────────────────────────────────

function fmtRate(r: number | null | undefined) {
  return r != null ? `${(r * 100).toFixed(2)}%` : "—";
}
function fmtAmt(a: number | null | undefined) {
  return a != null ? `MUR ${Number(a).toLocaleString()}` : "—";
}

type LimitMap = Record<string, { minRate: string; maxRate: string; minAmount: string; maxAmount: string }>;
const emptyLimit = () => ({ minRate: "", maxRate: "", minAmount: "", maxAmount: "" });

const CAT_ICONS: Record<string, React.ElementType> = {
  fee_waiver:       Tag,
  rate_discount:    Percent,
  insurance:        Shield,
  relationship_mgr: Users,
  fast_track:       Zap,
  reward:           Gift,
  bundled_product:  Package,
  other:            Star,
};

// ─── BenefitChip — compact card inside product panel ──────────

function BenefitChip({
  benefit,
  onToggle,
}: {
  benefit: Benefit;
  onToggle: (b: Benefit) => void;
}) {
  const Icon = CAT_ICONS[benefit.cat_code] ?? Star;
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border bg-white transition-opacity ${
      benefit.is_active ? "border-ink/[0.07]" : "border-ink/4 opacity-50"
    }`}>
      <div className="w-7 h-7 rounded-lg bg-ficium/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-ficium" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-ink truncate">{benefit.title}</span>
          {benefit.is_guaranteed && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              GUARANTEED
            </span>
          )}
        </div>
        {benefit.value_display && (
          <p className="text-[11px] text-muted mt-0.5">{benefit.value_display}</p>
        )}
        {benefit.conditions && (
          <p className="text-[10px] text-muted/70 italic mt-0.5">{benefit.conditions}</p>
        )}
      </div>
      <button
        onClick={() => onToggle(benefit)}
        className="shrink-0 text-muted hover:text-ink transition-colors mt-0.5"
        title={benefit.is_active ? "Deactivate" : "Activate"}
      >
        {benefit.is_active
          ? <ToggleRight size={16} className="text-ficium" />
          : <ToggleLeft size={16} />}
      </button>
    </div>
  );
}

// ─── BenefitForm ──────────────────────────────────────────────

function BenefitForm({
  productId,
  productLabel,
  onSubmit,
  loading,
  error,
  onClose,
}: {
  productId:    string;
  productLabel: string;
  onSubmit:     (data: Partial<Benefit>) => void;
  loading:      boolean;
  error?:       string | null;
  onClose:      () => void;
}) {
  const { data: cats = [] } = useBenefitCategories();
  const [form, setForm] = useState({
    cat_id:        "",
    title:         "",
    description:   "",
    value_display: "",
    is_guaranteed: false,
    conditions:    "",
    valid_until:   "",
  });
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <div className="text-[12px] text-muted bg-ficium/5 rounded-xl px-3 py-2">
        This benefit will appear on all bids for <strong className="text-ink">{productLabel}</strong>.
      </div>

      <FormField label="Category *">
        <select className={inputCls} value={form.cat_id} onChange={e => set("cat_id", e.target.value)}>
          <option value="">Select category</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </FormField>

      <FormField label="Title *">
        <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)}
          placeholder="e.g. Free Life Insurance" maxLength={100} />
      </FormField>

      <FormField label="Value shown to client">
        <input className={inputCls} value={form.value_display} onChange={e => set("value_display", e.target.value)}
          placeholder="e.g. Up to MUR 2,000,000" />
      </FormField>

      <FormField label="Conditions">
        <input className={inputCls} value={form.conditions} onChange={e => set("conditions", e.target.value)}
          placeholder="e.g. For loans above MUR 500,000" />
      </FormField>

      <FormField label="Expires on">
        <input type="date" className={inputCls} value={form.valid_until} onChange={e => set("valid_until", e.target.value)} />
      </FormField>

      <div
        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
          form.is_guaranteed ? "border-emerald-200 bg-emerald-50" : "border-ink/[0.07] hover:bg-ink/2"
        }`}
        onClick={() => set("is_guaranteed", !form.is_guaranteed)}
      >
        <input type="checkbox" className="mt-0.5" checked={form.is_guaranteed} onChange={() => set("is_guaranteed", !form.is_guaranteed)} />
        <div>
          <p className="text-[13px] font-semibold text-ink">Guaranteed benefit</p>
          <p className="text-[11px] text-muted">Contractual — shown with a guarantee badge. Requires checker approval.</p>
        </div>
      </div>

      {form.is_guaranteed && (
        <InlineAlert variant="info">Will be submitted to your checker for approval before appearing on bids.</InlineAlert>
      )}

      <div className="flex gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={loading}
          disabled={!form.cat_id || !form.title?.trim()}
          onClick={() => {
            if (!form.cat_id) return;
            onSubmit({
              ...form,
              product_id:  productId,
              valid_until: form.valid_until || undefined,
              conditions:  form.conditions  || undefined,
            });
          }}
        >
          Add benefit
        </Btn>
      </div>
    </div>
  );
}

// ─── ProductBenefits — benefits section inside expanded panel ─

function ProductBenefits({
  product,
  allBenefits,
}: {
  product:     Product;
  allBenefits: Benefit[];
}) {
  const createBenefit     = useCreateBenefit();
  const updateBenefit     = useUpdateBenefit();
  const deactivateBenefit = useDeactivateBenefit();

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Benefits specific to this product OR global (applies to all)
  const productBenefits = allBenefits.filter(b => b.product_id === product.id);
  const globalBenefits  = allBenefits.filter(b => b.product_id === null && b.is_active);

  const handleSubmit = async (data: Partial<Benefit>) => {
    setFormError(null);
    try {
      await createBenefit.mutateAsync(data);
      setShowForm(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const handleToggle = async (benefit: Benefit) => {
    if (benefit.is_active) {
      await deactivateBenefit.mutateAsync(benefit.id);
    } else {
      await updateBenefit.mutateAsync({ id: benefit.id, is_active: true });
    }
  };

  return (
    <div className="mt-6 pt-5 border-t border-ink/6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-ink">Benefits</p>
          <p className="text-[12px] text-muted">
            Perks shown to clients on your <strong>{product.label}</strong> bids
          </p>
        </div>
        <Btn variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          <Plus size={13} /> Add benefit
        </Btn>
      </div>

      {/* Product-specific benefits */}
      {productBenefits.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-3">
          {productBenefits.map(b => (
            <BenefitChip key={b.id} benefit={b} onToggle={handleToggle} />
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted/60 italic mb-3">
          No benefits added for this product yet.
        </p>
      )}

      {/* Global benefits hint */}
      {globalBenefits.length > 0 && (
        <div className="bg-ink/2 rounded-xl px-4 py-3 border border-ink/4">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">
            Also applies — all products
          </p>
          <div className="flex flex-wrap gap-2">
            {globalBenefits.map(b => {
              const Icon = CAT_ICONS[b.cat_code] ?? Star;
              return (
                <div key={b.id} className="flex items-center gap-1.5 text-[11px] text-muted bg-white border border-ink/6 px-2 py-1 rounded-lg">
                  <Icon size={11} className="text-ficium" />
                  {b.title}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={showForm}
        title={`Add benefit — ${product.label}`}
        onClose={() => { setShowForm(false); setFormError(null); }}
      >
        <BenefitForm
          productId={product.id}
          productLabel={product.label}
          onSubmit={handleSubmit}
          loading={createBenefit.isPending}
          error={formError}
          onClose={() => { setShowForm(false); setFormError(null); }}
        />
      </Modal>
    </div>
  );
}

// ─── ProductRow ───────────────────────────────────────────────

function ProductRow({
  product, licensed, limits, saved, onLimitChange, onSave, allBenefits,
}: {
  product:       Product;
  licensed:      boolean;
  limits:        { minRate: string; maxRate: string; minAmount: string; maxAmount: string };
  saved:         boolean;
  onLimitChange: (field: string, value: string) => void;
  onSave:        () => Promise<void>;
  allBenefits:   Benefit[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const rc = product.rate_config as {
    min_rate?: number | null; max_rate?: number | null;
    min_amount?: number | null; max_amount?: number | null;
    min_term_months?: number | null; max_term_months?: number | null;
  } | undefined;

  const handleSave = async () => { setSaving(true); await onSave(); setSaving(false); };

  return (
    <div className={[
      "bg-white rounded-xl border overflow-hidden transition-all",
      licensed ? "border-ink/[0.07] hover:border-ink/15" : "border-ink/5 opacity-70",
    ].join(" ")}>

      {/* Header row */}
      <div
        className="flex items-center px-5 py-4 gap-4 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
        role="button" aria-expanded={expanded} tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setExpanded(v => !v)}
      >
        <div className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-ficium" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[14px] text-ink">{product.label}</span>
            {licensed
              ? <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Licensed</span>
              : <span className="text-[10px] font-bold bg-ink/5 text-muted border border-ink/8 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-2.5 h-2.5" />Not licensed</span>
            }
            {product.family_label && (
              <span className="text-[10px] text-muted bg-ink/4 px-2 py-0.5 rounded-full">{product.family_label}</span>
            )}
          </div>
          <code className="text-[11px] text-muted font-mono mt-0.5 block">{product.code}</code>
        </div>

        {rc && (
          <div className="hidden lg:flex items-center gap-8 text-[12px] shrink-0">
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Platform rate</div>
              <div className="font-semibold text-ink">{fmtRate(rc.min_rate)} – {fmtRate(rc.max_rate)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Amount range</div>
              <div className="font-semibold text-ink">{fmtAmt(rc.min_amount)} – {fmtAmt(rc.max_amount)}</div>
            </div>
            {rc.min_term_months != null && (
              <div>
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Term</div>
                <div className="font-semibold text-ink">{rc.min_term_months}–{rc.max_term_months}m</div>
              </div>
            )}
          </div>
        )}

        {/* Benefit count badge */}
        {(() => {
          const count = allBenefits.filter(b => b.product_id === product.id && b.is_active).length;
          return count > 0 ? (
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-ficium bg-ficium/8 px-2 py-1 rounded-full shrink-0">
              <Gift size={11} /> {count} benefit{count !== 1 ? "s" : ""}
            </div>
          ) : null;
        })()}

        {expanded ? <ChevronUp className="w-4 h-4 text-muted shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted shrink-0" />}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-ink/[0.07] px-5 py-5 bg-ink/1">
          {licensed ? (
            <>
              {/* Limits section */}
              <p className="text-[13px] font-semibold text-ink mb-1">Institution-level limits</p>
              <p className="text-[12px] text-muted mb-4">
                Override platform defaults within the caps shown above. Leave blank to use platform defaults.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { field: "minRate",   label: "Min rate (%)",     placeholder: rc?.min_rate   ? `${(rc.min_rate * 100).toFixed(2)}` : "e.g. 7.5"     },
                  { field: "maxRate",   label: "Max rate (%)",     placeholder: rc?.max_rate   ? `${(rc.max_rate * 100).toFixed(2)}` : "e.g. 18.0"    },
                  { field: "minAmount", label: "Min amount (MUR)", placeholder: rc?.min_amount ? `${rc.min_amount}` : "e.g. 50000"   },
                  { field: "maxAmount", label: "Max amount (MUR)", placeholder: rc?.max_amount ? `${rc.max_amount}` : "e.g. 2000000" },
                ].map(({ field, label, placeholder }) => (
                  <FormField key={field} label={label}>
                    <input
                      type="number"
                      value={(limits as Record<string, string>)[field]}
                      onChange={e => onLimitChange(field, e.target.value)}
                      placeholder={placeholder}
                      className={inputCls}
                    />
                  </FormField>
                ))}
              </div>
              <Btn variant="primary" size="sm" icon={saved ? Check : undefined} onClick={handleSave} loading={saving}>
                {saved ? "Saved" : "Save limits"}
              </Btn>

              {/* Benefits section */}
              <ProductBenefits product={product} allBenefits={allBenefits} />
            </>
          ) : (
            <p className="text-[13px] text-muted">
              This product requires the <code className="font-mono text-ficium">marketplace</code> module.
              Contact your Ficium account manager to enable it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────

export default function InstitutionProducts() {
  const { data: products = [],   isLoading } = useProducts();
  const { data: institution }                = useMyInstitution();
  const { data: benefits = [],   isLoading: benefitsLoading } = useBenefits();

  const [familyFilter, setFamilyFilter] = useState("all");
  const [limits,       setLimits]       = useState<LimitMap>({});
  const [saved,        setSaved]        = useState<Record<string, boolean>>({});

  const modules  = institution?.modules ?? [];
  const families = Array.from(new Set(products.map(p => p.family_label ?? "Other")));

  const filtered = products.filter(
    p => familyFilter === "all" || (p.family_label ?? "Other") === familyFilter
  );

  const familyOptions = [
    { key: "all", label: "All products" },
    ...families.map(f => ({ key: f, label: f })),
  ];

  const getLimits = (id: string) => limits[id] ?? emptyLimit();
  const setLimit  = (id: string, field: string, val: string) =>
    setLimits(prev => ({ ...prev, [id]: { ...getLimits(id), [field]: val } }));

  const saveLimits = async (product: { id: string }) => {
    const l = getLimits(product.id);
    await institutionSupabase
      .from("institution_product_config")
      .upsert({
        product_id:  product.id,
        enabled:     true,
        min_rate:    l.minRate   ? parseFloat(l.minRate)   / 100 : null,
        max_rate:    l.maxRate   ? parseFloat(l.maxRate)   / 100 : null,
        min_amount:  l.minAmount ? parseFloat(l.minAmount)       : null,
        max_amount:  l.maxAmount ? parseFloat(l.maxAmount)       : null,
      }, { onConflict: "institution_id,product_id" });
    setSaved(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [product.id]: false })), 2500);
  };

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <SectionHeader
        title="Products"
        subtitle={`${filtered.length} product${filtered.length !== 1 ? "s" : ""} · configure limits and benefits`}
      />

      <InlineAlert variant="info">
        Platform-level caps are set by Ficium. Your limits must fall within those caps. Benefits are shown to clients on every bid you submit for that product.
      </InlineAlert>

      <div className="my-5">
        <FilterPills options={familyOptions} value={familyFilter} onChange={setFamilyFilter} />
      </div>

      {isLoading || benefitsLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-ink/6 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-ink/6 rounded-sm" />
                  <div className="h-3 w-20 bg-ink/4 rounded-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="No products found" description="Products appear here once configured by Ficium" />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <ProductRow
              key={p.id}
              product={p}
              licensed={modules.includes("marketplace")}
              limits={getLimits(p.id)}
              saved={!!saved[p.id]}
              onLimitChange={(field, val) => setLimit(p.id, field, val)}
              onSave={() => saveLimits(p)}
              allBenefits={benefits}
            />
          ))}
        </div>
      )}
    </main>
  );
}
