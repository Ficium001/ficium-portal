/**
 * DealOverview — the deal page's first tab: terms, borrower, processing stages.
 */
import { CheckCircle2 } from "lucide-react";
import type { PipelineDetail } from "@/institution/pipeline/types/pipeline";
import { DealSummaryPanel }      from "./DealSummaryPanel";
import { BorrowerIdentityPanel } from "./BorrowerIdentityPanel";
import { StageCard }             from "./StageCard";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function DealOverview({ deal }: { deal: PipelineDetail }) {
  const activeStageId = deal.stages.find(
    (s) => s.status === "active" || s.status === "awaiting_approval",
  )?.id;

  return (
    <div className="space-y-5">
      <DealSummaryPanel amount={deal.deal_amount} rate={deal.deal_rate} termMonths={deal.deal_term_months} />
      <BorrowerIdentityPanel
        name={deal.borrower_name}
        email={deal.borrower_email}
        phone={deal.borrower_phone}
        address={deal.borrower_address}
      />
      <div>
        <h2 className="text-[13px] font-semibold text-ink mb-3">Processing stages</h2>
        <div className="space-y-2">
          {deal.stages.map((stage) => (
            <StageCard key={stage.id} stage={stage} pipelineId={deal.id} isActive={stage.id === activeStageId} />
          ))}
        </div>
      </div>
      {deal.status === "completed" && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-[13px] text-green-800">
          <CheckCircle2 size={18} className="text-green-600 shrink-0" />
          <div>
            <div className="font-semibold">Deal complete</div>
            <div className="text-[12px] text-green-700 mt-0.5">
              Completed {fmtDate(deal.completed_at)}. Commission event raised.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
