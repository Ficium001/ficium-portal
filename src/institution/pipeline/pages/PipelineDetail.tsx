/**
 * PipelineDetail.tsx — pipeline detail page (thin shell).
 * Data: usePipeline hook.
 * Rendering: DealSummaryPanel, BorrowerIdentityPanel, StageCard components.
 */
import { useParams, useNavigate }  from "react-router-dom";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { SkeletonCard }            from "@/institution/components/primitives";
import { DealSummaryPanel }        from "@/institution/pipeline/components/DealSummaryPanel";
import { BorrowerIdentityPanel }   from "@/institution/pipeline/components/BorrowerIdentityPanel";
import { StageCard }               from "@/institution/pipeline/components/StageCard";
import { usePipeline }             from "@/institution/pipeline/hooks/usePipeline";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PipelineDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pipeline, isLoading } = usePipeline(id!);

  if (isLoading) return (
    <div className="px-4 py-6"><div className="space-y-3">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i}/>)}</div></div>
  );
  if (!pipeline) return (
    <div className="px-4 py-16 text-center text-muted">Pipeline not found.</div>
  );

  const activeStageId = pipeline.stages.find(
    (s) => s.status === "active" || s.status === "awaiting_approval",
  )?.id;

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted hover:text-ink transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-display font-bold text-[20px] text-ink">Loan Pipeline</h1>
          <p className="text-[12px] text-muted">{pipeline.product_label} · ref {pipeline.consumer_ref}</p>
        </div>
      </div>
      <div className="space-y-5">
        <DealSummaryPanel
          amount={pipeline.deal_amount}
          rate={pipeline.deal_rate}
          termMonths={pipeline.deal_term_months}
        />

        <BorrowerIdentityPanel
          name={pipeline.borrower_name}
          email={pipeline.borrower_email}
          phone={pipeline.borrower_phone}
          address={pipeline.borrower_address}
        />

        <div>
          <h2 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">
            Processing stages
          </h2>
          <div className="space-y-2">
            {pipeline.stages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                pipelineId={pipeline.id}
                isActive={stage.id === activeStageId}
              />
            ))}
          </div>
        </div>

        {pipeline.status === "completed" && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200
                          rounded-2xl px-4 py-3 text-[13px] text-green-800">
            <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
            <div>
              <div className="font-semibold">Pipeline complete</div>
              <div className="text-[12px] text-green-700 mt-0.5">
                Completed {fmtDate(pipeline.completed_at)} · Commission event raised
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
