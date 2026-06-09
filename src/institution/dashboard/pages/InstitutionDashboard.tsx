/**
 * @page InstitutionDashboard
 * @route /dashboard
 * @access protected — all roles
 * @description
 *   Primary landing page for institution analysts and admins.
 *   Provides at-a-glance KPIs, pipeline stage counts, top-value
 *   opportunities, a live marketplace activity feed, and performance
 *   metrics. All data is derived from hooks — no logic lives here.
 *
 *   Layout:
 *     1. Session/alerts bar
 *     2. KPI row (5 cards)
 *     3. Main grid: pipeline + opportunities table (2/3) | activity feed (1/3)
 *     4. Performance row
 *
 * @dataSource
 *   useMyInstitution   → institutions table (5 min cache)
 *   useMyBids          → my_bids view (30 s cache)
 *   usePendingActions  → pending_actions table (60 s cache)
 *   useMarketplace     → marketplace_requests / requests (15 s cache)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { Link } from "react-router-dom";
import {
  TrendingUp, Clock, CheckCircle, ArrowRight,
  AlertTriangle, Zap, Store, BarChart2,
} from "lucide-react";
import {
  useMyInstitution,
  useMyBids,
  usePendingActions,
  useMarketplace,
} from "../../hooks/useInstitution";
import {
  KpiCard, SectionHeader, LiveBadge, SkeletonCard, SkeletonRow,
  DataTable, DataRow, Td, StatusBadge, InlineAlert, MonoRef,
} from "../../components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format MUR value to human-readable string. */
function fmtMUR(v: number): string {
  if (v >= 1_000_000) return `MUR ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `MUR ${(v / 1_000).toFixed(0)}K`;
  return `MUR ${v.toLocaleString()}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-MU", {
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — each owns a discrete section of the dashboard
// ─────────────────────────────────────────────────────────────────────────────

/** Five KPI metric cards. */
function KpiRow() {
  const { data: institution, isLoading: li } = useMyInstitution();
  const { data: bids        = [], isLoading: lb } = useMyBids();
  const { data: pending     = [], isLoading: lp } = usePendingActions();
  const { data: marketplace = [], isLoading: lm } = useMarketplace();

  const loading = li || lb || lp || lm;

  const openRequests   = marketplace.length;
  const marketplaceVal = marketplace.reduce((s, r) => s + Number(r.amount), 0);
  const activeBids     = bids.filter((b) => b.status === "submitted").length;
  const acceptedBids   = bids.filter((b) => b.status === "accepted").length;
  const pendingCount   = pending.length;
  const winRate        = bids.length > 0
    ? Math.round((acceptedBids / bids.length) * 100)
    : 0;

  const expiringCount = pending.filter((p) =>
    new Date(p.expires_at).getTime() - Date.now() < 4 * 60 * 60 * 1000
  ).length;

  const modules = institution?.modules ?? [];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <KpiCard
        label="Marketplace value"
        value={fmtMUR(marketplaceVal)}
        sub={`${openRequests} open`}
        icon={Store}
        href={modules.includes("marketplace") ? "/marketplace" : undefined}
      />
      <KpiCard
        label="Open opportunities"
        value={openRequests}
        sub="Live requests"
        icon={TrendingUp}
        href={modules.includes("marketplace") ? "/marketplace" : undefined}
      />
      <KpiCard
        label="Pending approvals"
        value={pendingCount}
        sub="Maker-checker queue"
        icon={Clock}
        href="/approvals"
        alert={pendingCount > 0}
      />
      <KpiCard
        label="Accepted bids"
        value={acceptedBids}
        sub={`${activeBids} active`}
        icon={CheckCircle}
        href="/bids"
      />
      <KpiCard
        label="Win rate"
        value={`${winRate}%`}
        sub={`${bids.length} total bids`}
        icon={Zap}
      />
      {expiringCount > 0 && (
        <div className="col-span-2 lg:col-span-5">
          <InlineAlert variant="warning">
            <span className="font-semibold">{expiringCount} approval{expiringCount > 1 ? "s" : ""}</span>{" "}
            expiring within 4 hours —{" "}
            <Link to="/approvals" className="underline underline-offset-2">
              Review now
            </Link>
          </InlineAlert>
        </div>
      )}
    </div>
  );
}

