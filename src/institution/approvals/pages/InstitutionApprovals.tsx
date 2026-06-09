/**
 * @page InstitutionApprovals
 * @route /approvals
 * @access protected — admin only (checker role)
 * @description
 *   Maker-checker approval queue. Every material action (bid submit,
 *   bid withdraw, webhook create/delete, API key operations, user
 *   management) creates a pending_action record here. The original
 *   maker CANNOT approve their own action (enforced in the RPC).
 *
 *   Each item shows:
 *     - Action category + resource type
 *     - Maker identity (role, not name — no PII)
 *     - Time remaining before auto-expiry
 *     - Expandable summary of the action's effect
 *     - Anonymised client dossier (for bid actions)
 *     - Approve / Reject controls with optional note
 *
 *   FSC compliance note: all decisions are written to audit_events
 *   with WORM semantics — no updates or deletes permitted.
 *
 * @dataSource
 *   usePendingActions  → pending_actions table (60 s cache, auto-refetch)
 *   useApproveAction   → approve_action() RPC (mutation)
 *   useRejectAction    → reject_action() RPC (mutation)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useCallback } from "react";
import {
  Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown,
  ChevronUp, FileText, User, ShieldCheck,
} from "lucide-react";
import { usePendingActions, useApproveAction, useRejectAction } from "../../hooks/useInstitution";
import { formatDistanceToNow } from "../../lib/utils";
import type { PendingAction } from "../../types/institution";
import {
  SectionHeader, InlineAlert, EmptyState,
  Btn, inputCls,
} from "../../components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Action category metadata
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { icon: string; label: string; risk: "low" | "medium" | "high" }> = {
  "bid.submit":              { icon: "⚡", label: "Bid submission",        risk: "medium" },
  "bid.withdraw":            { icon: "↩", label: "Bid withdrawal",         risk: "medium" },
  "webhook.create":          { icon: "🔗", label: "Webhook endpoint added", risk: "high"   },
  "webhook.delete":          { icon: "✂", label: "Webhook endpoint removed",risk: "high"   },
  "api_key.create":          { icon: "🔑", label: "API key created",        risk: "high"   },
  "api_key.revoke":          { icon: "🔒", label: "API key revoked",        risk: "high"   },
  "user.invite":             { icon: "👤", label: "User invited",           risk: "medium" },
  "user.role_change":        { icon: "🔄", label: "Role changed",           risk: "high"   },
  "user.remove":             { icon: "✕",  label: "User removed",           risk: "high"   },
  "institution.approve":     { icon: "✓",  label: "Institution approved",   risk: "high"   },
  "institution.suspend":     { icon: "⊘",  label: "Institution suspended",  risk: "high"   },
  "institution.modules_update":{ icon: "◈", label: "Modules updated",       risk: "high"   },
};

const RISK_STYLE = {
  low:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high:   "bg-red-50 text-red-600 border border-red-200",
};

// ─────────────────────────────────────────────────────────────────────────────
// ActionSummary — human-readable action effect table
// ─────────────────────────────────────────────────────────────────────────────

function ActionSummary({ action }: { action: PendingAction }) {
  const p = action.payload as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];

  if (action.action_category === "bid.submit") {
    if (p.amount_offered) rows.push({ label: "Amount offered", value: `MUR ${Number(p.amount_offered).toLocaleString()}` });
    if (p.rate)           rows.push({ label: "Interest rate",  value: `${(Number(p.rate) * 100).toFixed(2)}%` });
    if (p.rate_type)      rows.push({ label: "Rate type",      value: String(p.rate_type) });
    if (p.term_months)    rows.push({ label: "Loan term",      value: `${p.term_months} months` });
    const notes = (p.conditions as Record<string, unknown>)?.notes;
    if (notes) rows.push({ label: "Conditions", value: String(notes) });
  } else if (action.action_category === "bid.withdraw") {
    const reason = (p.conditions as Record<string, unknown>)?.withdraw_reason;
    if (reason) rows.push({ label: "Withdrawal reason", value: String(reason) });
  } else {
    // Generic: show scalar keys only (no nested objects or internal IDs)
    const skip = new Set(["id", "institution_id", "submitted_via"]);
    for (const [k, v] of Object.entries(p)) {
      if (!skip.has(k) && typeof v !== "object" && v != null) {
        rows.push({ label: k.replace(/_/g, " "), value: String(v) });
      }
    }
  }

  if (!rows.length) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <FileText className="w-3.5 h-3.5 text-ficium" aria-hidden />
        <span className="text-[11px] font-bold text-ficium uppercase tracking-wider">
          Action summary
        </span>
      </div>
      <div className="bg-white border border-ink/[0.08] rounded-xl overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-3 text-[13px] ${
              i < rows.length - 1 ? "border-b border-ink/[0.06]" : ""
            }`}
          >
            <span className="text-muted capitalize">{row.label}</span>
            <span className="font-semibold text-ink max-w-[60%] text-right break-words">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClientDossier — anonymised client signals for bid actions
// ─────────────────────────────────────────────────────────────────────────────

function ClientDossier({ action }: { action: PendingAction }) {
  if (!action.action_category.startsWith("bid.")) return null;

  const p       = action.payload as Record<string, unknown>;
  const dossier = p.client_dossier as Record<string, unknown> | undefined;
  const client  = p.client        as Record<string, unknown> | undefined;

  if (!dossier && !client) return null;

  const fmtMUR = (v: unknown) =>
    typeof v === "number" && v > 0
      ? v >= 1_000_000 ? `MUR ${(v / 1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`
      : "—";

  const rows = [
    { label: "Monthly income",   value: fmtMUR(dossier?.monthly_income)                          },
    { label: "Net worth",        value: fmtMUR(dossier?.total_net_worth)                          },
    { label: "Employment",       value: dossier?.employment_status ? String(dossier.employment_status).replace(/_/g, " ") : "—" },
    { label: "Health score",     value: typeof dossier?.health_score     === "number" ? `${dossier.health_score}/100` : "—" },
    { label: "Risk score",       value: typeof dossier?.risk_score       === "number" ? `${dossier.risk_score}/100`   : "—" },
    { label: "Affordability",    value: typeof dossier?.affordability_score === "number" ? `${dossier.affordability_score}/100` : "—" },
    { label: "Existing loans",   value: dossier?.has_existing_loans ? "Yes" : dossier?.has_existing_loans === false ? "No" : "—" },
    { label: "Country",          value: client?.country  ? String(client.country)  : "—" },
    { label: "KYC status",       value: client?.kyc_status ? String(client.kyc_status).replace(/_/g, " ") : "—" },
  ].filter((r) => r.value !== "—");

  if (!rows.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-ficium" aria-hidden />
          <span className="text-[11px] font-bold text-ficium uppercase tracking-wider">
            Client dossier
          </span>
        </div>
        <span className="text-[10px] text-muted bg-ink/5 px-2 py-1 rounded-full">
          Anonymised · identity not disclosed
        </span>
      </div>
      <div className="bg-white border border-ink/[0.08] rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-ink/[0.06]">
          {rows.map((row, i) => (
            <div
              key={i}
              className={`px-4 py-3 text-[13px] ${i < rows.length - 2 ? "border-b border-ink/[0.06]" : ""}`}
            >
              <div className="text-[10px] text-muted mb-0.5 capitalize">{row.label}</div>
              <div className="font-semibold text-ink capitalize">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionCard — individual pending action item
// ─────────────────────────────────────────────────────────────────────────────

function ActionCard({
  action,
  onApprove,
  onReject,
  isApprovePending,
  isRejectPending,
  approveError,
  rejectError,
}: {
  action:           PendingAction;
  onApprove:        () => void;
  onReject:         (note: string) => void;
  isApprovePending: boolean;
  isRejectPending:  boolean;
  approveError?:    string;
  rejectError?:     string;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [showReject,  setShowReject]  = useState(false);
  const [rejectNote,  setRejectNote]  = useState("");

  const meta        = ACTION_META[action.action_category] ?? { icon: "⬡", label: action.action_category, risk: "medium" as const };
  const expiresMs   = new Date(action.expires_at).getTime() - Date.now();
  const isUrgent    = expiresMs < 4 * 3_600_000 && expiresMs > 0;
  const isExpired   = expiresMs <= 0;

  return (
    <article
      className={[
        "bg-white rounded-xl border overflow-hidden transition-all",
        isUrgent ? "border-amber-300" : "border-ink/[0.07]",
        isExpired ? "opacity-60" : "",
      ].join(" ")}
      aria-label={`Pending action: ${meta.label}`}
    >
      {/* Header row */}
      <div className="px-5 py-4 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center flex-shrink-0 text-lg"
          aria-hidden
        >
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[14px] text-ink">{meta.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RISK_STYLE[meta.risk]}`}>
              {meta.risk} risk
            </span>
            <code className="text-[11px] text-muted bg-ink/[0.04] px-2 py-0.5 rounded-lg font-mono">
              {action.resource_type}
            </code>
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            Initiated by <span className="font-medium text-ink/70">{action.maker_role}</span>
            {" · "}
            {formatDistanceToNow(action.initiated_at)} ago
          </div>
        </div>

        <div className={`text-right text-[12px] flex-shrink-0 ${isUrgent ? "text-amber-600 font-semibold" : "text-muted"}`}>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            {isExpired ? "Expired" : `Expires in ${formatDistanceToNow(action.expires_at)}`}
          </div>
          {isUrgent && !isExpired && (
            <div className="flex items-center gap-1 text-[11px] text-amber-500 mt-0.5">
              <AlertTriangle className="w-3 h-3" aria-hidden />
              Action required soon
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse action details" : "Expand action details"}
          aria-expanded={expanded}
          className="text-muted hover:text-ink transition-colors ml-1"
        >
          {expanded
            ? <ChevronUp className="w-5 h-5" />
            : <ChevronDown className="w-5 h-5" />
          }
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-ink/[0.07] px-5 py-4 bg-cream/40 space-y-4">
          <ActionSummary  action={action} />
          <ClientDossier  action={action} />
        </div>
      )}

      {/* Action buttons / reject form */}
      {!isExpired && (
        <div className="border-t border-ink/[0.07] px-5 py-3.5">
          {showReject ? (
            <div className="flex items-center gap-3">
              <input
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Reason for rejection (required)"
                aria-label="Rejection reason"
                className={`flex-1 ${inputCls} py-2`}
              />
              <Btn
                variant="danger"
                size="sm"
                icon={XCircle}
                onClick={() => { onReject(rejectNote); setShowReject(false); setRejectNote(""); }}
                disabled={!rejectNote.trim()}
                loading={isRejectPending}
              >
                Confirm reject
              </Btn>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => { setShowReject(false); setRejectNote(""); }}
              >
                Cancel
              </Btn>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Btn
                variant="primary"
                size="sm"
                icon={CheckCircle}
                onClick={onApprove}
                loading={isApprovePending}
              >
                Approve
              </Btn>
              <Btn
                variant="secondary"
                size="sm"
                icon={XCircle}
                onClick={() => setShowReject(true)}
              >
                Reject
              </Btn>
              <code
                className="ml-auto text-[10px] text-muted/50 font-mono"
                title={action.id}
              >
                {action.id.slice(0, 8)}…
              </code>
            </div>
          )}

          {(approveError || rejectError) && (
            <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mt-3">
              {approveError ?? rejectError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionApprovals() {
  const { data: actions = [], isLoading } = usePendingActions();
  const approveAction = useApproveAction();
  const rejectAction  = useRejectAction();

  const pending = actions.filter((a) => a.action_status === "pending");
  const urgent  = pending.filter(
    (a) => new Date(a.expires_at).getTime() - Date.now() < 4 * 3_600_000
  ).length;

  const handleApprove = useCallback(
    (actionId: string) => approveAction.mutate({ actionId }),
    [approveAction]
  );
  const handleReject = useCallback(
    (actionId: string, note: string) => rejectAction.mutate({ actionId, note }),
    [rejectAction]
  );

  return (
    <main className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <SectionHeader
        title="Approvals"
        subtitle={`Maker-checker queue · ${pending.length} pending`}
        badge={
          <span className="flex items-center gap-1.5 bg-ficium/8 text-ficium text-[11px] font-bold px-3 py-1.5 rounded-full border border-ficium/20">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
            FOUR-EYES ENFORCED
          </span>
        }
      />

      <InlineAlert variant="info">
        Every material action requires a second admin to approve.{" "}
        <strong>You cannot approve an action you initiated.</strong>
        {" "}All decisions are recorded in the immutable audit log.
      </InlineAlert>

      {urgent > 0 && (
        <div className="mt-4">
          <InlineAlert variant="warning">
            <strong>{urgent} action{urgent > 1 ? "s" : ""}</strong> expiring within 4 hours — review immediately.
          </InlineAlert>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {isLoading && (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-ink/[0.06] rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-ink/[0.06] rounded" />
                  <div className="h-3 w-32 bg-ink/[0.04] rounded" />
                </div>
              </div>
            </div>
          ))
        )}

        {!isLoading && pending.length === 0 && (
          <EmptyState
            icon={CheckCircle}
            title="All clear"
            description="No pending approvals"
          />
        )}

        {!isLoading && pending.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onApprove={() => handleApprove(action.id)}
            onReject={(note) => handleReject(action.id, note)}
            isApprovePending={approveAction.isPending}
            isRejectPending={rejectAction.isPending}
            approveError={(approveAction.error as Error)?.message}
            rejectError={(rejectAction.error as Error)?.message}
          />
        ))}
      </div>
    </main>
  );
}
