import { useNavigate }         from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { ProgressBar }         from "./ProgressBar";
import type { PipelineSummary } from "@/institution/pipeline/types/pipeline";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmtMUR = (v: number) =>
  `MUR ${Number(v).toLocaleString("en-MU", { maximumFractionDigits: 0 })}`;

function slaLabel(dueAt: string | null, breached: boolean): string {
  if (!dueAt) return "";
  const ms = new Date(dueAt).getTime() - Date.now();
  if (breached || ms < 0) return "SLA breached";
  const h = Math.floor(ms / 3_600_000);
  return h < 24 ? `${h}h remaining` : `${Math.floor(h / 24)}d remaining`;
}

/* ── Component ───────────────────────────────────────────────────────────── */
interface PipelineCardProps {
  pipeline: PipelineSummary;
}

export function PipelineCard({ pipeline }: PipelineCardProps) {
  const navigate = useNavigate();
  const breached = pipeline.sla_breached;

  return (
    <button
      onClick={() => navigate(`/pipelines/${pipeline.id}`)}
      className="w-full text-left bg-white border border-ink/[0.07] rounded-2xl p-5
                 hover:border-ficium/30 hover:shadow-md transition-all group"
      aria-label={`Open pipeline for borrower ref ${pipeline.consumer_ref}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] font-mono text-muted mb-0.5">
            ref {pipeline.consumer_ref}
          </div>
          <div className="font-display font-bold text-[15px] text-ink leading-tight">
            {pipeline.product_label}
          </div>
          <div className="text-[13px] text-muted mt-0.5">
            {fmtMUR(pipeline.deal_amount)} ·{" "}
            {(pipeline.deal_rate * 100).toFixed(2)}% ·{" "}
            {pipeline.deal_term_months}m
          </div>
        </div>
        <ChevronRight
          size={16}
          className="text-muted group-hover:text-ficium transition-colors shrink-0 mt-1"
        />
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <ProgressBar
          completed={pipeline.stages_completed}
          total={pipeline.stages_total}
        />
        <div className="flex justify-between text-[11px] text-muted mt-1.5">
          <span>{pipeline.stages_completed}/{pipeline.stages_total} stages</span>
          <span>{pipeline.current_stage_label}</span>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {pipeline.current_stage_status === "awaiting_approval" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold
                           bg-amber-50 text-amber-700 border border-amber-200
                           px-2.5 py-1 rounded-full">
            <Clock size={11} /> Awaiting approval
          </span>
        ) : pipeline.status === "completed" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold
                           bg-green-50 text-green-700 border border-green-200
                           px-2.5 py-1 rounded-full">
            <CheckCircle2 size={11} /> Completed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold
                           bg-ficium/8 text-ficium border border-ficium/20
                           px-2.5 py-1 rounded-full">
            Active
          </span>
        )}

        {pipeline.current_sla_due_at && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium
                            px-2.5 py-1 rounded-full
                            ${breached
                              ? "bg-red-50 text-red-600 border border-red-200"
                              : "bg-ink/4 text-muted"}`}>
            {breached && <AlertTriangle size={11} />}
            {slaLabel(pipeline.current_sla_due_at, breached)}
          </span>
        )}
      </div>
    </button>
  );
}