/** Request pipeline stage funnel. */
function PipelinePanel() {
  const { data: bids        = [], isLoading: lb } = useMyBids();
  const { data: marketplace = [], isLoading: lm } = useMarketplace();

  const stages = [
    { label: "New",          value: marketplace.filter((r) => r.status === "open").length,      color: "text-ficium",      bg: "bg-ficium/8" },
    { label: "Bidding",      value: marketplace.filter((r) => r.status === "bidding").length,   color: "text-ink",         bg: "bg-ink/[0.04]" },
    { label: "Active bids",  value: bids.filter((b) => b.status === "submitted").length,        color: "text-ink",         bg: "bg-ink/[0.04]" },
    { label: "Accepted",     value: bids.filter((b) => b.status === "accepted").length,         color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Expired",      value: bids.filter((b) => b.status === "expired").length,          color: "text-red-400",     bg: "bg-red-50/60" },
  ];

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] p-5 mb-5">
      <h2 className="font-display font-bold text-[15px] text-ink mb-4 flex items-center gap-2">
        Request pipeline
        {(lb || lm) && (
          <span className="w-3.5 h-3.5 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
        )}
      </h2>
      <div className="grid grid-cols-5 gap-3">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={`rounded-lg p-3.5 text-center ${stage.bg}`}
          >
            <div className={`text-[28px] font-bold leading-none mb-1 ${stage.color}`}>
              {stage.value}
            </div>
            <div className="text-[11px] text-muted font-medium tracking-wide">
              {stage.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Top 5 opportunities by requested amount. */
function TopOpportunitiesPanel() {
  const { data: institution }                       = useMyInstitution();
  const { data: marketplace = [], isLoading }       = useMarketplace();

  const modules = institution?.modules ?? [];

  const topOpps = [...marketplace]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 6);

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[15px] text-ink">
          High-value opportunities
        </h2>
        {modules.includes("marketplace") && (
          <Link
            to="/marketplace"
            className="text-[12px] text-ficium font-semibold flex items-center gap-1 hover:underline"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {isLoading ? (
        <table className="w-full">
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
          </tbody>
        </table>
      ) : topOpps.length === 0 ? (
        <p className="text-[13px] text-muted text-center py-10">
          No open opportunities right now
        </p>
      ) : (
        <DataTable
          headers={["Client ref", "Product", "Value", "Term", ""]}
          caption="Top opportunities by requested amount"
        >
          {topOpps.map((opp) => (
            <DataRow key={opp.id}>
              <Td>
                <MonoRef value={opp.client_ref ?? opp.id} />
              </Td>
              <Td className="font-semibold">
                {opp.product_label ?? opp.product_type}
              </Td>
              <Td className="font-bold">{fmtMUR(Number(opp.amount))}</Td>
              <Td className="text-muted">
                {opp.term_months ? `${opp.term_months}m` : "—"}
              </Td>
              <td className="px-5 py-3.5">
                {modules.includes("marketplace") && (
                  <Link
                    to="/marketplace"
                    className="text-[11px] bg-ficium text-white font-bold px-3 py-1.5 rounded-lg hover:bg-ficium-deep transition-colors"
                    aria-label={`Bid on ${opp.product_label ?? opp.product_type} request`}
                  >
                    Bid
                  </Link>
                )}
              </td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  );
}

/** Live marketplace activity feed (right column). */
function ActivityFeedPanel() {
  const { data: marketplace = [], isLoading } = useMarketplace();

  const recent = [...marketplace]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[15px] text-ink">
          Marketplace activity
        </h2>
        <LiveBadge />
      </div>
      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3.5 w-36 bg-ink/[0.06] rounded mb-1.5" />
              <div className="h-3 w-24 bg-ink/[0.04] rounded" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="text-[13px] text-muted text-center py-10">
          No activity yet
        </p>
      ) : (
        <ul className="divide-y divide-ink/[0.05]">
          {recent.map((req) => (
            <li key={req.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-[13px] text-ink leading-tight">
                    {req.product_label ?? req.product_type}
                  </div>
                  <div className="text-[12px] font-bold text-ficium mt-0.5">
                    {fmtMUR(Number(req.amount))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <StatusBadge status={req.status} size="xs" />
                  <div className="text-[10px] text-muted mt-1">
                    {fmtTime(req.created_at)}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Market intelligence ticker (if data available). */
function MarketIntelPanel() {
  // Placeholder — wired to useIntelligence when live data flows
  return null;
}

/** Institution performance summary row. */
function PerformancePanel() {
  const { data: bids = [], isLoading } = useMyBids();

  const accepted = bids.filter((b) => b.status === "accepted").length;
  const active   = bids.filter((b) => b.status === "submitted").length;
  const winRate  = bids.length > 0
    ? Math.round((accepted / bids.length) * 100)
    : 0;

  const avgResponseMs =
    bids.filter((b) => b.response_time_ms).reduce(
      (s, b) => s + (b.response_time_ms ?? 0), 0
    ) / (bids.filter((b) => b.response_time_ms).length || 1);
  const avgResponseMin = Math.round(avgResponseMs / 60_000);

  const metrics = [
    { label: "Offers submitted",  value: bids.length },
    { label: "Success rate",      value: `${winRate}%` },
    { label: "Active bids",       value: active },
    { label: "Avg response time", value: avgResponseMs > 0 ? `${avgResponseMin}m` : "—" },
  ];

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] p-5 mt-5">
      <h2 className="font-display font-bold text-[15px] text-ink mb-4 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-ficium" aria-hidden />
        Institution performance
      </h2>
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-ink/[0.025] rounded-xl p-4">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                {m.label}
              </div>
              <div className="text-[26px] font-bold text-ink tracking-tight leading-none">
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionDashboard() {
  const { data: institution } = useMyInstitution();

  return (
    <main className="p-6 lg:p-8 max-w-[1440px] mx-auto">
      <SectionHeader
        title="Dashboard"
        subtitle={institution?.name ?? "Institution Portal"}
        badge={<LiveBadge />}
        actions={
          institution?.onboarding_stage !== "approved" ? (
            <Link to="/approvals">
              <span className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-semibold px-3 py-1.5 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" />
                {institution?.onboarding_stage?.replace(/_/g, " ")}
              </span>
            </Link>
          ) : undefined
        }
      />

      <KpiRow />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3 */}
        <div className="lg:col-span-2">
          <PipelinePanel />
          <TopOpportunitiesPanel />
          <PerformancePanel />
        </div>

        {/* Right 1/3 */}
        <div className="lg:col-span-1">
          <ActivityFeedPanel />
          <MarketIntelPanel />
        </div>
      </div>
    </main>
  );
}
