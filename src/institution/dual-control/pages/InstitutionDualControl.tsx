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
import { usePendingActions, useApproveAction, useRejectAction } from "../../hooks/useInstitution";
import { portalApi } from "../../../shared/lib/portalApi";
import { formatDistanceToNow } from "../../lib/utils";
import type { PendingAction } from "../../types/institution";
import {
  SectionHeader, InlineAlert, EmptyState,
  Btn, inputCls, Modal,
} from "../../components/primitives";

// ─── Categories that belong on THIS page (not bid approvals) ─────────────────

const DUAL_CONTROL_CATEGORIES = new Set([
  "group.create",
  "group.update",
  "group.update_modules",
  "group.delete",
  "user.create",
  "user.update",
  "user.assign_group",
  "user.deactivate",
  "user.reactivate",
  "user.role_change",
  "user.remove",
  "user.invite",
  "webhook.create",
  "webhook.delete",
  "api_key.create",
  "api_key.revoke",
  "settings.update",
  "institution.modules_update",
]);

// ─── Action metadata ──────────────────────────────────────────────────────────

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
  "user.role_change":           { icon: "🔄", label: "Role changed",           risk: "high"   },
  "user.remove":                { icon: "✕",  label: "User removed",           risk: "high"   },
  "user.invite":                { icon: "👤", label: "User invited",           risk: "medium" },
  "webhook.create":             { icon: "🔗", label: "Webhook added",          risk: "high"   },
  "webhook.delete":             { icon: "✂",  label: "Webhook removed",        risk: "high"   },
  "api_key.create":             { icon: "🔑", label: "API key created",        risk: "high"   },
  "api_key.revoke":             { icon: "🔒", label: "API key revoked",        risk: "high"   },
  "settings.update":            { icon: "⚙",  label: "Settings updated",       risk: "medium" },
  "institution.modules_update": { icon: "◈",  label: "Modules updated",        risk: "high"   },
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

// ─── Action card ──────────────────────────────────────────────────────────────

function ActionCard({
  action, onApprove, onReject, isApprovePending, isRejectPending, approveError, rejectError,
}: {
  action:           PendingAction;
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
  const isUrgent  = expiresMs < 4 * 3_600_000 && expiresMs > 0;
  const isExpired = expiresMs <= 0;

  return (
    <article
      className={[
        "bg-white rounded-xl border overflow-hidden transition-all",
        isUrgent ? "border-amber-300" : "border-ink/[0.07]",
        isExpired ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center flex-shrink-0 text-lg" aria-hidden>
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
            Initiated by <span className="font-medium text-ink/70">{action.maker_role ?? "maker"}</span>
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
          <ActionSummary action={action} />
        </div>
      )}

      {!isExpired && (
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
          <div className="bg-ink/[0.03] border border-ink/[0.10] rounded-xl px-4 py-3">
            <p className="text-[11px] text-muted mb-0.5">Username (for login)</p>
            <code className="text-[13px] font-mono font-bold text-ink">{username}</code>
          </div>
        )}
        <div>
          <p className="text-[12px] text-muted mb-1">Temporary password — share this with the user</p>
          <div className="flex items-center gap-2 bg-ink/[0.03] border border-ink/[0.10] rounded-xl px-4 py-3">
            <Key className="w-4 h-4 text-ficium flex-shrink-0" aria-hidden />
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

export default function InstitutionDualControl() {
  const { data: actions = [], isLoading } = usePendingActions();
  const approveAction = useApproveAction();
  const rejectAction  = useRejectAction();

  const [provisionResult, setProvisionResult] = useState<{
    email: string; fullName: string; tempPassword: string; username?: string;
  } | null>(null);

  const pending = actions.filter(
    a => a.action_status === "pending" && DUAL_CONTROL_CATEGORIES.has(a.action_category)
  );
  const urgent = pending.filter(
    a => new Date(a.expires_at).getTime() - Date.now() < 4 * 3_600_000
  ).length;

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
          } else if (action?.action_category === "user.update") {
            try {
              await portalApi.post(`/approvals/${actionId}/execute-update`, {});
            } catch (err) {
              console.error("Execute update failed:", err);
            }
          } else if (action?.action_category === "user.deactivate") {
            try {
              await portalApi.post(`/members/${(action.payload as any)?.member_id}/deactivate`, {});
            } catch (err) {
              console.error("Deactivate failed:", err);
            }
          } else if (action?.action_category === "user.reactivate") {
            try {
              await portalApi.post(`/members/${(action.payload as any)?.member_id}/reactivate`, {});
            } catch (err) {
              console.error("Reactivate failed:", err);
            }
          }
        },
      });
    },
    [approveAction, actions]
  );

  const handleReject = useCallback(
    (actionId: string, note: string) => rejectAction.mutate({ actionId, note }),
    [rejectAction]
  );

  return (
    <main className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <SectionHeader
        title="Dual Control"
        subtitle={`Internal maker-checker queue · ${pending.length} pending`}
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

      {urgent > 0 && (
        <div className="mt-4">
          <InlineAlert variant="warning">
            <strong>{urgent} action{urgent > 1 ? "s" : ""}</strong> expiring within 4 hours — review immediately.
          </InlineAlert>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-ink/[0.06] rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-ink/[0.06] rounded" />
                <div className="h-3 w-32 bg-ink/[0.04] rounded" />
              </div>
            </div>
          </div>
        ))}

        {!isLoading && pending.length === 0 && (
          <EmptyState
            icon={GitMerge}
            title="All clear"
            description="No pending internal actions requiring approval"
          />
        )}

        {!isLoading && pending.map(action => (
          <ActionCard
            key={action.id}
            action={action}
            onApprove={() => handleApprove(action.id)}
            onReject={note => handleReject(action.id, note)}
            isApprovePending={approveAction.isPending}
            isRejectPending={rejectAction.isPending}
            approveError={(approveAction.error as Error)?.message}
            rejectError={(rejectAction.error as Error)?.message}
          />
        ))}
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
    </main>
  );
}
