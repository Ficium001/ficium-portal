// =============================================================
// Ficium 3 — Institution Approvals (Maker-Checker)
// Ficium light theme.
// Payload is hidden. Approver sees action summary + client dossier.
// =============================================================
import { useState } from "react";
import { Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, FileText, User } from "lucide-react";
import { usePendingActions, useApproveAction, useRejectAction } from "../../hooks/useInstitution";
import { formatDistanceToNow } from "../../lib/utils";
import type { PendingAction } from "../../types/institution";

export default function InstitutionApprovals() {
  const { data: actions = [], isLoading } = usePendingActions();
  const approveAction = useApproveAction();
  const rejectAction  = useRejectAction();
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [rejectNote,  setRejectNote]  = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const inputCls = "w-full bg-white border border-ink/[0.12] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 transition-all";

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Approvals</h1>
          <p className="text-muted mt-1.5">Maker-checker queue · {actions.length} pending</p>
        </div>
        <span className="bg-ficium/8 text-ficium text-[12px] font-bold px-4 py-2 rounded-full">
          FOUR-EYES ENFORCED
        </span>
      </div>

      <div className="bg-ficium/5 border border-ficium/15 rounded-2xl px-5 py-4 mb-6 text-[13px] text-ink/70">
        Every material action requires a second admin to approve. You cannot approve an action you initiated.
      </div>

      {isLoading && (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && actions.length === 0 && (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-ink mb-1">All clear</p>
          <p className="text-muted text-[13px]">No pending approvals</p>
        </div>
      )}

      <div className="space-y-4">
        {actions.map(action => {
          const isExpanded  = expanded === action.id;
          const isRejecting = rejectingId === action.id;
          const expiresIn   = new Date(action.expires_at).getTime() - Date.now();
          const isUrgent    = expiresIn < 4 * 60 * 60 * 1000 && expiresIn > 0;
          const isExpired   = expiresIn <= 0;

          return (
            <div key={action.id} className={`bg-white rounded-2xl overflow-hidden shadow-card ${isUrgent ? "ring-2 ring-amber-300/60" : ""}`}>
              <div className="px-6 py-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-ficium/8 flex items-center justify-center flex-shrink-0 text-[16px]">
                  {actionEmoji(action.action_category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <code className="text-[13px] font-bold text-ink">{action.action_category}</code>
                    <span className="text-ink/20">·</span>
                    <span className="text-[12px] text-muted">{action.resource_type}</span>
                  </div>
                  <div className="text-[12px] text-muted">
                    Initiated by <span className="font-medium text-ink/60">{action.maker_role}</span>
                    {" · "}{formatDistanceToNow(action.initiated_at)} ago
                  </div>
                </div>
                <div className={`text-right text-[12px] flex-shrink-0 ${isUrgent ? "text-amber-600 font-semibold" : "text-muted"}`}>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {isExpired ? "Expired" : `Expires ${formatDistanceToNow(action.expires_at)}`}
                  </div>
                  {isUrgent && !isExpired && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-500 mt-0.5">
                      <AlertTriangle className="w-3 h-3" />Expiring soon
                    </div>
                  )}
                </div>
                <button onClick={() => setExpanded(isExpanded ? null : action.id)} className="text-muted hover:text-ink transition-colors ml-1">
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-ink/[0.07] px-6 py-5 bg-cream/40 space-y-5">
                  <ActionSummary action={action} />
                  <ClientDossier action={action} />
                </div>
              )}

              {!isExpired && (
                <div className="border-t border-ink/[0.07] px-6 py-4 flex items-center gap-3">
                  {isRejecting ? (
                    <div className="flex-1 flex items-center gap-3">
                      <input value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                        placeholder="Reason for rejection (required)"
                        className={`flex-1 ${inputCls}`} />
                      <button onClick={async () => {
                        if (!rejectNote.trim()) return;
                        await rejectAction.mutateAsync({ actionId: action.id, note: rejectNote });
                        setRejectingId(null); setRejectNote("");
                      }} disabled={!rejectNote.trim() || rejectAction.isPending}
                        className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
                        {rejectAction.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Confirm reject
                      </button>
                      <button onClick={() => { setRejectingId(null); setRejectNote(""); }}
                        className="text-[13px] text-muted hover:text-ink px-3">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => approveAction.mutate({ actionId: action.id })}
                        disabled={approveAction.isPending}
                        className="flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors">
                        {approveAction.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve
                      </button>
                      <button onClick={() => setRejectingId(action.id)}
                        className="flex items-center gap-2 bg-white border border-red-200 hover:border-red-400 text-red-500 text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors">
                        <XCircle className="w-4 h-4" />Reject
                      </button>
                      <div className="ml-auto text-[11px] text-muted/50 font-mono">{action.id.slice(0, 8)}…</div>
                    </>
                  )}
                </div>
              )}

              {(approveAction.error || rejectAction.error) && (
                <div className="px-6 pb-4">
                  <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    {(approveAction.error as Error)?.message || (rejectAction.error as Error)?.message}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Action Summary (replaces raw payload) ───────────────────
function ActionSummary({ action }: { action: PendingAction }) {
  const p = action.payload as Record<string, unknown>;

  const rows: { label: string; value: string }[] = [];

  if (action.action_category === "bid.submit") {
    if (p.amount_offered) rows.push({ label: "Amount offered", value: `MUR ${Number(p.amount_offered).toLocaleString()}` });
    if (p.rate)           rows.push({ label: "Rate",            value: `${(Number(p.rate) * 100).toFixed(2)}%` });
    if (p.rate_type)      rows.push({ label: "Rate type",       value: String(p.rate_type) });
    if (p.term_months)    rows.push({ label: "Term",            value: `${p.term_months} months` });
    if (p.conditions && (p.conditions as Record<string,unknown>)?.notes) {
      rows.push({ label: "Conditions", value: String((p.conditions as Record<string,unknown>).notes) });
    }
  } else {
    // Generic: show top-level keys that are safe to display (no nested objects)
    for (const [k, v] of Object.entries(p)) {
      if (typeof v !== "object" && v != null) {
        rows.push({ label: k.replace(/_/g, " "), value: String(v) });
      }
    }
  }

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <FileText className="w-3.5 h-3.5 text-ficium" />
        <span className="text-[11px] font-bold text-ficium uppercase tracking-wider">Action Summary</span>
      </div>
      <div className="bg-white border border-ink/[0.08] rounded-xl overflow-hidden">
        {rows.map((row, i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-3 text-[13px] ${i < rows.length - 1 ? "border-b border-ink/[0.06]" : ""}`}>
            <span className="text-muted capitalize">{row.label}</span>
            <span className="font-semibold text-ink">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Client Dossier (for bid actions) ────────────────────────
function ClientDossier({ action }: { action: PendingAction }) {
  if (!action.action_category.startsWith("bid.")) return null;

  const p = action.payload as Record<string, unknown>;
  const dossier = p.client_dossier as Record<string, unknown> | undefined;
  const client  = p.client        as Record<string, unknown> | undefined;

  if (!dossier && !client) return null;

  const fmtMUR = (v: unknown) => typeof v === "number" && v > 0
    ? (v >= 1_000_000 ? `MUR ${(v/1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`)
    : "—";

  const score = (v: unknown, max = 100) =>
    typeof v === "number" ? `${v}/${max}` : "—";

  const dossierRows = [
    { label: "Monthly Income",   value: fmtMUR(dossier?.monthly_income) },
    { label: "Net Worth",        value: fmtMUR(dossier?.total_net_worth) },
    { label: "Employment",       value: dossier?.employment_status ? String(dossier.employment_status).replace(/_/g, " ") : "—" },
    { label: "Credit Score",     value: score(dossier?.health_score) },
    { label: "Affordability",    value: score(dossier?.affordability_score) },
    { label: "Risk Score",       value: score(dossier?.risk_score) },
    { label: "Tax Residency",    value: dossier?.tax_residency ? String(dossier.tax_residency) : "—" },
    { label: "Existing Loans",   value: dossier?.has_existing_loans ? "Yes" : "No" },
  ].filter(r => r.value !== "—");

  const clientRows = [
    { label: "Country",  value: client?.country  ? String(client.country)  : "—" },
    { label: "KYC",      value: client?.kyc_status ? String(client.kyc_status).replace(/_/g, " ") : "—" },
    { label: "Type",     value: client?.user_type ? String(client.user_type) : "—" },
  ].filter(r => r.value !== "—");

  const allRows = [...dossierRows, ...clientRows];
  if (allRows.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-ficium" />
          <span className="text-[11px] font-bold text-ficium uppercase tracking-wider">Client Dossier</span>
        </div>
        <span className="text-[10px] text-muted bg-ink/5 px-2 py-1 rounded-full">Anonymised · identity not disclosed</span>
      </div>
      <div className="bg-white border border-ink/[0.08] rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-ink/[0.06]">
          {allRows.map((row, i) => (
            <div key={i} className={`px-4 py-3 text-[13px] ${i < allRows.length - 2 ? "border-b border-ink/[0.06]" : ""}`}>
              <div className="text-[10px] text-muted mb-0.5 capitalize">{row.label}</div>
              <div className="font-semibold text-ink capitalize">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function actionEmoji(category: string): string {
  const map: Record<string, string> = {
    "bid.submit": "⚡", "bid.withdraw": "↩", "webhook.create": "🔗",
    "webhook.delete": "✂", "api_key.create": "🔑", "api_key.revoke": "🔒",
    "user.invite": "👤", "user.role_change": "🔄", "user.remove": "✕",
    "institution.approve": "✓", "institution.suspend": "⊘", "institution.modules_update": "◈",
  };
  return map[category] ?? "⬡";
}
