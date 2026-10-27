/**
 * @page InstitutionDualControl
 * @route /inst-dual-control
 * @access protected — inst:dual_control
 * @description
 *   Internal four-eyes approval queue for institution admin actions:
 *   group.create, user.create, user.assign_group, webhook.create/delete,
 *   api_key operations, settings changes.
 *
 *   Bid approvals (bid.submit, bid.withdraw) are handled separately
 *   in /approvals (Marketplace → Approval).
 *
 * @owner Ficium Engineering
 */

import { useState, useCallback } from "react";
import {
  Clock, CheckCircle, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, FileText, ShieldCheck, GitMerge, Copy, Key,
} from "lucide-react";
import {
  useApprovalQueue, useApprovalQueueCounts, useApproveAction, useRejectAction,
} from "@/institution/hooks/useInstitution";
import { portalApi } from "@/shared/lib/portalApi";
import { formatDistanceToNow } from "@/institution/lib/utils";
import type { PendingAction, ApprovalQueueState } from "@/institution/types/institution";
import {
  SectionHeader, InlineAlert, EmptyState,
  Btn, inputCls, Modal,
} from "@/institution/components/primitives";
import { PageFrame } from "@/shared/components/PageFrame"
import { SectionTabs, type SectionTab } from "@/shared/components/SectionTabs"

// ─── Categories that belong on THIS page (not bid approvals) ─────────────────

// ─── Action metadata ──────────────────────────────────────────────────────────
// Visibility is controlled server-side by module_permissions in the JWT.
// bid.* is excluded client-side only (those go through Marketplace Approvals).

const ACTION_META: Record<string, { icon: string; label: string; risk: "low" | "medium" | "high" }> = {
  "group.create":               { icon: "◈",  label: "Group created",          risk: "medium" },
  "group.update":               { icon: "◈",  label: "Group updated",          risk: "medium" },
  "group.update_modules":       { icon: "◈",  label: "Group modules updated",  risk: "medium" },
  "group.delete":               { icon: "◈",  label: "Group deleted",          risk: "high"   },
  "user.create":                { icon: "👤", label: "User created",           risk: "medium" },
  "user.update":                { icon: "✏️", label: "User updated",           risk: "low"    },
  "user.assign_group":          { icon: "🔄", label: "Group assignment",       risk: "medium" },
  "user.deactivate":            { icon: "🔒", label: "User deactivated",       risk: "high"   },
  "user.reactivate":            { icon: "🔓", label: "User reactivated",       risk: "medium" },
  "user.reset_password":        { icon: "🔑", label: "Password reset",         risk: "high"   },
  "four_eyes.disable":          { icon: "⚠",  label: "Four-eyes switched off", risk: "high"   },
  "user.role_change":           { icon: "🔄", label: "Role changed",           risk: "high"   },
  "user.remove":                { icon: "✕",  label: "User removed",           risk: "high"   },
  "user.invite":                { icon: "👤", label: "User invited",           risk: "medium" },
  "webhook.create":             { icon: "🔗", label: "Webhook added",          risk: "high"   },
  "webhook.delete":             { icon: "✂",  label: "Webhook removed",        risk: "high"   },
  "api_key.create":             { icon: "🔑", label: "API key created",        risk: "high"   },
  "api_key.revoke":             { icon: "🔒", label: "API key revoked",        risk: "high"   },
  "settings.update":            { icon: "⚙",  label: "Settings updated",       risk: "medium" },
  "institution.modules_update": { icon: "◈",  label: "Modules updated",        risk: "high"   },
  // Marketplace
  "bid.submit":                 { icon: "📋", label: "Bid submitted",           risk: "medium" },
  "bid.withdraw":               { icon: "↩",  label: "Bid withdrawn",           risk: "medium" },
  // Products & benefits
  "benefit.create":             { icon: "⭐", label: "Benefit added",           risk: "low"    },
  "benefit.update":             { icon: "✏️", label: "Benefit updated",         risk: "low"    },
  "benefit.delete":             { icon: "✕",  label: "Benefit removed",         risk: "medium" },
  "product.update":             { icon: "📦", label: "Product updated",         risk: "medium" },
};

const RISK_STYLE = {
  low:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high:   "bg-red-50 text-red-600 border border-red-200",
};

// ─── Action summary ───────────────────────────────────────────────────────────

