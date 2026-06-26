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
    <div className="px-4 py-6 space-y-4">
      <div>
        <h1 className="font-display font-bold text-[22px] text-ink">Loan Pipelines</h1>
        <p className="text-[13px] text-muted mt-0.5">Active post-acceptance workflows</p>
      </div>
      {isLoading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i}/>)}</div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No active pipelines"
          description="Pipelines are created automatically when a borrower accepts a bid."
        />
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <PipelineCard key={p.id} pipeline={p} />
          ))}
        </div>
      )}
    </div>
  );
}
