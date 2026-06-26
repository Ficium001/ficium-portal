/**
 * PipelineDetail.tsx — pipeline detail page (thin shell).
 * Data: usePipeline hook.
 * Rendering: DealSummaryPanel, BorrowerIdentityPanel, StageCard components.
 */
import { useParams, useNavigate }  from "react-router-dom";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { Spinner }                 from "@/shared/components/Spinner";
import { PageShell }               from "@/shared/components/PageShell";
import { DealSummaryPanel }        from "../components/DealSummaryPanel";
import { BorrowerIdentityPanel }   from "../components/BorrowerIdentityPanel";
import { StageCard }               from "../components/StageCard";
import { usePipeline }             from "../hooks/usePipeline";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PipelineDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pipeline, isLoading } = usePipeline(id!);

  if (isLoading) return (
    <PageShell title="Pipeline">
      <div className="flex justify-center py-16"><Spinner /></div>
    </PageShell>
  );
  if (!pipeline) return (
    <PageShell title="Pipeline">
      <p className="text-center text-muted py-16">Pipeline not found.</p>
    </PageShell>
  );

  const activeStageId = pipeline.stages.find(
    (s) => s.status === "active" || s.status === "awaiting_approval",
  )?.id;

  return (
    <PageShell
      title="Loan Pipeline"
      subtitle={`${pipeline.product_label} · ref ${pipeline.consumer_ref}`}
      headerLeft={
        <button onClick={() => navigate(-1)} className="text-muted hover:text-ink transition-colors">
          <ChevronLeft size={20} />
        </button>
      }
    >
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
    </PageShell>
  );
}
