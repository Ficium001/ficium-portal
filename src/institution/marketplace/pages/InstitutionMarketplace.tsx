/**
 * @page InstitutionMarketplace
 * @route /marketplace
 * @access protected — admin, analyst
 * @requires module: marketplace
 * @description
 *   Live marketplace feed. Shows all open client requests visible to
 *   this institution. Analysts can open a request detail drawer and
 *   submit a bid (which enters maker-checker). All bids require a
 *   second admin to approve in /approvals before final submission.
 *
 *   Layout:
 *     1. Header with live indicator + refresh
 *     2. Market intelligence strip (rates by product)
 *     3. Maker-checker notice
 *     4. Product filter pills
 *     5. Request grid (card per request)
 *     6. Detail drawer + bid modal (overlays)
 *
 * @dataSource
 *   useMarketplace    → marketplace_requests / requests (30 s auto-refetch)
 *   useProducts       → products table (1 hr cache)
 *   useSubmitBid      → submit_for_approval() RPC (mutation)
 *   useIntelligence   → intelligence view (5 min cache)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useCallback } from "react";
import { RefreshCw, SlidersHorizontal, BarChart2 } from "lucide-react";
import {
  useMarketplace, useProducts, useSubmitBid, useMyInstitution,
} from "@/institution/hooks/useInstitution";
import { useIntelligence } from "@/shared/lib/intelligence";
import { RequestDetailDrawer }  from "@/institution/marketplace/components/RequestDetailDrawer";
import { BidModal }             from "@/institution/marketplace/components/BidModal";
import type { BidForm }         from "@/institution/marketplace/components/BidModal";
import type { MarketplaceRequest } from "@/institution/types/institution";
import {
  SectionHeader, LiveBadge, InlineAlert, FilterPills,
  Btn, SkeletonCard, EmptyState, StatusBadge,
} from "@/institution/components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMUR(v: number): string {
  if (v >= 1_000_000) return `MUR ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `MUR ${Math.round(v / 1_000)}K`;
  return `MUR ${v.toLocaleString()}`;
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestCard — single marketplace opportunity tile
// ─────────────────────────────────────────────────────────────────────────────

function RequestCard({
  request,
  canBid,
  onOpen,
  onBid,
}: {
  request: MarketplaceRequest;
  canBid: boolean;
  onOpen: () => void;
  onBid:  () => void;
}) {
  const windowMs     = new Date(request.bid_window_closes_at).getTime() - Date.now();
  const windowClosed = windowMs <= 0 || request.status === 'closed';
  const closing      = windowClosed ? "Closed" : timeUntil(request.bid_window_closes_at);
  const isUrgent     = !windowClosed && windowMs < 2 * 3_600_000;
  const bidCount     = request.bid_count ?? 0;
  const healthScore  = request.client_health_score;

  return (
    <article
      className={`bg-white rounded-xl border overflow-hidden transition-all ${
        windowClosed
          ? "border-ink/[0.05] opacity-75"
          : "border-ink/[0.07] hover:border-ficium/30 hover:shadow-md"
      }`}
      aria-label={`${request.product_label ?? request.product_type} request — ${fmtMUR(Number(request.amount))}`}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-ink/[0.06]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-bold text-[15px] text-ink leading-tight">
              {request.product_label ?? request.product_type.replace(/_/g, " ")}
            </div>
            <div className="text-[11px] text-muted font-mono mt-0.5">
              ref {(request.consumer_ref ?? request.client_ref)?.slice(0, 8) ?? "—"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {windowClosed ? (
              <span className="text-[10px] font-semibold bg-ink/[0.06] text-muted px-2 py-0.5 rounded-full">
                Window closed
              </span>
            ) : (
              <StatusBadge status={request.status} size="xs" />
            )}
            {bidCount > 0 && (
              <span className="text-[10px] text-muted">
                {bidCount} bid{bidCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Primary metrics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">
              Amount
            </div>
            <div className="text-[20px] font-bold text-ink tracking-tight leading-none">
              {fmtMUR(Number(request.amount))}
            </div>
          </div>
          {request.term_months && (
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                Term
              </div>
              <div className="text-[20px] font-bold text-ink tracking-tight leading-none">
                {request.term_months}
                <span className="text-[13px] font-normal text-muted ml-1">months</span>
              </div>
            </div>
          )}
        </div>

        {/* Anonymous client signals */}
        {(healthScore || request.client_monthly_income || request.client_employment_status) && (
          <div className="bg-ink/[0.025] rounded-lg px-3 py-2.5 mb-4">
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
              Client signals (anonymised)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {healthScore && (
                <div>
                  <div className="text-[10px] text-muted">Health score</div>
                  <div className={`text-[14px] font-bold ${
                    healthScore >= 70 ? "text-emerald-600" :
                    healthScore >= 40 ? "text-amber-600"  : "text-red-500"
                  }`}>
                    {healthScore}
                  </div>
                </div>
              )}
              {request.client_monthly_income && (
                <div>
                  <div className="text-[10px] text-muted">Mo. income</div>
                  <div className="text-[14px] font-bold text-ink">
                    {fmtMUR(request.client_monthly_income)}
                  </div>
                </div>
              )}
              {request.client_employment_status && (
                <div>
                  <div className="text-[10px] text-muted">Employment</div>
                  <div className="text-[12px] font-semibold text-ink capitalize">
                    {request.client_employment_status.replace(/_/g, " ")}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bid window */}
        <div className={`flex items-center justify-between text-[12px] mb-4 ${
          windowClosed ? "text-muted" : isUrgent ? "text-red-500 font-semibold" : "text-muted"
        }`}>
          <span>{windowClosed ? "Bidding closed" : "Bid window closes"}</span>
          <span>{closing}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onOpen}
            className="flex-1 text-[12px] font-semibold border border-ink/[0.12] text-ink rounded-lg py-2 hover:border-ficium/40 hover:text-ficium transition-colors"
            aria-label="View request details"
          >
            View details
          </button>
          {canBid && !windowClosed && (
            <button
              onClick={onBid}
              className="flex-1 text-[12px] font-bold bg-ficium text-white rounded-lg py-2 hover:bg-ficium-deep transition-colors"
              aria-label="Submit bid for this request"
            >
              Submit bid
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Market intelligence strip
// ─────────────────────────────────────────────────────────────────────────────

function IntelStrip() {
  const { intel } = useIntelligence();
  if (!intel?.marketRates?.length) return null;

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-ficium" aria-hidden />
        <span className="text-[11px] font-bold text-ficium uppercase tracking-widest">
          Live market intelligence
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
          <span className="text-[10px] text-muted">Updated every 5 min</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {intel.marketRates.slice(0, 4).map((r) => {
          const win  = intel.acceptanceIntel.find((a) => a.product_type === r.product_type);
          const comp = intel.competitiveness.find((c) => c.product_type === r.product_type);
          return (
            <div key={r.product_type} className="bg-cream rounded-lg p-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5 capitalize">
                {r.product_type.replace(/_/g, " ")}
              </div>
              <div className="text-[22px] font-extrabold text-ficium leading-none mb-0.5">
                {r.avg_rate_pct}%
              </div>
              <div className="text-[10px] text-muted mb-1.5">market avg APR</div>
              <div className="space-y-0.5 border-t border-ink/[0.06] pt-1.5">
                <div className="text-[10px] text-muted">
                  Range{" "}
                  <span className="font-semibold text-ink">
                    {r.min_rate_pct}–{r.max_rate_pct}%
                  </span>
                </div>
                {win && (
                  <div className="text-[10px] text-muted">
                    Win avg{" "}
                    <span className="font-semibold text-emerald-600">
                      {win.avg_winning_rate_pct}%
                    </span>
                  </div>
                )}
                {comp && (
                  <div className="text-[10px] text-muted">
                    Avg bids/req{" "}
                    <span className="font-semibold text-ink">
                      {comp.avg_bids_per_request}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionMarketplace() {
  const { data: institution }                       = useMyInstitution();
  const { data: requests = [], isLoading, refetch } = useMarketplace();
  const { data: products  = [] }                    = useProducts();
  const submitBid                                   = useSubmitBid();

  const [productFilter,  setProductFilter]  = useState("all");
  const [detailRequest,  setDetailRequest]  = useState<MarketplaceRequest | null>(null);
  const [biddingRequest, setBiddingRequest] = useState<MarketplaceRequest | null>(null);
  const [bidSuccessId,   setBidSuccessId]   = useState<string | null>(null);

  const modules  = institution?.modules ?? [];
  const canBid   = modules.includes("marketplace");

  const productTypes = Array.from(new Set(requests.map((r) => r.product_type)));
  const filterOptions = [
    { key: "all" as const, label: "All products" },
    ...productTypes.map((pt) => ({
      key: pt as string,
      label: products.find((p) => p.code === pt)?.label ?? pt,
    })),
  ];

  const filtered = requests.filter(
    (r) => productFilter === "all" || r.product_type === productFilter
  );

  const handleBidSubmit = useCallback(async (data: BidForm) => {
    if (!biddingRequest) return;
    try {
      const id = await submitBid.mutateAsync({
        request_id:     biddingRequest.id,
        rate:           data.rate,
        rate_type:      data.rate_type,
        amount_offered: data.amount_offered,
        term_months:    data.term_months,
        conditions:     data.notes ? { notes: data.notes } : undefined,
        submitted_via:  "portal",
      });
      setBidSuccessId(id as string);
      setBiddingRequest(null);
      setDetailRequest(null);
    } catch {
      /* error surfaced via submitBid.error */
    }
  }, [biddingRequest, submitBid]);

  return (
    <main className="p-6 lg:p-8 max-w-[1440px] mx-auto">
      <SectionHeader
        title="Marketplace"
        subtitle={`${filtered.length} open request${filtered.length !== 1 ? "s" : ""} · auto-refreshes every 30 s`}
        badge={<LiveBadge />}
        actions={
          <Btn
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => refetch()}
          >
            Refresh
          </Btn>
        }
      />

      <IntelStrip />

      <InlineAlert variant="info">
        Bids require a second admin to approve in{" "}
        <a href="/approvals" className="font-semibold underline underline-offset-2">
          Approvals
        </a>{" "}
        before submission to the client.
      </InlineAlert>

      {bidSuccessId && (
        <div className="mt-4">
          <InlineAlert
            variant="success"
            onDismiss={() => setBidSuccessId(null)}
          >
            Bid submitted for maker-checker approval — action{" "}
            <code className="font-mono text-[11px]">{bidSuccessId.slice(0, 8)}…</code>
          </InlineAlert>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5 mb-5">
        <SlidersHorizontal className="w-4 h-4 text-muted flex-shrink-0" aria-hidden />
        <FilterPills
          options={filterOptions}
          value={productFilter}
          onChange={setProductFilter}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No open requests right now"
          description="New requests appear automatically every 30 seconds"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              canBid={canBid}
              onOpen={() => setDetailRequest(req)}
              onBid={() => setBiddingRequest(req)}
            />
          ))}
        </div>
      )}

      {detailRequest && (
        <RequestDetailDrawer
          request={detailRequest}
          onClose={() => setDetailRequest(null)}
          onBid={() => setBiddingRequest(detailRequest)}
        />
      )}
      {biddingRequest && (
        <BidModal
          request={biddingRequest}
          onClose={() => setBiddingRequest(null)}
          onSubmit={handleBidSubmit}
          isSubmitting={submitBid.isPending}
          error={submitBid.error?.message}
        />
      )}
    </main>
  );
}