function ActionSummary({ action }: { action: PendingAction }) {
  const p = action.payload as Record<string, unknown>;
  const skip = new Set(["id", "institution_id", "submitted_via"]);
  const rows: { label: string; value: string }[] = [];

  for (const [k, v] of Object.entries(p)) {
    if (!skip.has(k) && typeof v !== "object" && v != null) {
      rows.push({ label: k.replace(/_/g, " "), value: String(v) });
    }
  }

  // module_permissions array
  if (Array.isArray(p.module_permissions)) {
    rows.push({ label: "module permissions", value: (p.module_permissions as string[]).join(", ") });
  }

  if (!rows.length) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <FileText className="w-3.5 h-3.5 text-ficium" aria-hidden />
        <span className="text-[11px] font-bold text-ficium uppercase tracking-wider">
          Action details
        </span>
      </div>
      <div className="bg-white border border-ink/8 rounded-xl overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-3 text-[13px] ${
              i < rows.length - 1 ? "border-b border-ink/6" : ""
            }`}
          >
            <span className="text-muted capitalize">{row.label}</span>
            <span className="font-semibold text-ink max-w-[60%] text-right wrap-break-word">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Action card ──────────────────────────────────────────────────────────────

const STATE_LABEL: Record<ApprovalQueueState, string> = {
  pending: "Pending", expired: "Expired", approved: "Authorised", rejected: "Rejected",
};

function ActionCard({
  action, state, onApprove, onReject, isApprovePending, isRejectPending, approveError, rejectError,
}: {
  action:           PendingAction;
  state:            ApprovalQueueState;
  onApprove:        () => void;
  onReject:         (note: string) => void;
  isApprovePending: boolean;
  isRejectPending:  boolean;
  approveError?:    string;
  rejectError?:     string;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const meta      = ACTION_META[action.action_category] ?? { icon: "⬡", label: action.action_category, risk: "medium" as const };
  const expiresMs = new Date(action.expires_at).getTime() - Date.now();
  const isPending = state === "pending";
  const isUrgent  = isPending && expiresMs < 4 * 3_600_000 && expiresMs > 0;
  const canDecide = isPending && !action.is_mine;
  const decidedAt = action.checked_at ?? action.created_at;

  return (
    <article
      aria-label={`${STATE_LABEL[state]} action: ${meta.label}`}
      className={[
        "bg-white rounded-xl border overflow-hidden transition-all",
        isUrgent ? "border-amber-300" : "border-ink/[0.07]",
        state === "expired" ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center shrink-0 text-lg" aria-hidden>
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[14px] text-ink">{meta.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RISK_STYLE[meta.risk]}`}>
              {meta.risk} risk
            </span>
            <code className="text-[11px] text-muted bg-ink/4 px-2 py-0.5 rounded-lg font-mono">
              {action.resource_type}
            </code>
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            Initiated by{" "}
            <span className="font-medium text-ink/70">{action.is_mine ? "you" : (action.maker_role ?? "maker")}</span>
            {" · "}
            {formatDistanceToNow(action.initiated_at)} ago
          </div>
        </div>

        <div className={`text-right text-[12px] shrink-0 ${isUrgent ? "text-amber-600 font-semibold" : "text-muted"}`}>
          {isPending && (
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3.5 h-3.5" aria-hidden />
              Expires in {formatDistanceToNow(action.expires_at)}
            </div>
          )}
          {state === "expired" && (
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3.5 h-3.5" aria-hidden />
              Expired {formatDistanceToNow(action.expires_at)} ago
            </div>
          )}
          {state === "approved" && (
            <div className="flex items-center gap-1 justify-end text-emerald-700">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden />
              Authorised {formatDistanceToNow(decidedAt)} ago
            </div>
          )}
          {state === "rejected" && (
            <div className="flex items-center gap-1 justify-end text-red-600">
              <XCircle className="w-3.5 h-3.5" aria-hidden />
              Rejected {formatDistanceToNow(decidedAt)} ago
            </div>
          )}
          {isUrgent && (
            <div className="flex items-center gap-1 text-[11px] text-amber-500 mt-0.5 justify-end">
              <AlertTriangle className="w-3 h-3" aria-hidden />
              Action required soon
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          className="text-muted hover:text-ink transition-colors ml-1"
        >
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-ink/[0.07] px-5 py-4 bg-cream/40 space-y-4">
          {(state === "approved" || state === "rejected") && (
            <div className="text-[13px] text-ink/80">
              <span className="font-semibold">
                {state === "approved" ? "Authorised" : "Rejected"} by {action.checker_role ?? "a checker"}
              </span>
              {action.checker_note ? <> · {action.checker_note}</> : null}
            </div>
          )}
          {state === "expired" && (
            <div className="text-[13px] text-ink/80">
              Expired without a second approver. It can no longer be approved.
            </div>
          )}
          <ActionSummary action={action} />
        </div>
      )}

      {isPending && action.is_mine && (
        <div className="border-t border-ink/[0.07] px-5 py-3 text-[12px] text-muted flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          Waiting for a second approver. You can't approve your own action.
        </div>
      )}

      {canDecide && (
        <div className="border-t border-ink/[0.07] px-5 py-3.5">
          {showReject ? (
            <div className="flex items-center gap-3">
              <input
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Reason for rejection (required)"
                className={`flex-1 ${inputCls} py-2`}
              />
              <Btn
                variant="danger" size="sm" icon={XCircle}
                onClick={() => { onReject(rejectNote); setShowReject(false); setRejectNote(""); }}
                disabled={!rejectNote.trim()}
                loading={isRejectPending}
              >
                Confirm reject
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => { setShowReject(false); setRejectNote(""); }}>
                Cancel
              </Btn>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Btn variant="primary" size="sm" icon={CheckCircle} onClick={onApprove} loading={isApprovePending}>
                Approve
              </Btn>
              <Btn variant="secondary" size="sm" icon={XCircle} onClick={() => setShowReject(true)}>
                Reject
              </Btn>
              <code className="ml-auto text-[10px] text-muted/50 font-mono" title={action.id}>
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

// ─── Temp password modal ──────────────────────────────────────────────────────

function TempPasswordModal({
  open, onClose, email, fullName, tempPassword, username,
}: {
  open: boolean; onClose: () => void;
  email: string; fullName: string; tempPassword: string; username?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Modal open={open} onClose={onClose} title="User provisioned">
      <div className="space-y-4">
        <InlineAlert variant="success">
          <strong>{fullName || email}</strong> has been created and can now log in to the portal.
        </InlineAlert>
        {username && (
          <div className="bg-ink/3 border border-ink/10 rounded-xl px-4 py-3">
            <p className="text-[11px] text-muted mb-0.5">Username (for login)</p>
            <code className="text-[13px] font-mono font-bold text-ink">{username}</code>
          </div>
        )}
        <div>
          <p className="text-[12px] text-muted mb-1">Temporary password — share this with the user</p>
          <div className="flex items-center gap-2 bg-ink/3 border border-ink/10 rounded-xl px-4 py-3">
            <Key className="w-4 h-4 text-ficium shrink-0" aria-hidden />
            <code className="flex-1 text-[14px] font-mono font-bold text-ink tracking-wider">{tempPassword}</code>
            <button onClick={copy} className="text-ficium hover:text-ficium-deep transition-colors" aria-label="Copy password">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          {copied && <p className="text-[11px] text-good mt-1">Copied to clipboard</p>}
        </div>
        <InlineAlert variant="warning">
          The user must change this password on first login. This password will not be shown again.
        </InlineAlert>
        <p className="text-[12px] text-muted">
          Login URL: <strong>https://ficium-portal.vercel.app</strong><br />
          Username: <strong>{username || email}</strong>
        </p>
        <Btn variant="primary" onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_COPY: Record<ApprovalQueueState, { title: string; description: string }> = {
  pending:  { title: "All clear",             description: "No internal actions are waiting for a decision." },
  expired:  { title: "Nothing expired",       description: "Actions that pass their deadline without a second approver appear here." },
  approved: { title: "Nothing authorised yet", description: "Approved actions appear here." },
  rejected: { title: "Nothing rejected",      description: "Rejected actions appear here, with the checker's reason." },
};

const PAGE_SIZE = 50;
const STATE_ORDER: ApprovalQueueState[] = ["pending", "expired", "approved", "rejected"];

export default function InstitutionDualControl() {
  const [state, setState] = useState<ApprovalQueueState>("pending");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data: counts } = useApprovalQueueCounts("internal");
  const { data, isLoading } = useApprovalQueue("internal", state, limit);
  const approveAction = useApproveAction();
  const rejectAction  = useRejectAction();

  const [provisionResult, setProvisionResult] = useState<{
    email: string; fullName: string; tempPassword: string; username?: string;
  } | null>(null);

  // Server filters by module_permissions AND excludes bid.* (scope=internal);
  // those go through the Marketplace Approvals screen.
  const actions = data?.items ?? [];
  const total   = data?.total ?? 0;
  // Pending splits in two: what you can decide, and what you started yourself.
  const needsMe = state === "pending" ? actions.filter(a => !a.is_mine) : actions;
  const waiting = state === "pending" ? actions.filter(a => a.is_mine) : [];
  const urgent  = needsMe.filter(a => {
    const ms = new Date(a.expires_at).getTime() - Date.now();
    return ms > 0 && ms < 4 * 3_600_000;
  }).length;

  const tabs: SectionTab<ApprovalQueueState>[] = STATE_ORDER.map(k => ({
    key: k,
    label: STATE_LABEL[k],
    // Pending shows only what you can act on; the rest are plain totals.
    badge: counts ? String(k === "pending" ? counts.needs_me : counts[k]) : undefined,
  }));

  const handleApprove = useCallback(
    (actionId: string) => {
      const action = actions.find(a => a.id === actionId);
      approveAction.mutate({ actionId }, {
        onSuccess: async () => {
          if (action?.action_category === "user.create") {
            try {
              const result = await portalApi.post<{
                ok: boolean; created: boolean;
                email: string; full_name: string; temp_password: string; username?: string;
              }>(`/approvals/${actionId}/provision-user`, {});
              if (result.created) {
                setProvisionResult({
                  email: result.email,
                  fullName: result.full_name,
                  tempPassword: result.temp_password,
                  username: result.username,
                });
              }
            } catch (err) {
              console.error("Provision failed:", err);
            }
          }
          if (action?.action_category === "user.reset_password") {
            // Released once, only to the approver (db/043). If this call is
            // interrupted, the server keeps it unreleased; nothing leaks.
            try {
              const r = await portalApi.post<{
                email: string; full_name: string | null; temp_password: string;
              }>(`/approvals/${actionId}/release-password`, {});
              setProvisionResult({
                email: r.email, fullName: r.full_name ?? r.email, tempPassword: r.temp_password,
              });
            } catch (err) {
              console.error("Password release failed:", err);
            }
          }
          // user.update / user.deactivate / user.reactivate: the database
          // applies the change in the same transaction as the approval
          // (db/040). Do NOT call the member endpoints here: they now queue a
          // new four-eyes action, so calling them would loop.
        },
      });
    },
    [approveAction, actions]
  );

  const handleReject = useCallback(
    (actionId: string, note: string) => rejectAction.mutate({ actionId, note }),
    [rejectAction]
  );

  const card = (action: PendingAction) => (
    <ActionCard
      key={action.id}
      action={action}
      state={state}
      onApprove={() => handleApprove(action.id)}
      onReject={note => handleReject(action.id, note)}
      isApprovePending={approveAction.isPending}
      isRejectPending={rejectAction.isPending}
      approveError={(approveAction.error as Error)?.message}
      rejectError={(rejectAction.error as Error)?.message}
    />
  );

  return (
    <PageFrame className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <SectionHeader
        title="Dual Control"
        subtitle={`Internal maker-checker queue · ${counts?.needs_me ?? 0} need your decision`}
        badge={
          <span className="flex items-center gap-1.5 bg-ficium/8 text-ficium text-[11px] font-bold px-3 py-1.5 rounded-full border border-ficium/20">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
            FOUR-EYES ENFORCED
          </span>
        }
      />

      <InlineAlert variant="info">
        Internal admin actions require a second admin to approve.{" "}
        <strong>You cannot approve an action you initiated.</strong>
        {" "}All decisions are recorded in the immutable audit log.
      </InlineAlert>

      {state === "pending" && urgent > 0 && (
        <div className="mt-4">
          <InlineAlert variant="warning">
            <strong>{urgent} action{urgent > 1 ? "s" : ""}</strong> expiring within 4 hours — review immediately.
          </InlineAlert>
        </div>
      )}

      <div className="mt-6">
        <SectionTabs
          tabs={tabs}
          active={state}
          onChange={k => { setState(k); setLimit(PAGE_SIZE); }}
          idPrefix="dualcontrol"
          label="Internal approval status"
        />
      </div>

      <div
        role="tabpanel"
        id={`dualcontrol-panel-${state}`}
        aria-labelledby={`dualcontrol-tab-${state}`}
        className="mt-6 space-y-4"
      >
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-ink/6 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-ink/6 rounded-sm" />
                <div className="h-3 w-32 bg-ink/4 rounded-sm" />
              </div>
            </div>
          </div>
        ))}

        {!isLoading && actions.length === 0 && (
          <EmptyState
            icon={state === "expired" ? Clock : GitMerge}
            title={EMPTY_COPY[state].title}
            description={EMPTY_COPY[state].description}
          />
        )}

        {!isLoading && state === "pending" && needsMe.length > 0 && (
          <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Needs your decision</h2>
        )}
        {!isLoading && needsMe.map(card)}

        {!isLoading && waiting.length > 0 && (
          <>
            <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider pt-2">Waiting on others</h2>
            {waiting.map(card)}
          </>
        )}

        {!isLoading && actions.length < total && (
          <div className="pt-2 text-center">
            <Btn variant="secondary" size="sm" onClick={() => setLimit(n => n + PAGE_SIZE)}>
              Show more ({total - actions.length} more)
            </Btn>
          </div>
        )}
      </div>

      {provisionResult && (
        <TempPasswordModal
          open
          onClose={() => setProvisionResult(null)}
          email={provisionResult.email}
          fullName={provisionResult.fullName}
          tempPassword={provisionResult.tempPassword}
          username={provisionResult.username}
        />
      )}
    </PageFrame>
  );
}
