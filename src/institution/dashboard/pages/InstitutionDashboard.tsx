/**
 * @page InstitutionDashboard
 * @route /dashboard
 * @description
 *   Bank portal dashboard. Layout mirrors the reference:
 *   - KPI row (4 cards with trend indicators)
 *   - Main 2/3 + 1/3 grid:
 *     Left:  Requests Overview line chart + Requests by Status donut
 *     Right: Pending Approvals panel
 *   - Recent Requests table
 *   - Recent Bids table
 *
 * @owner Ficium Engineering
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, ArrowRight,
  FileText, Gavel, Shield, BarChart2,
  CheckCircle, Clock, Store,
  Package, Webhook, ScrollText, Settings,
} from "lucide-react";
import {
  useMyInstitution, useMyBids, usePendingActions, useMarketplace,
} from "../../hooks/useInstitution";
import { useMyGroup } from "../../../admin/hooks/useAdmin";
import { allowedModules, INSTITUTION_MODULE_LIST } from "../../../shared/lib/modules";

// ─── Helpers ─────────────────────────────────────────────────

function fmtMUR(v: number): string {
  if (v >= 1_000_000) return `MUR ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `MUR ${(v / 1_000).toFixed(0)}K`;
  return `MUR ${v.toLocaleString()}`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MU", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Status badge ─────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  open:       "bg-ficium/10 text-ficium",
  bidding:    "bg-blue-100 text-blue-700",
  submitted:  "bg-ficium/10 text-ficium",
  accepted:   "bg-emerald-100 text-emerald-700",
  rejected:   "bg-red-100 text-red-600",
  expired:    "bg-amber-100 text-amber-700",
  cancelled:  "bg-ink/[0.06] text-muted",
  pending:    "bg-amber-100 text-amber-700",
  "in-progress": "bg-blue-100 text-blue-700",
  closed:     "bg-ink/[0.06] text-muted",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[status] ?? "bg-ink/[0.06] text-muted"}`}>
      {label}
    </span>
  );
}

// ─── KPI card ─────────────────────────────────────────────────

function KpiCard({
  label, value, sub, trend, trendUp, icon: Icon, href, alert,
}: {
  label:    string;
  value:    string | number;
  sub?:     string;
  trend?:   string;
  trendUp?: boolean;
  icon:     React.ElementType;
  href?:    string;
  alert?:   boolean;
}) {
  const inner = (
    <div className={[
      "bg-white rounded-2xl border p-5 flex items-start justify-between gap-3 transition-all",
      alert ? "border-amber-200 bg-amber-50/40" : "border-ink/[0.07] hover:border-ficium/20 hover:shadow-card",
    ].join(" ")}>
      <div>
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{label}</p>
        <p className="text-[28px] font-bold text-ink leading-none mb-1.5">{value}</p>
        {sub && <p className="text-[12px] text-muted">{sub}</p>}
        {trend && (
          <div className={`flex items-center gap-1 text-[12px] font-semibold mt-1 ${trendUp ? "text-emerald-600" : "text-red-500"}`}>
            {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {trend}
          </div>
        )}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${alert ? "bg-amber-100" : "bg-ficium/[0.08]"}`}>
        <Icon className={`w-5 h-5 ${alert ? "text-amber-600" : "text-ficium"}`} aria-hidden />
      </div>
    </div>
  );
  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}

// ─── Simple bar chart (SVG, no dep) ──────────────────────────

function RequestsOverviewChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 600; const H = 180; const PAD = 30;
  const step = (W - PAD * 2) / Math.max(data.length - 1, 1);
  const pts = data.map((d, i) => ({
    x: PAD + i * step,
    y: H - PAD - ((d.value / max) * (H - PAD * 2)),
  }));
  const pathD   = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD   = `${pathD} L${pts[pts.length-1].x},${H-PAD} L${pts[0].x},${H-PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Requests overview chart">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A1FE6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#2A1FE6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={PAD} x2={W-PAD}
          y1={PAD + t * (H - PAD * 2)} y2={PAD + t * (H - PAD * 2)}
          stroke="#0A0A1A" strokeOpacity="0.05" strokeWidth="1" />
      ))}
      {/* Area fill */}
      <path d={areaD} fill="url(#chartGrad)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#2A1FE6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Points */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="white" stroke="#2A1FE6" strokeWidth="2" />
      ))}
      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={PAD + i * step} y={H - 6} textAnchor="middle"
          fontSize="10" fill="#6B6B85" fontFamily="Inter Tight, sans-serif">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// ─── Donut chart ──────────────────────────────────────────────

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const R = 60; const CX = 90; const CY = 90; const strokeW = 22;
  let cumulative = 0;
  const arcs = segments.map(seg => {
    const pct   = seg.value / total;
    const start = cumulative * 2 * Math.PI - Math.PI / 2;
    const end   = (cumulative + pct) * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const x1 = CX + R * Math.cos(start); const y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end);   const y2 = CY + R * Math.sin(end);
    const large = pct > 0.5 ? 1 : 0;
    return { ...seg, d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}` };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 180 180" className="w-32 h-32 flex-shrink-0" aria-label="Requests by status">
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill="none" stroke={arc.color}
            strokeWidth={strokeW} strokeLinecap="butt" opacity={arc.value === 0 ? 0 : 1} />
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="22" fontWeight="bold"
          fill="#0A0A1A" fontFamily="Inter Tight, sans-serif">{total}</text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="11"
          fill="#6B6B85" fontFamily="Inter Tight, sans-serif">Total</text>
      </svg>
      <div className="space-y-2 min-w-0">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-[12px] text-ink flex-1 truncate">{seg.label}</span>
            <span className="text-[12px] font-bold text-ink flex-shrink-0">{seg.value}</span>
            <span className="text-[11px] text-muted flex-shrink-0">
              ({total > 0 ? ((seg.value / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────

function SectionCard({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink/[0.07] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[14px] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-ink/[0.06] rounded-lg ${className}`} />;
}

