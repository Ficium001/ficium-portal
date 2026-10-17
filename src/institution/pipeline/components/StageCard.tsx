import { useState }            from "react";
import { CheckCircle2, Clock, AlertTriangle, Lock, FileText, Landmark, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button }              from "@/shared/ui";
import { useAdvanceStage, useApproveStage } from "@/institution/pipeline/hooks/usePipeline";
import type { StageInstance, StageStatus } from "@/institution/pipeline/types/pipeline";

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
    return { ring: "border-ficium/30",   bg: "bg-ficium/4",   dot: "bg-ficium"     };
  return   { ring: "border-ink/[0.07]", bg: "bg-white",            dot: "bg-ink/20"     };
}

function stageSubtitle(stage: StageInstance): string {
  if (stage.status === "completed" && stage.completed_at)
    return `Completed ${fmtDate(stage.completed_at)}`;
  if (stage.status === "awaiting_approval")
    return stage.approval_route
      ? "In credit approval"
      : "Submitted — awaiting checker approval";
  if (stage.status === "blocked")
    return "Credit approval rejected";
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

  const [actionError, setActionError] = useState<string | null>(null);
  const showError = (e: unknown) =>
    setActionError(e instanceof Error ? e.message : "That didn't go through. Try again.");

  const col    = stageColour(stage.status, stage.sla_breached);
  const canAct = stage.status === "active" || stage.status === "awaiting_approval";
  // A credit-routed stage waiting on the approval engine is decided in Inbox › Credit.
  const creditPending = stage.approval_route && stage.status === "awaiting_approval";
  // The server refuses to advance while mandatory documents are outstanding.
  const docsOutstanding = Math.max(0, (stage.documents_required ?? 0) - (stage.documents_done ?? 0));

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${col.ring} ${col.bg}`}>

      {/* ── Header ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[13px] text-ink">{stage.label}</span>
            {stage.approval_route ? (
              <span className="text-[10px] text-muted flex items-center gap-0.5">
                <Landmark size={9} /> credit approval
              </span>
            ) : stage.requires_maker_checker && (
              <span className="text-[10px] text-muted flex items-center gap-0.5">
                <Lock size={9} /> dual-control
              </span>
            )}
            {stage.documents_required > 0 && (
              <span className={`text-[10px] flex items-center gap-0.5 ${
                stage.documents_done < stage.documents_required ? "text-amber-700" : "text-muted"}`}>
                <FileText size={9} /> documents {stage.documents_done}/{stage.documents_required}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted mt-0.5">{stageSubtitle(stage)}</div>
        </div>

        {stage.status === "completed" && (
          <CheckCircle2 size={16} className="text-green-500 shrink-0" />
        )}
        {stage.status === "awaiting_approval" && (
          <Clock size={16} className="text-amber-500 shrink-0" />
        )}
        {stage.sla_breached && stage.status !== "completed" && (
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
        )}
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-ink/6 pt-3 space-y-3">
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

          {stage.approval_route && <CreditApprovalStatus stage={stage} />}

          {canAct && !creditPending && (
            <div className="space-y-2 pt-1">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={stage.approval_route
                  ? "Credit memo for the approvers: purpose, repayment capacity, security…"
                  : "Add notes (optional)…"}
                rows={stage.approval_route ? 3 : 2}
                className="w-full text-[13px] border border-ink/12 rounded-xl px-3 py-2
                           resize-none outline-hidden focus:border-ficium/40
                           focus:ring-2 focus:ring-ficium/15 transition-all bg-white"
              />
              {stage.status === "active" && docsOutstanding > 0 && (
                <p className="text-[12px] text-amber-800">
                  {docsOutstanding} required document{docsOutstanding > 1 ? "s" : ""} still to verify or waive.{" "}
                  <Link to="?tab=documents" className="font-semibold underline underline-offset-2">Open Documents</Link>
                </p>
              )}
              {actionError && (
                <p role="alert" className="text-[12px] text-red-700">{actionError}</p>
              )}
              <div className="flex gap-2">
                {stage.status === "active" && (
                  <Button
                    size="sm"
                    loading={advancing}
                    disabled={docsOutstanding > 0}
                    onClick={() => advance(
                      { stageId: stage.id, notes: notes || undefined },
                      { onSuccess: () => setNotes(""), onError: showError },
                    )}
                    className="flex-1"
                  >
                    {stage.approval_route
                      ? "Submit for credit approval"
                      : stage.requires_maker_checker ? "Submit for approval" : "Mark complete"}
                  </Button>
                )}
                {stage.status === "awaiting_approval" && !stage.approval_route && (
                  <Button
                    size="sm"
                    loading={approving}
                    onClick={() => approve(
                      { stageId: stage.id, notes: notes || undefined },
                      { onError: showError },
                    )}
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

/* ── Credit approval status ─────────────────────────────────────────────── */
function CreditApprovalStatus({ stage }: { stage: StageInstance }) {
  if (stage.status === "awaiting_approval") {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900">
        <Clock size={14} className="mt-0.5 shrink-0" />
        <div>
          Routed to the approvers set by your credit approval rules. The deal moves on
          automatically when they decide.{" "}
          <Link to="/inbox?section=credit" className="font-semibold underline underline-offset-2">
            Open Inbox › Credit
          </Link>
        </div>
      </div>
    );
  }
  if (stage.status === "blocked" && stage.rejection_reason) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-900">
        <XCircle size={14} className="mt-0.5 shrink-0" />
        <div><span className="font-semibold">Rejected:</span> {stage.rejection_reason}</div>
      </div>
    );
  }
  if (stage.status === "active" && (stage.approval_status === "expired" || stage.approval_status === "withdrawn")) {
    return (
      <p className="text-[12px] text-muted">
        The last credit approval {stage.approval_status === "expired" ? "expired" : "was withdrawn"}.
        Update the memo if needed and resubmit.
      </p>
    );
  }
  if (stage.status === "active") {
    return (
      <p className="text-[12px] text-muted">
        This stage is decided by credit approval: your submission is routed by amount and
        product to the right approvers. You can't approve your own submission.
      </p>
    );
  }
  return null;
}
