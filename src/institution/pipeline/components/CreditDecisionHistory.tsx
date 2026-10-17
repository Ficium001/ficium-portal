/**
 * CreditDecisionHistory — every credit decision on a deal, whichever system
 * made it: Ficium's approval engine, an officer recording it, or the bank's
 * credit system over the API.
 */
import type { CreditDecision, CreditOutcome } from "@/institution/pipeline/types/pipeline";

const OUTCOME: Record<CreditOutcome, { label: string; cls: string }> = {
  approved:                 { label: "Approved",                 cls: "text-green-800 bg-green-50 border-green-200" },
  approved_with_conditions: { label: "Approved with conditions", cls: "text-green-800 bg-green-50 border-green-200" },
  referred_back:            { label: "Referred back",            cls: "text-amber-900 bg-amber-50 border-amber-200" },
  declined:                 { label: "Declined",                 cls: "text-red-900 bg-red-50 border-red-200" },
};

const SOURCE: Record<CreditDecision["source"], string> = {
  engine: "Ficium credit approval",
  portal: "Recorded in the portal",
  api:    "From your credit system",
};

const fmt = (s: string) =>
  new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" });

export function CreditDecisionHistory({ decisions }: { decisions: CreditDecision[] }) {
  if (!decisions?.length) return null;
  return (
    <section aria-labelledby="credit-decisions-h">
      <h2 id="credit-decisions-h" className="text-[13px] font-semibold text-ink mb-3">
        Credit decisions
      </h2>
      <ol className="space-y-2">
        {decisions.map((d) => {
          const o = OUTCOME[d.outcome];
          return (
            <li key={d.id} className="rounded-2xl border border-ink/[0.07] bg-white px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-semibold border rounded-md px-1.5 py-0.5 ${o.cls}`}>
                  {o.label}
                </span>
                <span className="text-[12px] text-ink">{fmt(d.decided_at)}</span>
                {d.external_reference && (
                  <span className="text-[12px] text-muted">Ref {d.external_reference}</span>
                )}
              </div>
              {d.conditions.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[12px] text-ink/85 space-y-0.5">
                  {d.conditions.map((c) => <li key={c}>{c}</li>)}
                </ul>
              )}
              {d.reason && <p className="mt-2 text-[12px] text-ink/85">{d.reason}</p>}
              <p className="mt-1.5 text-[11px] text-muted">
                {SOURCE[d.source]}{d.recorded_by_name ? `, by ${d.recorded_by_name}` : ""}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
