
// =============================================================
// Ficium 3 — Institution Dashboard
// Layout inspired by provided mockup.
// Ficium design tokens: cream bg, ink text, ficium blue.
// Real data from institution.* schema via hooks.
// =============================================================
import { Link } from "react-router-dom";
import {
  TrendingUp, Clock, CheckCircle, ArrowRight,
  AlertTriangle, Zap, Store,
} from "lucide-react";
import {
  useMyInstitution,
  useMyBids,
  usePendingActions,
  useMarketplace,
} from "../../hooks/useInstitution";

export default function InstitutionDashboard() {
  const { data: institution }      = useMyInstitution();
  const { data: bids        = [] } = useMyBids();
  const { data: pending     = [] } = usePendingActions();
  const { data: marketplace = [] } = useMarketplace();

  const modules = institution?.modules ?? [];

  // ── KPI calculations ──────────────────────────────────────
  const openRequests   = marketplace.length;
  const marketplaceVal = marketplace.reduce((s, r) => s + Number(r.amount), 0);
  const activeBids     = bids.filter(b => b.status === "submitted").length;
  const acceptedBids   = bids.filter(b => b.status === "accepted").length;
  const pendingCount   = pending.length;
  const winRate        = bids.length > 0
    ? Math.round((acceptedBids / bids.length) * 100)
    : 0;

  // ── Pipeline stages (derived from bids) ───────────────────
  const pipeline = [
    { label: "New",         value: marketplace.filter(r => r.status === "open").length },
    { label: "Bidding",     value: marketplace.filter(r => r.status === "bidding").length },
    { label: "Active bids", value: activeBids },
    { label: "Accepted",    value: acceptedBids },
    { label: "Expired",     value: bids.filter(b => b.status === "expired").length },
  ];

  // ── Top opportunities (highest amount, open only) ─────────
  const topOpps = [...marketplace]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5);

  // ── Recent marketplace activity ───────────────────────────
  const recentActivity = [...marketplace]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // ── Performance metrics ───────────────────────────────────
  const avgResponseMs = bids.filter(b => b.response_time_ms).reduce((s, b) => s + (b.response_time_ms ?? 0), 0)
    / (bids.filter(b => b.response_time_ms).length || 1);
  const avgResponseMin = Math.round(avgResponseMs / 60000);

  const fmt = {
    currency: (v: number) => v >= 1_000_000
      ? `MUR ${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
      ? `MUR ${(v / 1_000).toFixed(0)}K`
      : `MUR ${v.toLocaleString()}`,
    time: (s: string) => new Date(s).toLocaleTimeString("en-MU", { hour: "2-digit", minute: "2-digit" }),
  };

  const expiringCount = pending.filter(p =>
    new Date(p.expires_at).getTime() - Date.now() < 4 * 60 * 60 * 1000
  ).length;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">
            Institution Dashboard
          </h1>
          <p className="text-muted mt-1.5">
            Monitor marketplace activity, bids and approvals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {expiringCount > 0 && (
            <Link to="/approvals"
              className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-semibold px-3 py-2 rounded-full hover:bg-amber-100 transition-colors">
              <AlertTriangle className="w-3.5 h-3.5" />
              {expiringCount} expiring soon
            </Link>
          )}
          <span className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 font-bold text-[13px] px-4 py-2 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            LIVE
          </span>
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Marketplace value",  value: fmt.currency(marketplaceVal), trend: `${openRequests} open`,      icon: Store,        href: "/marketplace" },
          { label: "Open opportunities", value: openRequests,                 trend: "Live requests",              icon: TrendingUp,   href: "/marketplace" },
          { label: "Pending approvals",  value: pendingCount,                 trend: "Maker-checker queue",        icon: Clock,        href: "/approvals",   alert: pendingCount > 0 },
          { label: "Accepted bids",      value: acceptedBids,                 trend: `${activeBids} active`,       icon: CheckCircle,  href: "/bids"         },
          { label: "Win rate",           value: `${winRate}%`,                trend: `${bids.length} total bids`,  icon: Zap                                             },
        ].map(kpi => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* ── Main grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Left col — pipeline + table */}
        <div className="lg:col-span-2 space-y-6">

          {/* Pipeline */}
          <div className="bg-white rounded-2xl p-6 shadow-card">
            <h2 className="font-display font-bold text-[17px] text-ink mb-5">
              Request pipeline
            </h2>
            <div className="grid grid-cols-5 gap-3">
              {pipeline.map((stage, i) => (
                <div key={stage.label}
                  className={`rounded-xl p-4 text-center ${
                    i === 0 ? "bg-ficium/8" :
                    i === 1 ? "bg-ficium/5" :
                    "bg-[#F8FAFC]"
                  }`}>
                  <div className={`text-3xl font-bold mb-1.5 ${
                    i === 0 ? "text-ficium" :
                    i === 3 ? "text-green-600" :
                    i === 4 ? "text-red-400" :
                    "text-ink"
                  }`}>
                    {stage.value}
                  </div>
                  <div className="text-[12px] text-muted font-medium">{stage.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* High priority opportunities */}
          <div className="bg-white rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-[17px] text-ink">
                High priority opportunities
              </h2>
              {modules.includes("marketplace") && (
                <Link to="/marketplace"
                  className="text-[12px] text-ficium font-semibold flex items-center gap-1 hover:underline">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
            {topOpps.length === 0 ? (
              <p className="text-muted text-sm py-4 text-center">No open opportunities right now</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink/[0.06]">
                    {["Client ref","Product","Value","Term",""].map(h => (
                      <th key={h} className="text-left pb-3 text-[12px] text-muted font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topOpps.map(opp => (
                    <tr key={opp.id} className="border-b border-ink/[0.04] hover:bg-cream/60 transition-colors">
                      <td className="py-4 text-[13px] font-mono text-ink/50">{opp.client_ref?.slice(0,8)}…</td>
                      <td className="py-4 text-[13px] font-semibold text-ink">{opp.product_label ?? opp.product_type}</td>
                      <td className="py-4 text-[13px] font-bold text-ink">{fmt.currency(Number(opp.amount))}</td>
                      <td className="py-4 text-[13px] text-muted">{opp.term_months ? `${opp.term_months}m` : "—"}</td>
                      <td className="py-4">
                        {modules.includes("marketplace") && (
                          <Link to="/marketplace"
                            className="text-[11px] bg-ficium text-white font-bold px-3 py-1.5 rounded-lg hover:bg-ficium-deep transition-colors">
                            Bid
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right col — activity feed */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-card h-full">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-[17px] text-ink">
                Marketplace activity
              </h2>
              <span className="flex items-center gap-1.5 text-[11px] text-green-600 font-semibold">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-muted text-sm py-4 text-center">No activity yet</p>
            ) : (
              <div className="divide-y divide-ink/[0.05]">
                {recentActivity.map(req => (
                  <div key={req.id} className="py-4">
                    <div className="font-semibold text-[13px] text-ink mb-1">
                      {req.product_label ?? req.product_type} — {fmt.currency(Number(req.amount))}
                    </div>
                    <div className="text-[12px] text-muted flex items-center gap-2">
                      <span>{fmt.time(req.created_at)} Today</span>
                      {req.client_type && (
                        <span className="capitalize bg-ink/[0.05] px-2 py-0.5 rounded-full">
                          {req.client_type}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Performance row ───────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-card">
        <h2 className="font-display font-bold text-[17px] text-ink mb-5">
          Institution performance
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Offers submitted",  value: bids.length },
            { label: "Success rate",      value: `${winRate}%` },
            { label: "Active bids",       value: activeBids },
            { label: "Avg response time", value: avgResponseMs > 0 ? `${avgResponseMin}m` : "—" },
          ].map(m => (
            <div key={m.label} className="bg-[#F8FAFC] rounded-xl p-5">
              <div className="text-3xl font-bold text-ink mb-2">{m.value}</div>
              <div className="text-[13px] text-muted">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({
  label, value, trend, icon: Icon, href, alert,
}: {
  label:  string;
  value:  string | number;
  trend?: string;
  icon:   React.ElementType;
  href?:  string;
  alert?: boolean;
}) {
  const inner = (
    <div className={`bg-white rounded-2xl p-5 shadow-card h-full transition-all ${
      href ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : ""
    } ${alert ? "ring-2 ring-amber-300/60" : ""}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-xl bg-ficium/8 flex items-center justify-center">
          <Icon className="w-4 h-4 text-ficium" />
        </div>
        {alert && (
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse mt-1" />
        )}
      </div>
      <div className="text-[13px] text-muted mb-2">{label}</div>
      <div className="text-3xl font-bold text-ink tracking-tight mb-1.5">{value}</div>
      {trend && <div className="text-[12px] text-muted">{trend}</div>}
    </div>
  );
  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}
