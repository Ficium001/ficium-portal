import { useState }            from "react";
import { CheckCircle2, Clock, AlertTriangle, Lock, FileText } from "lucide-react";
import { Button }              from "@/shared/components/Button";
import { useAdvanceStage, useApproveStage } from "../hooks/usePipeline";
import type { StageInstance, StageStatus } from "../types/pipeline";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmtDate = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString("en-MU", {
        day: "numeric", month: "short", year: "numeric",
      })
    : "—";

function stageColour(status: StageStatus, breached: boolean) {
  if (status === "completed")
    return { ring: "border-green-300",   bg: "bg-green-50",        dot: "bg-green-500"  };
  if (status === "awaiting_approval")
    return { ring: "border-amber-300",   bg: "bg-amber-50",        dot: "bg-amber-500"  };
  if (status === "active" && breached)
    return { ring: "border-red-300",     bg: "bg-red-50",          dot: "bg-red-500"    };
  if (status === "active")
    return { ring: "border-ficium/30",   bg: "bg-ficium/[0.04]",   dot: "bg-ficium"     };
  return   { ring: "border-ink/[0.07]", bg: "bg-white",            dot: "bg-ink/20"     };
}

function stageSubtitle(stage: StageInstance): string {
  if (stage.status === "completed" && stage.completed_at)
    return `Completed ${fmtDate(stage.completed_at)}`;
  if (stage.status === "awaiting_approval")
    return "Submitted — awaiting checker approval";
  if (stage.status === "active")
    return stage.sla_breached
      ? "⚠ SLA breached"
      : stage.sla_due_at
      ? `SLA: ${fmtDate(stage.sla_due_at)}`
      : "In progress";
  return "Not started";
}

/* ── Props ───────────────────────────────────────────────────────────────── */
interface StageCardProps {
  stage:      StageInstance;
  pipelineId: string;
  isActive:   boolean;
}

/* ── Component ───────────────────────────────────────────────────────────── */
export function StageCard({ stage, pipelineId, isActive }: StageCardProps) {
  const [notes, setNotes]       = useState("");
  const [expanded, setExpanded] = useState(isActive);

  const { mutate: advance, isPending: advancing } = useAdvanceStage(pipelineId);
  const { mutate: approve, isPending: approving  } = useApproveStage(pipelineId);

  const col    = stageColour(stage.status, stage.sla_breached);
  const canAct = stage.status === "active" || stage.status === "awaiting_approval";

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${col.ring} ${col.bg}`}>

      {/* ── Header ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
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
          <div className="text-[11px] text-muted mt-0.5">{stageSubtitle(stage)}</div>
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

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-ink/[0.06] pt-3 space-y-3">
          {stage.description && (
            <p className="text-[12px] text-muted leading-relaxed">{stage.description}</p>
          )}

          {stage.notes && (
            <div className="bg-white/70 rounded-xl px-3 py-2 text-[12px] text-ink/80">
              <span className="font-semibold text-muted text-[10px] uppercase tracking-wide block mb-1">
                Notes
              </span>
              {stage.notes}
            </div>
          )}

          {canAct && (
            <div className="space-y-2 pt-1">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes (optional)…"
                rows={2}
                className="w-full text-[13px] border border-ink/[0.12] rounded-xl px-3 py-2
                           resize-none outline-none focus:border-ficium/40
                           focus:ring-2 focus:ring-ficium/15 transition-all bg-white"
              />
              <div className="flex gap-2">
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
