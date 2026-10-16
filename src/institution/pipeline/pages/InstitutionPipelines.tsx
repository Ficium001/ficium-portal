/**
 * InstitutionPipelines.tsx — pipeline list page (thin shell).
 * Data: usePipelines hook. Rendering: PipelineCard component.
 */
import { SkeletonCard, EmptyState } from "@/institution/components/primitives";
import { GitBranch }    from "lucide-react";
import { PipelineCard } from "@/institution/pipeline/components/PipelineCard";
import { usePipelines } from "@/institution/pipeline/hooks/usePipeline";

export function InstitutionPipelines() {
  const { data: pipelines = [], isLoading } = usePipelines();

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-4">
      <div>
        <h1 className="font-display font-bold text-[22px] text-ink">Deals</h1>
        <p className="text-[13px] text-muted mt-0.5">Bids your borrowers have accepted, from offer to disbursement</p>
      </div>
      {isLoading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i}/>)}</div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No deals yet"
          description="A deal opens here automatically when a borrower accepts one of your bids."
        />
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <PipelineCard key={p.id} pipeline={p} />
          ))}
        </div>
      )}
    </main>
  );
}
