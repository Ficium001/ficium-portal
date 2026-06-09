
// =============================================================
// Ficium 3 — Institution Products
// Browse licensed products, view rate config, set limits.
// =============================================================
import { useState } from "react";
import { useProducts, useMyInstitution } from "../../hooks/useInstitution";
import { institutionSupabase } from "../../lib/institutionSupabase";
import { Package, ChevronDown, ChevronUp, Check } from "lucide-react";

export default function InstitutionProducts() {
  const { data: products = [], isLoading } = useProducts();
  const { data: institution }              = useMyInstitution();
  const [expanded, setExpanded]            = useState<string | null>(null);
  const [saved, setSaved]                  = useState<string | null>(null);
  const [limits, setLimits]                = useState<Record<string, { minRate: string; maxRate: string; minAmount: string; maxAmount: string }>>({});

  const modules  = institution?.modules ?? [];
  const families = Array.from(new Set(products.map(p => p.family_label ?? "Other")));
  const [familyFilter, setFamilyFilter] = useState("all");

  const filtered = products.filter(p =>
    familyFilter === "all" || (p.family_label ?? "Other") === familyFilter
  );

  const getLimits = (id: string) => limits[id] ?? { minRate:"", maxRate:"", minAmount:"", maxAmount:"" };
  const setLimit  = (id: string, field: string, val: string) =>
    setLimits(prev => ({ ...prev, [id]: { ...getLimits(id), [field]: val } }));

  const saveLimits = async (product: { id: string; code: string }) => {
    const l = getLimits(product.id);
    await institutionSupabase
      .from("institution_product_config")
      .upsert({
        product_id:     product.id,
        enabled:        true,
        min_rate:       l.minRate   ? parseFloat(l.minRate)   / 100 : null,
        max_rate:       l.maxRate   ? parseFloat(l.maxRate)   / 100 : null,
        min_amount:     l.minAmount ? parseFloat(l.minAmount)       : null,
        max_amount:     l.maxAmount ? parseFloat(l.maxAmount)       : null,
      }, { onConflict: "institution_id,product_id" });
    setSaved(product.id);
    setTimeout(() => setSaved(null), 2000);
  };

  const fmt = {
    rate:   (r: number | null) => r != null ? (r * 100).toFixed(2) + "%" : "—",
    amount: (a: number | null) => a != null ? "MUR " + Number(a).toLocaleString() : "—",
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Products</h1>
          <p className="text-muted mt-1.5">{filtered.length} products · set your rate and amount limits below platform caps</p>
        </div>
      </div>

      {/* Family filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", ...families].map(f => (
          <button key={f} onClick={() => setFamilyFilter(f)}
            className={`text-[13px] font-medium px-4 py-1.5 rounded-full border transition-colors ${
              familyFilter === f ? "bg-ficium text-white border-ficium" : "bg-white border-ink/10 text-muted hover:border-ficium/40"
            }`}>
            {f === "all" ? "All products" : f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const isOpen    = expanded === p.id;
            const licensed  = modules.includes("marketplace");
            const l         = getLimits(p.id);
            const rc        = p.rate_config as { min_rate: number | null; max_rate: number | null; min_amount: number | null; max_amount: number | null } | undefined;

            return (
              <div key={p.id} className={`bg-white rounded-2xl shadow-card overflow-hidden ${!licensed ? "opacity-60" : ""}`}>
                <div className="flex items-center px-5 py-4 gap-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : p.id)}>
                  <div className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-ficium" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] text-ink">{p.label}</span>
                      {!licensed && <span className="text-[10px] font-bold bg-ink/5 text-muted px-2 py-0.5 rounded-full">Not licensed</span>}
                      {licensed  && <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Licensed</span>}
                    </div>
                    <div className="text-[12px] text-muted mt-0.5 font-mono">{p.code}</div>
                  </div>
                  {rc && (
                    <div className="hidden lg:flex items-center gap-6 text-[12px]">
                      <div>
                        <div className="text-muted text-[10px] uppercase tracking-wide">Platform rate</div>
                        <div className="font-semibold text-ink">{fmt.rate(rc.min_rate)} – {fmt.rate(rc.max_rate)}</div>
                      </div>
                      <div>
                        <div className="text-muted text-[10px] uppercase tracking-wide">Amount range</div>
                        <div className="font-semibold text-ink">{fmt.amount(rc.min_amount)} – {fmt.amount(rc.max_amount)}</div>
                      </div>
                    </div>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </div>

                {isOpen && licensed && (
                  <div className="border-t border-ink/[0.07] px-5 py-4 bg-cream/40">
                    <div className="text-[13px] font-semibold text-ink mb-3">Your rate and amount limits</div>
                    <p className="text-[12px] text-muted mb-4">
                      Set limits within platform caps. Leave blank to use platform defaults.
                      Platform cap: {fmt.rate(rc?.min_rate ?? null)} – {fmt.rate(rc?.max_rate ?? null)} · {fmt.amount(rc?.min_amount ?? null)} – {fmt.amount(rc?.max_amount ?? null)}
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                      {[
                        { field: "minRate",   label: "Min rate (%)",    ph: "e.g. 7.5",      val: l.minRate   },
                        { field: "maxRate",   label: "Max rate (%)",    ph: "e.g. 18.0",     val: l.maxRate   },
                        { field: "minAmount", label: "Min amount (MUR)",ph: "e.g. 50000",    val: l.minAmount },
                        { field: "maxAmount", label: "Max amount (MUR)",ph: "e.g. 2000000",  val: l.maxAmount },
                      ].map(f => (
                        <div key={f.field}>
                          <label className="block text-[11px] text-muted mb-1.5">{f.label}</label>
                          <input value={f.val} onChange={e => setLimit(p.id, f.field, e.target.value)}
                            placeholder={f.ph} type="number"
                            className="w-full border border-ink/[0.12] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20" />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => saveLimits(p)}
                      className={`flex items-center gap-2 text-[12px] font-bold px-4 py-2 rounded-xl transition-colors ${
                        saved === p.id ? "bg-green-500 text-white" : "bg-ficium text-white hover:bg-ficium-deep"
                      }`}>
                      {saved === p.id ? <><Check className="w-4 h-4" />Saved</> : "Save limits"}
                    </button>
                  </div>
                )}

                {isOpen && !licensed && (
                  <div className="border-t border-ink/[0.07] px-5 py-4 bg-cream/40 text-[13px] text-muted">
                    This product requires the <code className="font-mono text-ficium">marketplace</code> module.
                    Contact your Ficium account manager to upgrade.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