// ─── Module launcher ──────────────────────────────────────────

const MODULE_META: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  description: string;
}> = {
  "inst:marketplace":  { icon: Store,      color: "text-ficium",      bg: "bg-ficium/[0.08]",      description: "Browse client financing requests" },
  "inst:bids":         { icon: Gavel,      color: "text-emerald-600", bg: "bg-emerald-50",          description: "View and manage submitted bids" },
  "inst:bid_approval": { icon: Clock,      color: "text-amber-600",   bg: "bg-amber-50",            description: "Approve or reject bids as checker" },
  "inst:products":     { icon: Package,    color: "text-blue-600",    bg: "bg-blue-50",             description: "Product catalogue and rate config" },
  "inst:webhooks":     { icon: Webhook,    color: "text-purple-600",  bg: "bg-purple-50",           description: "Outbound webhook endpoints" },
  "inst:audit":        { icon: ScrollText, color: "text-muted",       bg: "bg-ink/[0.06]",          description: "Read-only institution activity log" },
  "inst:settings":     { icon: Settings,   color: "text-muted",       bg: "bg-ink/[0.06]",          description: "Institution profile and config" },
};

const SECTION_ORDER: { label: string; keys: string[] }[] = [
  { label: "Marketplace", keys: ["inst:marketplace", "inst:bids", "inst:bid_approval"] },
  { label: "Manage",      keys: ["inst:products", "inst:webhooks", "inst:settings"] },
  { label: "Operations",  keys: ["inst:audit"] },
];

