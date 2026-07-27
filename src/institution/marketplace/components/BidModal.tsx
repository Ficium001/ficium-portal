import { useState }         from "react";
import { useForm }          from "react-hook-form";
import { zodResolver }      from "@hookform/resolvers/zod";
import { z }                from "zod";
import { X, Zap, Layers }   from "lucide-react";
import type { MarketplaceRequest } from "@/institution/types/institution";

const bidSchema = z.object({
  rate:           z.number().min(0.001).max(1),
  rate_type:      z.enum(["fixed", "variable"]),
  amount_offered: z.number().positive(),
  term_months:    z.number().int().positive(),
  notes:          z.string().optional(),
});
export type BidForm = z.infer<typeof bidSchema> & {
  // Structured per-product counter-allocation, added by this component before
  // calling onSubmit - not part of the zod-validated headline fields above.
  allocations?: { product_type: string; amount_offered: number; rate?: number; term_months?: number }[];
};

interface BidModalProps {
  request:      MarketplaceRequest;
  onClose:      () => void;
  onSubmit:     (d: BidForm) => void;
  isSubmitting: boolean;
  error?:       string;
}

const fmt = (v: number) => v >= 1_000_000 ? `MUR ${(v / 1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`;

export function BidModal({ request, onClose, onSubmit, isSubmitting, error }: BidModalProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<z.infer<typeof bidSchema>>({
    resolver: zodResolver(bidSchema),
    defaultValues: { rate_type: "fixed", amount_offered: request.amount, term_months: request.term_months ?? 12 },
  });

  const hasAllocations = !!request.allocations && request.allocations.length > 0;
  const headlineRate = watch("rate");
  const headlineTerm = watch("term_months");

  // Per-product counter-allocation: pre-fill amount from what the client
  // asked for (if they specified a split), otherwise leave blank for the
  // officer to propose. Rate/term default to the headline bid's values but
  // stay editable per line.
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((request.allocations ?? []).map(a => [a.product_type, a.amount != null ? String(a.amount) : ""]))
  );
  const [lineRates, setLineRates] = useState<Record<string, string>>({});

  const lineAmountSum = Object.values(lineAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const inputCls = (err?: boolean) =>
    `w-full bg-white border ${err ? "border-red-400 focus:ring-red-200" : "border-ink/12 focus:border-ficium focus:ring-ficium/20"} rounded-xl px-4 py-3 text-[15px] outline-hidden transition-all focus:ring-2`;

  const windowMs     = request.bid_window_closes_at
    ? new Date(request.bid_window_closes_at).getTime() - Date.now()
    : null;
  const windowLabel  = windowMs === null ? null
    : windowMs <= 0   ? "Closed"
    : windowMs < 3_600_000
      ? `${Math.floor(windowMs / 60_000)}m left`
      : `${Math.floor(windowMs / 3_600_000)}h ${Math.floor((windowMs % 3_600_000) / 60_000)}m left`;
  const windowUrgent = windowMs !== null && windowMs < 2 * 3_600_000;

  const onValid = (formData: z.infer<typeof bidSchema>) => {
    const merged: BidForm = { ...formData };
    if (hasAllocations) {
      merged.allocations = (request.allocations ?? []).map(a => ({
        product_type:  a.product_type,
        amount_offered: Number(lineAmounts[a.product_type] || 0),
        rate:          lineRates[a.product_type] ? Number(lineRates[a.product_type]) / 100 : headlineRate,
        term_months:   headlineTerm,
      }));
    }
    onSubmit(merged);
  };

  const allocationsFilled = !hasAllocations || (request.allocations ?? []).every(a => Number(lineAmounts[a.product_type]) > 0);

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-ink/[0.07]">
          <div>
            <h2 className="font-display font-bold text-[17px] text-ink">Place bid</h2>
            <p className="text-[13px] text-muted mt-0.5">
              {request.product_label ?? request.product_type} · {fmt(Number(request.amount))}
              {request.term_months ? ` · ${request.term_months}m` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button onClick={onClose} className="text-muted hover:text-ink transition-colors"><X className="w-5 h-5" /></button>
            {windowLabel && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                windowUrgent ? "bg-red-50 text-red-600" : "bg-ink/5 text-muted"
              }`}>
                ⏱ {windowLabel}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onValid)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-ink mb-1.5">Interest rate (%)</label>
              <input {...register("rate", { valueAsNumber: true, setValueAs: (v) => parseFloat(v) / 100 })}
                type="number" step="0.01" placeholder="8.75" className={inputCls(!!errors.rate)} />
              {errors.rate && <p className="text-[11px] text-red-500 mt-1">{errors.rate.message}</p>}
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink mb-1.5">Rate type</label>
              <select {...register("rate_type")} className={inputCls()}>
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-ink mb-1.5">Amount offered (MUR)</label>
            <input {...register("amount_offered", { valueAsNumber: true })} type="number" className={inputCls(!!errors.amount_offered)} />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-ink mb-1.5">Term (months)</label>
            <input {...register("term_months", { valueAsNumber: true })} type="number" className={inputCls(!!errors.term_months)} />
          </div>

          {hasAllocations && (
            <div className="border border-ficium/15 bg-ficium/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-3.5 h-3.5 text-ficium" />
                <span className="text-[12px] font-bold text-ficium uppercase tracking-wider">Per-product breakdown</span>
              </div>
              <div className="space-y-2.5">
                {(request.allocations ?? []).map(a => (
                  <div key={a.product_type} className="flex items-center gap-2">
                    <span className="flex-1 text-[13px] font-medium text-ink truncate">{a.product_label}</span>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={lineAmounts[a.product_type] ?? ""}
                      onChange={e => setLineAmounts(prev => ({ ...prev, [a.product_type]: e.target.value }))}
                      className="w-28 bg-white border border-ink/12 rounded-lg px-2.5 py-1.5 text-[13px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Rate %"
                      value={lineRates[a.product_type] ?? ""}
                      onChange={e => setLineRates(prev => ({ ...prev, [a.product_type]: e.target.value }))}
                      className="w-20 bg-white border border-ink/12 rounded-lg px-2.5 py-1.5 text-[13px]"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2.5">
                Lines total {fmt(lineAmountSum)}
                {lineAmountSum !== Number(watch("amount_offered") || 0) && " — doesn't have to match the headline amount above, but check it's intentional."}
              </p>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-ink mb-1.5">Conditions (optional)</label>
            <textarea {...register("notes")} rows={2} className={`${inputCls()} resize-none`} placeholder="Any special conditions for the client..." />
          </div>
          <div className="bg-ficium/5 border border-ficium/15 rounded-xl p-3 text-[12px] text-ink/60">
            ⚠ This bid will be queued for maker-checker approval before reaching the client.
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-600">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting || !allocationsFilled}
              className="flex-1 flex items-center justify-center gap-2 bg-ficium hover:bg-ficium-deep disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
              {isSubmitting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Zap className="w-4 h-4" />}
              Submit for approval
            </button>
            <button type="button" onClick={onClose} className="px-5 text-[13px] font-semibold text-muted border border-ink/10 rounded-xl hover:bg-ink/3 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
