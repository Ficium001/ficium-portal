import { Zap, Clock, Calendar }   from "lucide-react";
import { formatDistanceToNow }     from "@/institution/lib/utils";
import type { MarketplaceRequest } from "@/institution/types/institution";

interface RequestCardProps {
  request: MarketplaceRequest;
  canBid:  boolean;
  onOpen:  () => void;
  onBid:   () => void;
}

const fmt     = (v: number) => v >= 1_000_000 ? `MUR ${(v / 1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" });

export function RequestCard({ request, canBid, onOpen, onBid }: RequestCardProps) {
  const isUrgent = new Date(request.bid_window_closes_at).getTime() - Date.now() < 60 * 60 * 1000;
  return (
    <div onClick={onOpen}
      className="bg-white rounded-2xl p-5 shadow-card hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[11px] font-bold text-ficium uppercase tracking-widest mb-1">{request.family_label ?? "Financial product"}</div>
          <div className="font-display font-bold text-[16px] text-ink">{request.product_label ?? request.product_type}</div>
        </div>
        <span className="bg-green-50 text-green-700 border border-green-200 text-[11px] font-semibold px-2.5 py-1 rounded-full">Open</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-cream rounded-xl p-3">
          <div className="text-[11px] text-muted mb-1">Amount</div>
          <div className="font-bold text-ink text-[14px]">{fmt(Number(request.amount))}</div>
        </div>
        {request.term_months && (
          <div className="bg-cream rounded-xl p-3">
            <div className="text-[11px] text-muted mb-1">Term</div>
            <div className="font-bold text-ink text-[14px]">{request.term_months} months</div>
          </div>
        )}
      </div>

      {request.purpose && <p className="text-[12px] text-muted mb-3 line-clamp-2">{request.purpose}</p>}

      <div className="flex items-center gap-1.5 text-[11px] text-muted mb-3">
        <Calendar className="w-3 h-3" />
        Submitted {fmtDate(request.created_at)}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-ink/[0.06]">
        <div className={`flex items-center gap-1.5 text-[12px] ${isUrgent ? "text-red-500 font-semibold" : "text-muted"}`}>
          <Clock className="w-3.5 h-3.5" />
          {formatDistanceToNow(request.bid_window_closes_at)}
        </div>
        {canBid && (
          <button onClick={(e) => { e.stopPropagation(); onBid(); }}
            className="flex items-center gap-1.5 bg-ficium text-white text-[12px] font-bold px-4 py-2 rounded-xl hover:bg-ficium-deep transition-colors">
            <Zap className="w-3.5 h-3.5" /> Place bid
          </button>
        )}
      </div>
    </div>
  );
}
