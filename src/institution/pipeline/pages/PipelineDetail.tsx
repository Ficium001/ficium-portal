/**
 * PipelineDetail.tsx — the Deal page.
 *
 * One place for everything that happens after a bid is accepted. Each tab
 * reuses the component that already owns that job; nothing here talks to the
 * API directly.
 *
 *   Overview   — terms, borrower identity, processing stages   (inst:pipeline)
 *   Documents  — generated offer letters / agreements          (inst:doctemplates)
 *   Signatures — e-sign envelopes raised against this deal      (inst:esign)
 *   Messages   — the borrower conversation for the request      (inst:marketplace)
 *
 * Tabs a user's group or plan doesn't include are hidden, using the same
 * useModuleAccess check RequireModule applies to routes. The active tab lives
 * in ?tab= so a deal can be linked straight to its signatures or messages.
 */
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { SkeletonCard, StatusBadge } from "@/institution/components/primitives";
import { DealSummaryPanel }        from "@/institution/pipeline/components/DealSummaryPanel";
import { BorrowerIdentityPanel }   from "@/institution/pipeline/components/BorrowerIdentityPanel";
import { StageCard }               from "@/institution/pipeline/components/StageCard";
import { DealDocumentsPanel }      from "@/institution/pipeline/components/DealDocumentsPanel";
import { DealSignaturesPanel }     from "@/institution/pipeline/components/DealSignaturesPanel";
import { DealTabs, type DealTab }  from "@/institution/pipeline/components/DealTabs";
import { usePipeline }             from "@/institution/pipeline/hooks/usePipeline";
import { useDealEnvelopes }        from "@/institution/pipeline/hooks/useDealEnvelopes";
import { useModuleAccess }         from "@/shared/hooks/useModuleAccess";
import RequestChat                 from "@/shared/components/RequestChat";

type TabKey = "overview" | "documents" | "signatures" | "messages";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PipelineDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: pipeline, isLoading } = usePipeline(id!);

  const docs  = useModuleAccess("inst:doctemplates");
  const esign = useModuleAccess("inst:esign");
  const chat  = useModuleAccess("inst:marketplace");
  const envelopes = useDealEnvelopes(id!, esign.allowed);

  if (isLoading) return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto"><div className="space-y-3">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i}/>)}</div></main>
  );
  if (!pipeline) return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto py-16 text-center text-muted">This deal could not be found. It may have been withdrawn.</main>
  );

  const completed = pipeline.stages.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const pendingSignatures = (envelopes.data ?? []).filter(
    (e) => e.status === "sent" || e.status === "partially_signed",
  ).length;

  const tabs: DealTab<TabKey>[] = [
    { key: "overview",   label: "Overview",   badge: `${completed}/${pipeline.stages.length}` },
    ...(docs.allowed  ? [{ key: "documents"  as const, label: "Documents" }] : []),
    ...(esign.allowed ? [{ key: "signatures" as const, label: "Signatures",
                           badge: pendingSignatures ? `${pendingSignatures} waiting` : undefined }] : []),
    ...(chat.allowed  ? [{ key: "messages"   as const, label: "Messages" }] : []),
  ];

  const requested = params.get("tab") as TabKey | null;
  const active: TabKey = tabs.some((t) => t.key === requested) ? requested! : "overview";
  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params);
    if (key === "overview") next.delete("tab"); else next.set("tab", key);
    setParams(next, { replace: true });
  };

  const activeStageId = pipeline.stages.find(
    (s) => s.status === "active" || s.status === "awaiting_approval",
  )?.id;
  const dealLabel = `${pipeline.product_label} — ref ${pipeline.consumer_ref}`;

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate("/deals")} aria-label="Back to deals"
                className="mt-1 text-muted hover:text-ink transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-[20px] text-ink">{pipeline.product_label}</h1>
            <StatusBadge status={pipeline.status} />
          </div>
          <p className="text-[12px] text-muted">
            {pipeline.borrower_name ?? "Borrower"}, ref {pipeline.consumer_ref}, started {fmtDate(pipeline.started_at)}
          </p>
        </div>
      </div>

      <DealTabs tabs={tabs} active={active} onChange={setTab} />

      <div role="tabpanel" id={`deal-panel-${active}`} aria-labelledby={`deal-tab-${active}`}>
        {active === "overview" && (
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
              <h2 className="text-[13px] font-semibold text-ink mb-3">Processing stages</h2>
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
                <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                <div>
                  <div className="font-semibold">Deal complete</div>
                  <div className="text-[12px] text-green-700 mt-0.5">
                    Completed {fmtDate(pipeline.completed_at)}. Commission event raised.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {active === "documents" && (
          <DealDocumentsPanel pipelineId={pipeline.id} dealLabel={dealLabel} />
        )}

        {active === "signatures" && (
          <DealSignaturesPanel pipelineId={pipeline.id} dealLabel={dealLabel} />
        )}

        {active === "messages" && (
          <div className="bg-white border border-line rounded-card shadow-card h-[560px] flex flex-col overflow-hidden">
            <RequestChat requestId={pipeline.request_id} />
          </div>
        )}
      </div>
    </main>
  );
}
