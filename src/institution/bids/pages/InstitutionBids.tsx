// =============================================================
// Ficium 3 — Institution Bids — Ficium light theme
// =============================================================
import { useState } from "react";
import { FileText, Filter, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import { useMyBids, useMyInstitution, useSubmitBid } from "../../hooks/useInstitution";
import { formatDistanceToNow, formatRate, formatAmount } from "../../lib/utils";

const STATUS_FILTERS = [
  { key: "all", label: "All bids" }, { key: "submitted", label: "Active" },
  { key: "accepted", label: "Accepted" }, { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" }, { key: "withdrawn", label: "Withdrawn" },
];

export default function InstitutionBids() {
  const { data: institution }                             = useMyInstitution();
  const [statusFilter, setStatusFilter]                   = useState("all");
  const { data: bids = [], isLoading }                    = useMyBids(statusFilter === "all" ? undefined : statusFilter);
  const submitBid                                         = useSubmitBid();
  const [expanded,      setExpanded]                      = useState<string | null>(null);
  const [withdrawId,    setWithdrawId]                    = useState<string | null>(null);
  const [withdrawNote,  setWithdrawNote]                  = useState("");
  const [withdrawSuccess, setWithdrawSuccess]             = useState(false);
  const modules = institution?.modules ?? [];

  const all = bids.length;
  const acceptedBids = bids.filter(b => b.status === "accepted").length;
  const winRate = all > 0 ? Math.round((acceptedBids / all) * 100) : 0;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      submitted: "bg-ficium/8 text-ficium",
      accepted:  "bg-green-50 text-green-700",
      rejected:  "bg-red-50 text-red-500",
      expired:   "bg-amber-50 text-amber-600",
      withdrawn: "bg-ink/5 text-muted",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${map[status] ?? map.expired}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">My bids</h1>
          <p className="text-muted mt-1.5">{bids.length} bid{bids.length !== 1 ? "s" : ""} · win rate {winRate}%</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total bids",   value: all },
          { label: "Active",       value: bids.filter(b => b.status === "submitted").length },
          { label: "Accepted",     value: acceptedBids },
          { label: "Win rate",     value: `${winRate}%` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-card">
            <div className="text-3xl font-bold text-ink tracking-tight mb-1">{s.value}</div>
            <div className="text-[13px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Success toast */}
      {withdrawSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3.5 flex items-center justify-between mb-5">
          <p className="text-[13px] text-green-700">✓ Withdrawal submitted for maker-checker approval.</p>
          <button onClick={() => setWithdrawSuccess(false)}><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter className="w-4 h-4 text-muted" />
        {STATUS_FILTERS.map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`text-[13px] font-medium px-4 py-1.5 rounded-full border transition-colors ${
              statusFilter === f.key
                ? "bg-ficium text-white border-ficium"
                : "bg-white border-ink/10 text-muted hover:border-ficium/40 hover:text-ficium"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" /></div>
      ) : bids.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card">
          <FileText className="w-12 h-12 text-ink/20 mx-auto mb-3" />
          <p className="font-semibold text-ink mb-1">No bids found</p>
          {statusFilter !== "all" && <button onClick={() => setStatusFilter("all")} className="text-[13px] text-ficium mt-2 hover:underline">Clear filter</button>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink/[0.06]">
                {["Product","Amount offered","Rate","Term","Via","Status","Submitted",""].map(h => (
                  <th key={h} className="px-5 pb-4 pt-5 text-left text-[12px] font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bids.map(bid => {
                const isOpen = expanded === bid.id;
                return (
                  <>
                    <tr key={bid.id} className="border-b border-ink/[0.04] hover:bg-cream/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[13px] text-ink">{bid.product_label ?? bid.product_type}</div>
                        <div className="text-[11px] text-muted font-mono mt-0.5">{bid.id.slice(0,8)}…</div>
                      </td>
                      <td className="px-5 py-4 text-[13px] font-semibold text-ink">{formatAmount(bid.amount_offered, bid.currency ?? "MUR")}</td>
                      <td className="px-5 py-4 text-[13px] font-bold text-ficium">{formatRate(bid.rate)}</td>
                      <td className="px-5 py-4 text-[13px] text-muted">{bid.term_months}m</td>
                      <td className="px-5 py-4">
                        <span className="bg-ink/[0.04] text-muted text-[11px] font-mono px-2 py-0.5 rounded">{bid.submitted_via}</span>
                      </td>
                      <td className="px-5 py-4">{statusBadge(bid.status)}</td>
                      <td className="px-5 py-4 text-[12px] text-muted whitespace-nowrap">{formatDistanceToNow(bid.submitted_at)} ago</td>
                      <td className="px-5 py-4">
                        <button onClick={() => setExpanded(isOpen ? null : bid.id)} className="text-muted hover:text-ink transition-colors">
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${bid.id}-d`} className="bg-cream/40">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Details</div>
                              {[["Request ID", bid.request_id?.slice(0,12)+"…"],["Rate type", bid.rate_type],["Response", bid.response_time_ms ? `${bid.response_time_ms}ms` : "—"]].map(([k,v]) => (
                                <div key={k} className="flex justify-between text-[12px]">
                                  <span className="text-muted">{k}</span>
                                  <span className="font-medium text-ink">{v}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Conditions</div>
                              {bid.conditions ? (
                                <pre className="text-[11px] text-muted bg-white border border-ink/[0.08] rounded-xl p-3 overflow-auto max-h-24 font-mono">
                                  {JSON.stringify(bid.conditions, null, 2)}
                                </pre>
                              ) : <span className="text-[12px] text-muted">None</span>}
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Actions</div>
                              {bid.status === "submitted" && modules.includes("marketplace") && (
                                <button onClick={() => setWithdrawId(bid.id)}
                                  className="flex items-center gap-2 border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-semibold px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors">
                                  <XCircle className="w-3.5 h-3.5" />Withdraw bid
                                </button>
                              )}
                              {bid.status === "accepted" && <div className="flex items-center gap-2 text-[12px] text-green-600"><CheckCircle className="w-4 h-4" />Accepted by client</div>}
                              {bid.status === "rejected" && <div className="flex items-center gap-2 text-[12px] text-red-500"><AlertTriangle className="w-4 h-4" />Client chose another offer</div>}
                              {bid.status === "expired"  && <div className="flex items-center gap-2 text-[12px] text-amber-600"><Clock className="w-4 h-4" />Bid expired</div>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Withdraw modal */}
      {withdrawId && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setWithdrawId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="font-display font-bold text-[17px] text-ink mb-3">Withdraw bid</h2>
            <p className="text-[13px] text-muted mb-4">This withdrawal requires maker-checker approval. Please provide a reason.</p>
            <textarea value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} rows={3}
              placeholder="Reason for withdrawal (required)..."
              className="w-full bg-white border border-ink/[0.12] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={async () => {
                if (!withdrawNote.trim()) return;
                const bid = bids.find(b => b.id === withdrawId);
                await submitBid.mutateAsync({ request_id: bid?.request_id ?? "", rate: 0, rate_type: "fixed", amount_offered: 0, term_months: 0, conditions: { withdraw_reason: withdrawNote }, submitted_via: "portal" });
                setWithdrawId(null); setWithdrawNote(""); setWithdrawSuccess(true);
              }} disabled={!withdrawNote.trim() || submitBid.isPending}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors">
                {submitBid.isPending ? "Submitting…" : "Submit withdrawal"}
              </button>
              <button onClick={() => { setWithdrawId(null); setWithdrawNote(""); }}
                className="px-5 text-[13px] font-semibold text-muted border border-ink/10 rounded-xl hover:bg-ink/[0.03] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
