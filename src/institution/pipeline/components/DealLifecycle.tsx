/**
 * DealLifecycle — where this deal is in its lifecycle, at a glance.
 *
 *   Bid accepted → Processing → Documents → Signature → Complete
 *
 * Steps are contributed by modules (manifest.dealSteps) and shown only if the
 * user holds that module's key. Clicking a step opens its tab. On narrow
 * screens the strip scrolls sideways rather than wrapping.
 */
import { Check } from "lucide-react";
import type { PipelineDetail } from "@/institution/pipeline/types/pipeline";
import type { StepState } from "@/app/registry/types";
import { DEAL_STEPS } from "@/app/registry/select";
import { useModulesAccess } from "@/shared/hooks/useModuleAccess";

const STEP_KEYS = [...new Set(DEAL_STEPS.map((s) => s.moduleKey))];

function useSteps(deal: PipelineDetail) {
  const access = useModulesAccess(STEP_KEYS);
  const out: { key: string; label: string; tab?: string; state: StepState; detail?: string }[] = [];
  // DEAL_STEPS is a module-level registry constant: same hooks, same order, every render.
  for (const step of DEAL_STEPS) {
    const allowed = access.allowed[step.moduleKey] ?? false;
    const r = step.useStep(deal, allowed);
    if (allowed) out.push({ key: step.key, label: step.label, tab: step.tab, ...r });
  }
  return out;
}

const dot: Record<StepState, string> = {
  done:    "bg-ficium text-white border-ficium",
  current: "bg-white text-ficium border-ficium",
  todo:    "bg-white text-muted border-line",
};

export function DealLifecycle({
  deal, onOpenTab, availableTabs,
}: {
  deal:          PipelineDetail;
  onOpenTab:     (tab: string) => void;
  availableTabs: string[];
}) {
  const steps = useSteps(deal);
  if (steps.length === 0) return null;

  return (
    <ol aria-label="Deal lifecycle"
        className="flex items-stretch overflow-x-auto bg-white border border-line rounded-card shadow-card px-2 py-3">
      {steps.map((s, i) => {
        const clickable = !!s.tab && availableTabs.includes(s.tab);
        const body = (
          <>
            <span className={`w-6 h-6 rounded-full border-2 grid place-items-center text-[11px] font-bold shrink-0 ${dot[s.state]}`}
                  aria-hidden>
              {s.state === "done" ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0 text-left">
              <span className={`block text-[12px] font-semibold leading-tight ${s.state === "todo" ? "text-muted" : "text-ink"}`}>
                {s.label}
              </span>
              {s.detail && <span className="block text-[11px] text-muted leading-tight mt-0.5">{s.detail}</span>}
            </span>
          </>
        );
        return (
          <li key={s.key} className="flex items-center shrink-0"
              aria-current={s.state === "current" ? "step" : undefined}>
            {clickable ? (
              <button onClick={() => onOpenTab(s.tab!)}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-ink/4 transition-colors
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ficium/40">
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1">{body}</div>
            )}
            {i < steps.length - 1 && (
              <span className={`w-6 sm:w-10 h-px mx-1 ${s.state === "done" ? "bg-ficium" : "bg-line"}`} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
