/**
 * PipelineDetail.tsx
 * Full view of one loan processing pipeline.
 * Institution staff see: borrower identity (Phase 2), all stages,
 * and can advance/approve stages inline.
 */
import { useState }              from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, AlertTriangle,
  ChevronLeft, Lock, FileText, User, Mail, Phone,
} from "lucide-react";
import { portalApi }             from "@/shared/lib/portal-api";
import { PageShell }             from "@/shared/components/PageShell";
import { Spinner }               from "@/shared/components/Spinner";
import { Button }                from "@/shared/components/Button";

/* ── Types ── */
interface StageInstance {
  id:                    string;
  position:              number;
  status:                "pending" | "active" | "awaiting_approval" | "completed" | "skipped" | "blocked";
  stage_key:             string;
  label:                 string;
  description:           string;
  borrower_label:        string;
  requires_maker_checker: boolean;
  requires_documents:    boolean;
  sla_hours:             number;
  sla_due_at:            string | null;
  sla_breached:          boolean;
  notes:                 string | null;
  submitted_by:          string | null;
  submitted_at:          string | null;
  approved_by:           string | null;
  approved_at:           string | null;
  completed_at:          string | null;
  started_at:            string | null;
}

interface PipelineDetail {
  id:               string;
  status:           string;
  deal_amount:      number;
  deal_rate:        number;
  deal_term_months: number;
  product_label:    string;
  consumer_ref:     string;
  borrower_name:    string | null;
  borrower_email:   string | null;
  borrower_phone:   string | null;
  borrower_address: string | null;
  started_at:       string;
  completed_at:     string | null;
  stages:           StageInstance[];
}

/* ── API hooks ── */
function usePipeline(id: string) {
  return useQuery<PipelineDetail>({
    queryKey: ["pipeline", id],
    queryFn:  () => portalApi.get(`/pipelines/${id}`),
    enabled:  !!id,
  });
}

function useAdvanceStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, notes }: { stageId: string; notes?: string }) =>
      portalApi.post(`/pipelines/${pipelineId}/stages/${stageId}/advance`, { notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", pipelineId] }),
  });
}

function useApproveStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, notes }: { stageId: string; notes?: string }) =>
      portalApi.post(`/pipelines/${pipelineId}/stages/${stageId}/approve`, { notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline", pipelineId] }),
  });
}

