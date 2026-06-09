import { useState }    from "react";
import { Filter, AlertTriangle, X, BarChart2 } from "lucide-react";
import {
  useMarketplace, useProducts, useSubmitBid, useMyInstitution,
} from "@/institution/hooks/useInstitution";
import { useIntelligence }   from "@/shared/lib/intelligence";
import { RequestCard }       from "@/marketplace/components/RequestCard";
import { RequestDetailDrawer } from "@/marketplace/components/RequestDetailDrawer";
import { BidModal }          from "@/marketplace/components/BidModal";
import type { BidForm }      from "@/marketplace/components/BidModal";
import type { MarketplaceRequest } from "@/institution/types/institution";

// ─────────────────────────────────────────────────────────────────────────────
// InstitutionMarketplace — thin orchestrator.
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionMarketplace() {
  const { data: institution }                       = useMyInstitution();
  const { data: requests = [], isLoading, refetch } = useMarketplace();
  const { data: products  = [] }                    = useProducts();
  const submitBid                                   = useSubmitBid();
  const { intel }                                   = useIntelligence();

  const [productFilter,  setProductFilter]  = useState("all");
  const [detailRequest,  setDetailRequest]  = useState<MarketplaceRequest | null>(null);
  const [biddingRequest, setBiddingRequest] = useState<MarketplaceRequest | null>(null);
  const [bidSuccess,     setBidSuccess]     = useState<string | null>(null);

  const filtered     = requests.filter((r) => productFilter === "all" || r.product_type === productFilter);
  const productTypes = Array.from(new Set(requests.map((r) => r.product_type)));
  const canBid       = !!institution;

  const handleBidSubmit = async (data: BidForm) => {
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
      setBidSuccess(id as string);
      setBiddingRequest(null);
      setDetailRequest(null);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Marketplace</h1>
          <p className="text-muted mt-1.5">{filtered.length} open request{filtered.length !== 1 ? "s" : ""} · refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 font-bold text-[13px] px-4 py-2 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> LIVE
          </span>
          <button onClick={() => refetch()} className="border border-ink/10 text-muted text-[13px] font-medium px-4 py-2 rounded-full hover:bg-ink/[0.03] transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Maker-checker notice */}
      <div className="bg-ficium/5 border border-ficium/15 rounded-2xl px-5 py-3.5 flex items-center gap-3 mb-6">
        <AlertTriangle className="w-4 h-4 text-ficium flex-shrink-0" />
        <p className="text-[13px] text-ink/70">
          Bids require a second admin to approve in <span className="text-ficium font-semibold">Approvals</span> before submission.
        </p>
      </div>

      {/* Live market intelligence */}
      {intel?.marketRates && intel.marketRates.length > 0 && (
        <div className="bg-white border border-ink/[0.06] rounded-2xl p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-ficium/10 grid place-items-center">
              <BarChart2 className="w-3.5 h-3.5 text-ficium" />
            </div>
            <span className="text-[12px] font-bold text-ficium uppercase tracking-widest">Live Market Intelligence</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-muted font-medium">Updated every 5 min</span>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {intel.marketRates.slice(0, 4).map((r) => {
              const win  = intel.acceptanceIntel.find((a) => a.product_type === r.product_type);
              const comp = intel.competitiveness.find((c) => c.product_type === r.product_type);
              return (
                <div key={r.product_type} className="bg-cream rounded-xl p-3.5">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 capitalize">{r.product_type.replace(/_/g, " ")}</div>
                  <div className="font-display text-[20px] font-extrabold text-ficium leading-none mb-1">{r.avg_rate_pct}%</div>
                  <div className="text-[11px] text-muted">market avg APR</div>
                  <div className="mt-2 pt-2 border-t border-ink/[0.06] space-y-0.5">
                    <div className="text-[11px] text-ink/60">Range: <span className="font-semibold text-ink">{r.min_rate_pct}–{r.max_rate_pct}%</span></div>
                    {win  && <div className="text-[11px] text-ink/60">Win avg: <span className="font-semibold text-emerald-600">{win.avg_winning_rate_pct}%</span></div>}
                    {comp && <div className="text-[11px] text-ink/60">Avg bids/req: <span className="font-semibold text-ink">{comp.avg_bids_per_request}</span></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Success toast */}
      {bidSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3.5 flex items-center justify-between mb-6">
          <p className="text-[13px] text-green-700 font-medium">
            ✓ Bid submitted for approval — Action <code className="font-mono text-[12px]">{bidSuccess.slice(0, 8)}…</code>
          </p>
          <button onClick={() => setBidSuccess(null)} className="text-green-400 hover:text-green-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Product filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Filter className="w-4 h-4 text-muted" />
        {["all", ...productTypes].map((pt) => {
          const product = products.find((p) => p.code === pt);
          const label   = pt === "all" ? "All products" : (product?.label ?? pt);
          return (
            <button key={pt} onClick={() => setProductFilter(pt)}
              className={`text-[13px] font-medium px-4 py-1.5 rounded-full border transition-colors ${
                productFilter === pt ? "bg-ficium text-white border-ficium" : "bg-white border-ink/10 text-muted hover:border-ficium/40 hover:text-ficium"
              }`}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-card">
          <p className="text-ink font-semibold mb-1">No open requests right now</p>
          <p className="text-muted text-[13px]">New requests appear automatically</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((req) => (
            <RequestCard key={req.id} request={req} canBid={canBid}
              onOpen={() => setDetailRequest(req)} onBid={() => setBiddingRequest(req)} />
          ))}
        </div>
      )}

      {detailRequest && (
        <RequestDetailDrawer request={detailRequest} onClose={() => setDetailRequest(null)} onBid={() => setBiddingRequest(detailRequest)} />
      )}
      {biddingRequest && (
        <BidModal request={biddingRequest} onClose={() => setBiddingRequest(null)}
          onSubmit={handleBidSubmit} isSubmitting={submitBid.isPending} error={submitBid.error?.message} />
      )}
    </div>
  );
}
