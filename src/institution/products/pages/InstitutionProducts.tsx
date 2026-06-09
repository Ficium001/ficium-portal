/**
 * @page InstitutionProducts
 * @route /products
 * @access protected — admin, analyst
 * @description
 *   Product catalogue with per-institution rate and amount limits.
 *   Shows all platform products with their global caps; allows
 *   admins to configure institution-level overrides within those caps.
 *
 *   Per-product config is stored in institution_product_config and
 *   does NOT require maker-checker (read-only risk). Any change is
 *   still appended to audit_events.
 *
 * @dataSource
 *   useProducts        → products + product_rate_config (1 hr cache)
 *   useMyInstitution   → institutions table (5 min cache)
 *   institutionSupabase → institution_product_config upsert (direct)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState } from "react";
import { Package, Check, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useProducts, useMyInstitution } from "../../hooks/useInstitution";
import type { Product } from "../../types/institution";
import { institutionSupabase } from "../../lib/institutionSupabase";
import {
  SectionHeader, FilterPills, EmptyState, InlineAlert,
  FormField, inputCls, Btn,
} from "../../components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtRate(r: number | null | undefined): string {
  return r != null ? `${(r * 100).toFixed(2)}%` : "—";
}
function fmtAmt(a: number | null | undefined): string {
  return a != null ? `MUR ${Number(a).toLocaleString()}` : "—";
}

type LimitMap = Record<string, { minRate: string; maxRate: string; minAmount: string; maxAmount: string }>;
const emptyLimit = () => ({ minRate: "", maxRate: "", minAmount: "", maxAmount: "" });

// ─────────────────────────────────────────────────────────────────────────────
// ProductRow — single expandable product entry
// ─────────────────────────────────────────────────────────────────────────────

function ProductRow({
  product,
  licensed,
  limits,
  saved,
  onLimitChange,
  onSave,
}: {
  product:       Product;
  licensed:      boolean;
  limits:        { minRate: string; maxRate: string; minAmount: string; maxAmount: string };
  saved:         boolean;
  onLimitChange: (field: string, value: string) => void;
  onSave:        () => Promise<void>;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [saving,   setSaving]     = useState(false);

  const rc = product.rate_config as {
    min_rate?:      number | null;
    max_rate?:      number | null;
    min_amount?:    number | null;
    max_amount?:    number | null;
    min_term_months?: number | null;
    max_term_months?: number | null;
  } | undefined;

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
  };

  return (
    <div
      className={[
        "bg-white rounded-xl border overflow-hidden transition-all",
        licensed ? "border-ink/[0.07] hover:border-ink/[0.15]" : "border-ink/[0.05] opacity-70",
      ].join(" ")}
    >
      {/* Row header */}
      <div
        className="flex items-center px-5 py-4 gap-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${product.label} — ${licensed ? "licensed" : "not licensed"}`}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      >
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-ficium" aria-hidden />
        </div>

        {/* Name + code */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[14px] text-ink">{product.label}</span>
            {licensed
              ? <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Licensed</span>
              : <span className="text-[10px] font-bold bg-ink/5 text-muted border border-ink/[0.08] px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-2.5 h-2.5" />Not licensed</span>
            }
            {product.family_label && (
              <span className="text-[10px] text-muted bg-ink/[0.04] px-2 py-0.5 rounded-full">
                {product.family_label}
              </span>
            )}
          </div>
          <code className="text-[11px] text-muted font-mono mt-0.5 block">{product.code}</code>
        </div>

        {/* Platform caps preview */}
        {rc && (
          <div className="hidden lg:flex items-center gap-8 text-[12px] flex-shrink-0">
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                Platform rate
              </div>
              <div className="font-semibold text-ink">
                {fmtRate(rc.min_rate)} – {fmtRate(rc.max_rate)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                Amount range
              </div>
              <div className="font-semibold text-ink">
                {fmtAmt(rc.min_amount)} – {fmtAmt(rc.max_amount)}
              </div>
            </div>
            {rc.min_term_months != null && (
              <div>
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                  Term
                </div>
                <div className="font-semibold text-ink">
                  {rc.min_term_months}–{rc.max_term_months}m
                </div>
              </div>
            )}
          </div>
        )}

        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
        }
      </div>

      {/* Expanded config panel */}
      {expanded && (
        <div className="border-t border-ink/[0.07] px-5 py-5 bg-cream/40">
          {licensed ? (
            <>
              <p className="text-[13px] font-semibold text-ink mb-1">
                Institution-level limits
              </p>
              <p className="text-[12px] text-muted mb-4">
                Override platform defaults within the caps shown above. Leave blank to use platform defaults.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { field: "minRate",   label: "Min rate (%)",    placeholder: rc?.min_rate ? `${(rc.min_rate * 100).toFixed(2)}` : "e.g. 7.5"     },
                  { field: "maxRate",   label: "Max rate (%)",    placeholder: rc?.max_rate ? `${(rc.max_rate * 100).toFixed(2)}` : "e.g. 18.0"    },
                  { field: "minAmount", label: "Min amount (MUR)",placeholder: rc?.min_amount ? `${rc.min_amount}` : "e.g. 50000"   },
                  { field: "maxAmount", label: "Max amount (MUR)",placeholder: rc?.max_amount ? `${rc.max_amount}` : "e.g. 2000000" },
                ].map(({ field, label, placeholder }) => (
                  <FormField key={field} label={label}>
                    <input
                      type="number"
                      value={(limits as Record<string, string>)[field]}
                      onChange={(e) => onLimitChange(field, e.target.value)}
                      placeholder={placeholder}
                      className={inputCls}
                    />
                  </FormField>
                ))}
              </div>
              <Btn
                variant="primary"
                size="sm"
                icon={saved ? Check : undefined}
                onClick={handleSave}
                loading={saving}
              >
                {saved ? "Saved" : "Save limits"}
              </Btn>
            </>
          ) : (
            <p className="text-[13px] text-muted">
              This product requires the{" "}
              <code className="font-mono text-ficium">marketplace</code> module.
              Contact your Ficium account manager to enable it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionProducts() {
  const { data: products = [], isLoading } = useProducts();
  const { data: institution }              = useMyInstitution();

  const [familyFilter, setFamilyFilter] = useState("all");
  const [limits,       setLimits]       = useState<LimitMap>({});
  const [saved,        setSaved]        = useState<Record<string, boolean>>({});

  const modules  = institution?.modules ?? [];
  const families = Array.from(new Set(products.map((p) => p.family_label ?? "Other")));

  const filtered = products.filter(
    (p) => familyFilter === "all" || (p.family_label ?? "Other") === familyFilter
  );

  const familyOptions = [
    { key: "all", label: "All products" },
    ...families.map((f) => ({ key: f, label: f })),
  ];

  const getLimits = (id: string) => limits[id] ?? emptyLimit();

  const setLimit = (id: string, field: string, val: string) =>
    setLimits((prev) => ({
      ...prev,
      [id]: { ...getLimits(id), [field]: val },
    }));

  const saveLimits = async (product: { id: string }) => {
    const l = getLimits(product.id);
    await institutionSupabase
      .from("institution_product_config")
      .upsert({
        product_id:  product.id,
        enabled:     true,
        min_rate:    l.minRate    ? parseFloat(l.minRate)    / 100 : null,
        max_rate:    l.maxRate    ? parseFloat(l.maxRate)    / 100 : null,
        min_amount:  l.minAmount  ? parseFloat(l.minAmount)        : null,
        max_amount:  l.maxAmount  ? parseFloat(l.maxAmount)        : null,
      }, { onConflict: "institution_id,product_id" });
    setSaved((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [product.id]: false })), 2500);
  };

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <SectionHeader
        title="Products"
        subtitle={`${filtered.length} product${filtered.length !== 1 ? "s" : ""} · configure rate and amount limits within platform caps`}
      />

      <InlineAlert variant="info">
        Platform-level caps are set by Ficium. Your institution limits must fall within those caps.
        Changes take effect immediately and are written to the audit log.
      </InlineAlert>

      <div className="my-5">
        <FilterPills
          options={familyOptions}
          value={familyFilter}
          onChange={setFamilyFilter}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-ink/[0.06] rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-ink/[0.06] rounded" />
                  <div className="h-3 w-20 bg-ink/[0.04] rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products found"
          description="Products will appear here once configured by Ficium"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              licensed={modules.includes("marketplace")}
              limits={getLimits(p.id)}
              saved={!!saved[p.id]}
              onLimitChange={(field, val) => setLimit(p.id, field, val)}
              onSave={() => saveLimits(p)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