/* ── Helpers ── */
const fmtMUR = (v: number) =>
  `MUR ${Number(v).toLocaleString("en-MU", { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" }) : "—";

function statusColour(status: StageInstance["status"], breached: boolean) {
  if (status === "completed")         return { ring: "border-green-300",  bg: "bg-green-50",   dot: "bg-green-500"  };
  if (status === "awaiting_approval") return { ring: "border-amber-300",  bg: "bg-amber-50",   dot: "bg-amber-500"  };
  if (status === "active" && breached)return { ring: "border-red-300",    bg: "bg-red-50",     dot: "bg-red-500"    };
  if (status === "active")            return { ring: "border-ficium/30",  bg: "bg-ficium/[0.04]", dot: "bg-ficium" };
  return                                     { ring: "border-ink/[0.07]", bg: "bg-white",      dot: "bg-ink/20"    };
}

/* ── Stage card ── */
function StageCard({
  stage, pipelineId, isActive,
}: {
  stage: StageInstance;
  pipelineId: string;
  isActive: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded]  = useState(isActive);
  const { mutate: advance, isPending: advancing } = useAdvanceStage(pipelineId);
  const { mutate: approve, isPending: approving  } = useApproveStage(pipelineId);
  const col = statusColour(stage.status, stage.sla_breached);

  const canAct = stage.status === "active" || stage.status === "awaiting_approval";

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${col.ring} ${col.bg}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] text-ink">{stage.label}</span>
            {stage.requires_maker_checker && (
              <span className="text-[10px] text-muted flex items-center gap-0.5">
                <Lock size={9} /> dual-control
              </span>
            )}
            {stage.requires_documents && (
              <span className="text-[10px] text-muted flex items-center gap-0.5">
                <FileText size={9} /> docs required
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted mt-0.5">
            {stage.status === "completed" && stage.completed_at
              ? `Completed ${fmtDate(stage.completed_at)}`
              : stage.status === "awaiting_approval"
              ? "Submitted — awaiting checker approval"
              : stage.status === "active"
              ? stage.sla_breached
                ? "⚠ SLA breached"
                : stage.sla_due_at
                ? `SLA: ${fmtDate(stage.sla_due_at)}`
                : "In progress"
              : "Not started"}
          </div>
        </div>

        {stage.status === "completed" && (
          <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
        )}
        {stage.status === "awaiting_approval" && (
          <Clock size={16} className="text-amber-500 flex-shrink-0" />
        )}
        {stage.sla_breached && stage.status !== "completed" && (
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-ink/[0.06] pt-3 space-y-3">
          {stage.description && (
            <p className="text-[12px] text-muted leading-relaxed">{stage.description}</p>
          )}

          {stage.notes && (
            <div className="bg-white/70 rounded-xl px-3 py-2 text-[12px] text-ink/80">
              <span className="font-semibold text-muted text-[10px] uppercase tracking-wide block mb-1">Notes</span>
              {stage.notes}
            </div>
          )}

          {/* Actions */}
          {canAct && (
            <div className="space-y-2 pt-1">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes (optional)…"
                rows={2}
                className="w-full text-[13px] border border-ink/[0.12] rounded-xl px-3 py-2
                           resize-none outline-none focus:border-ficium/40 focus:ring-2
                           focus:ring-ficium/15 transition-all bg-white"
              />
              <div className="flex gap-2">
                {/* Maker: advance or submit for approval */}
                {stage.status === "active" && (
                  <Button
                    size="sm"
                    loading={advancing}
                    onClick={() => advance({ stageId: stage.id, notes: notes || undefined })}
                    className="flex-1"
                  >
                    {stage.requires_maker_checker ? "Submit for approval" : "Mark complete"}
                  </Button>
                )}
                {/* Checker: approve */}
                {stage.status === "awaiting_approval" && (
                  <Button
                    size="sm"
                    loading={approving}
                    onClick={() => approve({ stageId: stage.id, notes: notes || undefined })}
                    className="flex-1"
                  >
                    Approve &amp; advance
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ── */
export function PipelineDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { data: pipeline, isLoading } = usePipeline(id!);

  if (isLoading) return (
    <PageShell title="Pipeline">
      <div className="flex justify-center py-16"><Spinner /></div>
    </PageShell>
  );

  if (!pipeline) return (
    <PageShell title="Pipeline">
      <p className="text-center text-muted py-16">Pipeline not found.</p>
    </PageShell>
  );

  const activeStageId = pipeline.stages.find(
    (s) => s.status === "active" || s.status === "awaiting_approval",
  )?.id;

  return (
    <PageShell
      title="Loan Pipeline"
      subtitle={`${pipeline.product_label} · ref ${pipeline.consumer_ref}`}
      headerLeft={
        <button onClick={() => navigate(-1)} className="text-muted hover:text-ink transition-colors">
          <ChevronLeft size={20} />
        </button>
      }
    >
      <div className="space-y-5">

        {/* Deal summary */}
        <div className="bg-white border border-ink/[0.07] rounded-2xl p-4 grid grid-cols-3 gap-3">
          {[
            { label: "Deal amount",  value: fmtMUR(pipeline.deal_amount) },
            { label: "Rate",         value: `${(pipeline.deal_rate * 100).toFixed(2)}%` },
            { label: "Term",         value: `${pipeline.deal_term_months}m` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[9px] text-muted uppercase tracking-widest font-bold">{label}</div>
              <div className="font-display font-bold text-[14px] text-ink mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Borrower identity (Phase 2) */}
        {(pipeline.borrower_name || pipeline.borrower_email) && (
          <div className="bg-ficium/[0.04] border border-ficium/15 rounded-2xl p-4 space-y-2">
            <div className="text-[10px] font-bold text-ficium uppercase tracking-widest mb-1">
              Borrower identity
            </div>
            {pipeline.borrower_name && (
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <User size={13} className="text-ficium flex-shrink-0" />
                <span className="font-semibold">{pipeline.borrower_name}</span>
              </div>
            )}
            {pipeline.borrower_email && (
              <a href={`mailto:${pipeline.borrower_email}`}
                 className="flex items-center gap-2 text-[13px] text-ficium hover:underline">
                <Mail size={13} className="flex-shrink-0" />
                {pipeline.borrower_email}
              </a>
            )}
            {pipeline.borrower_phone && (
              <a href={`tel:${pipeline.borrower_phone}`}
                 className="flex items-center gap-2 text-[13px] text-ficium hover:underline">
                <Phone size={13} className="flex-shrink-0" />
                {pipeline.borrower_phone}
              </a>
            )}
            {pipeline.borrower_address && (
              <div className="text-[12px] text-muted pl-5">{pipeline.borrower_address}</div>
            )}
          </div>
        )}

        {/* Stage timeline */}
        <div>
          <h2 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">
            Processing stages
          </h2>
          <div className="space-y-2">
            {pipeline.stages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                pipelineId={pipeline.id}
                isActive={stage.id === activeStageId}
              />
            ))}
          </div>
        </div>

        {/* Completion */}
        {pipeline.status === "completed" && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200
                          rounded-2xl px-4 py-3 text-[13px] text-green-800">
            <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
            <div>
              <div className="font-semibold">Pipeline complete</div>
              <div className="text-[12px] text-green-700 mt-0.5">
                Completed {fmtDate(pipeline.completed_at)} · Commission event raised
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