function ModuleLauncher({ pendingCount }: { pendingCount: number }) {
  const { data: myGroup } = useMyGroup();
  const permissions = myGroup?.module_permissions ?? [];
  const allowed = allowedModules(INSTITUTION_MODULE_LIST, permissions);
  const allowedKeys = new Set(allowed.map(m => m.key));
  const byKey = Object.fromEntries(allowed.map(m => [m.key, m]));

  const visibleSections = SECTION_ORDER
    .map(s => ({ ...s, modules: s.keys.filter(k => allowedKeys.has(k)).map(k => byKey[k]) }))
    .filter(s => s.modules.length > 0);

  if (visibleSections.length === 0) return null;

  return (
    <div className="mb-6 bg-white rounded-2xl border border-ink/[0.07] overflow-hidden">
      <div className="grid divide-x divide-ink/[0.07]" style={{ gridTemplateColumns: `repeat(${visibleSections.length}, 1fr)` }}>
        {visibleSections.map((section, si) => (
          <div key={section.label} className={si > 0 ? "" : ""}>
            <div className="px-5 pt-4 pb-2 border-b border-ink/[0.06]">
              <p className="text-[10px] font-bold text-muted uppercase tracking-[0.1em]">{section.label}</p>
            </div>
            <div className="p-3 grid gap-1">
              {section.modules.map(mod => {
                const meta = MODULE_META[mod.key];
                if (!meta) return null;
                const Icon = meta.icon;
                const badge = (mod.key === "inst:bid_approval") ? pendingCount : 0;
                return (
                  <Link
                    key={mod.key}
                    to={mod.path}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink/[0.03] transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink group-hover:text-ficium transition-colors">{mod.label}</div>
                      <div className="text-[11px] text-muted truncate">{meta.description}</div>
                    </div>
                    {badge > 0 && (
                      <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── KPI row ─────────────────────────────────────────────────

function KpiRow() {
  const { data: bids        = [], isLoading: lb } = useMyBids();
  const { data: pending     = [], isLoading: lp } = usePendingActions();
  const { data: marketplace = [], isLoading: lm } = useMarketplace();
  const { data: myGroup }                         = useMyGroup();

  const modules = myGroup?.module_permissions ?? [];
  const loading = lb || lp || lm;

  const openRequests = marketplace.length;
  const totalBids    = bids.length;
  const accepted     = bids.filter(b => b.status === "accepted").length;
  const pendingCount = pending.length;
  const winRate      = totalBids > 0 ? Math.round((accepted / totalBids) * 100) : 0;

  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  const canMarket = modules.includes("*") || modules.includes("inst:marketplace");

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KpiCard label="Total Requests"     value={openRequests} sub={`${openRequests} open`}
        trend="8.3% from last month" trendUp icon={Store}
        href={canMarket ? "/marketplace" : undefined} />
      <KpiCard label="Total Bids"         value={totalBids}    sub={`${accepted} accepted`}
        trend="15.2% from last month" trendUp icon={Gavel}
        href="/bids" />
      <KpiCard label="Pending Approvals"  value={pendingCount} sub="Maker-checker queue"
        trend={pendingCount > 0 ? "Requires action" : "Queue clear"} trendUp={pendingCount === 0}
        icon={Shield} href="/approvals" alert={pendingCount > 0} />
      <KpiCard label="Win Rate"           value={`${winRate}%`} sub={`${totalBids} total bids`}
        icon={BarChart2} />
    </div>
  );
}

// ─── Charts row ───────────────────────────────────────────────

function ChartsRow() {
  const { data: marketplace = [], isLoading: lm } = useMarketplace();
  const { data: bids        = [], isLoading: lb } = useMyBids();

  // Build 6-day chart data from marketplace created_at
  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-MU", { month: "short", day: "numeric" });
      days[label] = 0;
    }
    marketplace.forEach(r => {
      const label = new Date(r.created_at).toLocaleDateString("en-MU", { month: "short", day: "numeric" });
      if (label in days) days[label]++;
    });
    return Object.entries(days).map(([label, value]) => ({ label, value }));
  }, [marketplace]);

  const donutSegments = [
    { label: "Open",            value: marketplace.filter(r => r.status === "open").length,     color: "#2A1FE6" },
    { label: "In Progress",     value: marketplace.filter(r => r.status === "bidding").length,  color: "#7DF9C5" },
    { label: "Pending Approval",value: bids.filter(b => b.status === "submitted").length,       color: "#FFD84D" },
    { label: "Closed",          value: bids.filter(b => b.status === "accepted" || b.status === "rejected").length, color: "#0A0A1A" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <SectionCard title="Requests Overview"
        action={<span className="text-[11px] text-muted bg-ink/[0.04] border border-ink/[0.08] px-2.5 py-1 rounded-full">This Month</span>}>
        <div className="p-4">
          {lm ? <Skeleton className="h-40" /> : <RequestsOverviewChart data={chartData} />}
        </div>
      </SectionCard>
      <SectionCard title="Requests by Status"
        action={<span className="text-[11px] text-muted bg-ink/[0.04] border border-ink/[0.08] px-2.5 py-1 rounded-full">This Month</span>}>
        <div className="p-5">
          {lm || lb ? <Skeleton className="h-32" /> : <DonutChart segments={donutSegments} />}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Bottom row ───────────────────────────────────────────────

function BottomRow() {
  const { data: marketplace = [], isLoading: lm } = useMarketplace();
  const { data: bids        = [], isLoading: lb } = useMyBids();
  const { data: pending     = [], isLoading: lp } = usePendingActions();
  const { data: myGroup }                         = useMyGroup();
  const modules = myGroup?.module_permissions ?? [];
  const canMarket = modules.includes("*") || modules.includes("inst:marketplace");

  const recentRequests = [...marketplace]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentBids = [...bids]
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .slice(0, 5);

  const pendingList = [...pending]
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Recent Requests */}
      <SectionCard title="Recent Requests"
        action={canMarket ? (
          <Link to="/marketplace" className="flex items-center gap-1 text-[12px] text-ficium font-semibold hover:underline">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : undefined}>
        {lm ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : recentRequests.length === 0 ? (
          <p className="text-[13px] text-muted text-center py-8">No requests yet</p>
        ) : (
          <div className="divide-y divide-ink/[0.05]">
            {recentRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between px-5 py-3 gap-3 hover:bg-ink/[0.02] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-ficium/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-ficium" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{req.product_label ?? req.product_type}</div>
                    <div className="text-[11px] text-muted font-mono">{(req.client_ref ?? req.id).slice(0, 14)} · {fmtDate(req.created_at)}</div>
                  </div>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Recent Bids */}
      <SectionCard title="Recent Bids"
        action={
          <Link to="/bids" className="flex items-center gap-1 text-[12px] text-ficium font-semibold hover:underline">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }>
        {lb ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : recentBids.length === 0 ? (
          <p className="text-[13px] text-muted text-center py-8">No bids yet</p>
        ) : (
          <div className="divide-y divide-ink/[0.05]">
            {recentBids.map(bid => (
              <div key={bid.id} className="flex items-center justify-between px-5 py-3 gap-3 hover:bg-ink/[0.02] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Gavel className="w-4 h-4 text-emerald-600" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{bid.product_label ?? bid.product_type ?? "Bid"}</div>
                    <div className="text-[11px] text-muted">{fmtMUR(Number(bid.amount_offered))} · {timeAgo(bid.submitted_at)}</div>
                  </div>
                </div>
                <StatusBadge status={bid.status} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Pending Approvals */}
      <SectionCard title="Pending Approvals"
        action={
          <Link to="/approvals" className="flex items-center gap-1 text-[12px] text-ficium font-semibold hover:underline">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }>
        {lp ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : pendingList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle className="w-8 h-8 text-emerald-400" aria-hidden />
            <p className="text-[13px] text-muted">Queue clear</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-ink/[0.05]">
              {pendingList.map(a => {
                const expires = new Date(a.expires_at);
                const urgent  = expires.getTime() - Date.now() < 4 * 3_600_000;
                return (
                  <div key={a.id} className="px-5 py-3 hover:bg-ink/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-[13px] font-semibold text-ink truncate flex-1">{a.resource_type}</div>
                      {urgent && (
                        <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full flex-shrink-0">URGENT</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted font-mono">{a.id.slice(0, 8)}</span>
                      <span className={`text-[11px] font-semibold ${urgent ? "text-red-500" : "text-muted"}`}>
                        {timeAgo(a.expires_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-ink/[0.07]">
              <Link to="/approvals"
                className="block w-full bg-ficium hover:bg-ficium-deep text-white text-[13px] font-bold text-center py-2.5 rounded-xl transition-colors">
                Go to Approvals
              </Link>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function InstitutionDashboard() {
  const { data: institution } = useMyInstitution();
  const { data: pending = [] } = usePendingActions();
  const now = new Date().toLocaleDateString("en-MU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="p-5 lg:p-6 xl:p-8 max-w-[1440px] mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-[22px] text-ink">
          Welcome back, <span className="text-ficium">{institution?.primary_contact_name ?? institution?.name ?? "Admin"}</span>
        </h1>
        <p className="text-[13px] text-muted mt-0.5">Here's what's happening with your bank today · {now}</p>
      </div>

      <ModuleLauncher pendingCount={pending.length} />
      <KpiRow />
      <ChartsRow />
      <BottomRow />
    </div>
  );
}
