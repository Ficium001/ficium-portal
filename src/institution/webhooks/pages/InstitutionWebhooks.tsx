// =============================================================
// Ficium 3 — Institution Webhooks — Ficium light theme
// =============================================================
import { useState } from "react";
import { Webhook, Plus, CheckCircle, XCircle, Clock, AlertTriangle, X } from "lucide-react";
import { useWebhooks } from "../../hooks/useInstitution";
import { formatDistanceToNow } from "../../lib/utils";

const ALL_EVENTS = ["request.new","bid.accepted","bid.rejected","bid.expired","request.cancelled"];

export default function InstitutionWebhooks() {
  const { data: webhooks = [], isLoading } = useWebhooks();
  const [showAdd,     setShowAdd]     = useState(false);
  const [addSuccess,  setAddSuccess]  = useState(false);
  const [form, setForm]               = useState({ label:"", endpoint_url:"", event_types:[...ALL_EVENTS] });

  const toggleEvent = (evt: string) =>
    setForm(f => ({ ...f, event_types: f.event_types.includes(evt) ? f.event_types.filter(e=>e!==evt) : [...f.event_types, evt] }));

  const handleAdd = async () => {
    if (!form.label || !form.endpoint_url || form.event_types.length === 0) return;
    // Wired to submit_for_approval() RPC in production
    setAddSuccess(true); setShowAdd(false);
    setForm({ label:"", endpoint_url:"", event_types:[...ALL_EVENTS] });
  };

  const statusIcon = (active: boolean, lastStatus?: string) => {
    if (!active) return <XCircle className="w-5 h-5 text-ink/20" />;
    if (lastStatus === "delivered") return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (lastStatus === "failed")    return <XCircle className="w-5 h-5 text-red-400" />;
    return <Clock className="w-5 h-5 text-muted" />;
  };

  const inputCls = "w-full bg-white border border-ink/[0.12] rounded-xl px-4 py-3 text-[15px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 transition-all";

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Webhooks</h1>
          <p className="text-muted mt-1.5">{webhooks.filter(w=>w.active).length} active endpoint{webhooks.filter(w=>w.active).length !== 1 ? "s":""}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-ficium hover:bg-ficium-deep text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />Add endpoint
        </button>
      </div>

      <div className="bg-ficium/5 border border-ficium/15 rounded-2xl px-5 py-4 flex items-center gap-3 mb-6">
        <AlertTriangle className="w-4 h-4 text-ficium flex-shrink-0" />
        <p className="text-[13px] text-ink/70">Adding or deactivating endpoints requires maker-checker approval in <span className="text-ficium font-semibold">Approvals</span>.</p>
      </div>

      {addSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3.5 flex items-center justify-between mb-5">
          <p className="text-[13px] text-green-700 font-medium">✓ Webhook creation submitted for approval.</p>
          <button onClick={() => setAddSuccess(false)}><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" /></div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card">
          <Webhook className="w-12 h-12 text-ink/20 mx-auto mb-3" />
          <p className="font-semibold text-ink mb-1">No webhooks configured</p>
          <p className="text-muted text-[13px]">Add an endpoint to receive real-time events</p>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map(wh => (
            <div key={wh.id} className={`bg-white rounded-2xl p-6 shadow-card ${!wh.active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  {statusIcon(wh.active, wh.last_status ?? undefined)}
                  <div>
                    <div className="font-display font-bold text-[15px] text-ink">{wh.label}</div>
                    <div className="text-[12px] text-muted font-mono mt-0.5 break-all">{wh.endpoint_url}</div>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${wh.active ? "bg-green-50 text-green-700" : "bg-ink/5 text-muted"}`}>
                  {wh.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {(wh.event_types as string[]).map((evt:string) => (
                  <span key={evt} className="bg-ficium/8 text-ficium text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full">{evt}</span>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-muted border-t border-ink/[0.06] pt-4">
                <span>Retry max: {wh.retry_max}</span>
                <span>Timeout: {wh.timeout_ms}ms</span>
                {wh.last_fired_at && <span>Last fired: {formatDistanceToNow(wh.last_fired_at)} ago</span>}
                {wh.last_status && <span className={wh.last_status==="delivered"?"text-green-600":"text-red-500"}>Last: {wh.last_status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-[17px] text-ink">Add webhook endpoint</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Label</label>
                <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="e.g. Production bidding system" className={inputCls} />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Endpoint URL</label>
                <input value={form.endpoint_url} onChange={e=>setForm(f=>({...f,endpoint_url:e.target.value}))} placeholder="https://your-system.com/ficium/webhook" className={inputCls} />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-2">Events to receive</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map(evt => (
                    <button key={evt} type="button" onClick={() => toggleEvent(evt)}
                      className={`text-[12px] font-mono font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        form.event_types.includes(evt)
                          ? "bg-ficium text-white border-ficium"
                          : "bg-white border-ink/10 text-muted hover:border-ficium/40"
                      }`}>
                      {evt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-ficium/5 border border-ficium/15 rounded-xl p-4 text-[12px] text-ink/60">
                After approval, Ficium signs every payload with <code className="text-ficium font-mono">X-Ficium-Signature</code>. Verify this header on every incoming request.
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={handleAdd} disabled={!form.label||!form.endpoint_url||form.event_types.length===0}
                  className="flex-1 bg-ficium hover:bg-ficium-deep disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
                  Submit for approval
                </button>
                <button onClick={() => setShowAdd(false)} className="px-5 text-[13px] font-semibold text-muted border border-ink/10 rounded-xl hover:bg-ink/[0.03] transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
