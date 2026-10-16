/**
 * PipelineDetail.tsx — the Deal page (/deals/:id).
 *
 * One place for everything after a bid is accepted. Tabs are contributed by
 * modules (manifest.dealTabs) — overview from deals, documents from doc
 * templates, signatures from e-sign, messages from marketplace — and each
 * shows only if the user holds that module's key. The page itself knows no
 * features, so a new module (e.g. disbursement) adds a tab by declaring it.
 *
 * The active tab lives in ?tab= so a deal can be linked to a specific tab.
 */
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { SkeletonCard, StatusBadge } from "@/institution/components/primitives";
import { SectionTabs, type SectionTab } from "@/shared/components/SectionTabs";
import { usePipeline }      from "@/institution/pipeline/hooks/usePipeline";
import { useModulesAccess } from "@/shared/hooks/useModuleAccess";
import { DealLifecycle }    from "@/institution/pipeline/components/DealLifecycle";
import { DEAL_TABS }        from "@/app/registry/select";

const TAB_KEYS = DEAL_TABS.map((t) => t.moduleKey);

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PipelineDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: deal, isLoading } = usePipeline(id!);
  const access = useModulesAccess(TAB_KEYS);

  if (isLoading || access.isLoading) return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto"><div className="space-y-3">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i}/>)}</div></main>
  );
  if (!deal) return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto py-16 text-center text-muted">This deal could not be found. It may have been withdrawn.</main>
  );

  const visible = DEAL_TABS.filter((t) => access.allowed[t.moduleKey]);
  const tabs: SectionTab<string>[] = visible.map(({ key, label, Badge }) => ({
    key, label, badge: Badge ? <Badge deal={deal} /> : undefined,
  }));

  const requested = params.get("tab");
  const active = visible.find((t) => t.key === requested) ?? visible[0];
  const setTab = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === visible[0]?.key) next.delete("tab"); else next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate("/deals")} aria-label="Back to deals"
                className="mt-1 text-muted hover:text-ink transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-[20px] text-ink">{deal.product_label}</h1>
            <StatusBadge status={deal.status} />
          </div>
          <p className="text-[12px] text-muted">
            {deal.borrower_name ?? "Borrower"}, ref {deal.consumer_ref}, started {fmtDate(deal.started_at)}
          </p>
        </div>
      </div>

      <DealLifecycle deal={deal} onOpenTab={setTab} availableTabs={visible.map((t) => t.key)} />

      {active && (
        <>
          <SectionTabs tabs={tabs} active={active.key} onChange={setTab} idPrefix="deal" label="Deal sections" />
          <div role="tabpanel" id={`deal-panel-${active.key}`} aria-labelledby={`deal-tab-${active.key}`}>
            {active.render(deal)}
          </div>
        </>
      )}
    </main>
  );
}
