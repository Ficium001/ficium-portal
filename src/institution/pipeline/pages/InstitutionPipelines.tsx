/**
 * InstitutionPipelines.tsx
 * Lists all active loan processing pipelines for the institution.
 * Each card shows: borrower ref, product, deal amount, current stage,
 * progress bar, SLA status, and a link to the detail view.
 */
import { useQuery }              from "@tanstack/react-query";
import { useNavigate }           from "react-router-dom";
import { AlertTriangle, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import { portalApi }             from "@/shared/lib/portal-api";
import { PageShell }             from "@/shared/components/PageShell";
import { EmptyState }            from "@/shared/components/EmptyState";
import { Spinner }               from "@/shared/components/Spinner";

/* ── Types ── */
interface PipelineSummary {
  id:                        string;
  request_id:                string;
  consumer_ref:              string;
  product_label:             string;
  deal_amount:               number;
  deal_rate:                 number;
  deal_term_months:          number;
  status:                    string;
  current_stage_label:       string;
  current_stage_key:         string;
  current_stage_status:      string;
  current_sla_due_at:        string | null;
  current_stage_instance_id: string;
  stages_completed:          number;
  stages_total:              number;
  sla_breached:              boolean;
  started_at:                string;
}

/* ── API ── */
function usePipelines(status = "active") {
  return useQuery<PipelineSummary[]>({
    queryKey: ["pipelines", status],
    queryFn:  () => portalApi.get(`/pipelines?status=${status}`),
    staleTime: 30_000,
  });
}

/* ── Helpers ── */
const fmtMUR = (v: number) =>
  `MUR ${Number(v).toLocaleString("en-MU", { maximumFractionDigits: 0 })}`;

function slaLabel(dueAt: string | null, breached: boolean): string {
  if (!dueAt) return "";
  const ms = new Date(dueAt).getTime() - Date.now();
  if (breached || ms < 0) return "SLA breached";
  const h  = Math.floor(ms / 3_600_000);
  if (h < 24) return `${h}h remaining`;
  return `${Math.floor(h / 24)}d remaining`;
}

/* ── Stage progress bar ── */
function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-ink/[0.07] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${pct}%`,
          background: pct === 100
            ? "#1D9E75"
            : "linear-gradient(90deg,#3536DC,#8231EC)",
        }}
      />
    </div>
  );
}

/* ── Pipeline card ── */
function PipelineCard({ pipeline }: { pipeline: PipelineSummary }) {
  const navigate = useNavigate();
  const breached = pipeline.sla_breached;

  return (
    <button
      onClick={() => navigate(`/pipelines/${pipeline.id}`)}
      className="w-full text-left bg-white border border-ink/[0.07] rounded-2xl p-5
                 hover:border-ficium/30 hover:shadow-md transition-all group"
      aria-label={`Open pipeline for ${pipeline.consumer_ref}`}
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
            {fmtMUR(pipeline.deal_amount)} · {(pipeline.deal_rate * 100).toFixed(2)}% ·{" "}
            {pipeline.deal_term_months}m
          </div>
        </div>
        <ChevronRight
          size={16}
          className="text-muted group-hover:text-ficium transition-colors flex-shrink-0 mt-1"
        />
      </div>

      {/* Progress */}
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

      {/* Stage status + SLA */}
      <div className="flex items-center gap-2">
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
                           bg-ficium/[0.08] text-ficium border border-ficium/20
                           px-2.5 py-1 rounded-full">
            Active
          </span>
        )}

        {pipeline.current_sla_due_at && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium
                            px-2.5 py-1 rounded-full
                            ${breached
                              ? "bg-red-50 text-red-600 border border-red-200"
                              : "bg-ink/[0.04] text-muted"}`}>
            {breached && <AlertTriangle size={11} />}
            {slaLabel(pipeline.current_sla_due_at, breached)}
          </span>
        )}
      </div>
    </button>
  );
}

/* ── Page ── */
export function InstitutionPipelines() {
  const { data: pipelines = [], isLoading } = usePipelines();

  return (
    <PageShell title="Loan Pipelines" subtitle="Active post-acceptance workflows">
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon="pipeline"
          title="No active pipelines"
          description="Pipelines are created automatically when a borrower accepts a bid."
        />
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <PipelineCard key={p.id} pipeline={p} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
