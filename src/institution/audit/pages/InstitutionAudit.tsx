// =============================================================
// Ficium 3 — Institution Audit Log — Ficium light theme
// =============================================================
import { useState, useMemo } from "react";
import { ScrollText, Filter, Download, X } from "lucide-react";
import { useAuditEvents } from "../../hooks/useInstitution";

export default function InstitutionAudit() {
  const [limit,  setLimit]  = useState(50);
  const [outcome,setOutcome] = useState("all");
  const [search, setSearch]  = useState("");
  const { data: events = [], isLoading } = useAuditEvents(limit);

  const filtered = useMemo(() => events.filter(e => {
    const mo = outcome === "all" || e.outcome === outcome;
    const ms = !search || e.event_label.toLowerCase().includes(search.toLowerCase()) || (e.resource_type ?? "").toLowerCase().includes(search.toLowerCase()) || (e.actor_role ?? "").toLowerCase().includes(search.toLowerCase());
    return mo && ms;
  }), [events, outcome, search]);

  const exportCSV = () => {
    const headers = ["Timestamp","Event","Resource","Resource ID","Actor role","Outcome","Note"];
    const rowData = filtered.map(e => [
      new Date(e.created_at).toISOString(),
      e.event_label,
      e.resource_type ?? "",
      e.resource_id ?? "",
      e.actor_role ?? "",
      e.outcome,
      e.outcome_note ?? "",
    ]);
    const csv = [headers, ...rowData]
      .map(row => row.map(v => JSON.stringify(v)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "ficium-audit-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const outcomeBadge = (o: string) => {
    const map: Record<string,string> = { success:"bg-green-50 text-green-700", rejected:"bg-red-50 text-red-500", failed:"bg-red-50 text-red-500", expired:"bg-amber-50 text-amber-600", logged:"bg-ink/5 text-muted" };
    return <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${map[o] ?? map.logged}`}>{o}</span>;
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Audit log</h1>
          <p className="text-muted mt-1.5">{filtered.length} event{filtered.length !== 1 ? "s" : ""} · append-only · WORM compliant</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 border border-ink/10 bg-white text-muted text-[13px] font-semibold px-4 py-2 rounded-xl hover:bg-ink/[0.03] transition-colors shadow-sm">
          <Download className="w-4 h-4" />Export CSV
        </button>
      </div>

      {/* FSC banner */}
      <div className="bg-ink/[0.03] border border-ink/[0.07] rounded-2xl px-5 py-3.5 flex items-center gap-3 mb-6">
        <ScrollText className="w-4 h-4 text-muted flex-shrink-0" />
        <p className="text-[12px] text-muted font-mono tracking-wide">APPEND-ONLY · WORM COMPLIANT · FSC MAURITIUS REPORTABLE · NO UPDATES OR DELETES PERMITTED</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:"Total events",    value:events.length },
          { label:"Successful",      value:events.filter(e=>e.outcome==="success").length },
          { label:"Rejected/failed", value:events.filter(e=>["rejected","failed"].includes(e.outcome)).length },
          { label:"Showing",         value:filtered.length },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-card">
            <div className="text-3xl font-bold text-ink tracking-tight mb-1">{s.value}</div>
            <div className="text-[13px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted" />
          {["all","success","rejected","failed"].map(o => (
            <button key={o} onClick={() => setOutcome(o)}
              className={`text-[13px] font-medium px-4 py-1.5 rounded-full border transition-colors ${outcome === o ? "bg-ficium text-white border-ficium" : "bg-white border-ink/10 text-muted hover:border-ficium/40 hover:text-ficium"}`}>
              {o.charAt(0).toUpperCase()+o.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search event, resource, role…"
            className="bg-white border border-ink/[0.12] rounded-xl px-4 py-2 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 w-60 transition-all" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card">
          <ScrollText className="w-12 h-12 text-ink/20 mx-auto mb-3" />
          <p className="font-semibold text-ink mb-1">No events match</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink/[0.06]">
                  {["Timestamp","Event","Resource","Actor role","Outcome","Note"].map(h => (
                    <th key={h} className="px-5 pb-4 pt-5 text-left text-[12px] font-semibold text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b border-ink/[0.04] hover:bg-cream/60 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="text-[13px] font-semibold text-ink">{new Date(e.created_at).toLocaleDateString("en-MU",{day:"2-digit",month:"short",year:"numeric"})}</div>
                      <div className="text-[11px] text-muted font-mono">{new Date(e.created_at).toLocaleTimeString("en-MU",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
                    </td>
                    <td className="px-5 py-4"><code className="text-[12px] text-ink bg-ink/[0.04] px-2 py-0.5 rounded-lg font-mono">{e.event_label}</code></td>
                    <td className="px-5 py-4 text-[13px] text-ficium font-medium">{e.resource_type ?? "—"}</td>
                    <td className="px-5 py-4 text-[13px] text-muted">{e.actor_role ?? "system"}</td>
                    <td className="px-5 py-4">{outcomeBadge(e.outcome)}</td>
                    <td className="px-5 py-4 text-[12px] text-muted max-w-[200px] truncate">{e.outcome_note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {events.length >= limit && (
            <div className="flex justify-center mt-5">
              <button onClick={() => setLimit(l => l+50)} className="border border-ink/10 bg-white text-muted text-[13px] font-semibold px-6 py-2.5 rounded-xl hover:bg-ink/[0.03] transition-colors shadow-sm">
                Load more (showing {limit})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
