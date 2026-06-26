/**
 * InstitutionPipelines.tsx — pipeline list page (thin shell).
 * Data: usePipelines hook. Rendering: PipelineCard component.
 */
import { Spinner }      from "@/shared/components/Spinner";
import { EmptyState }   from "@/shared/components/EmptyState";
import { PageShell }    from "@/shared/components/PageShell";
import { PipelineCard } from "../components/PipelineCard";
import { usePipelines } from "../hooks/usePipeline";

export function InstitutionPipelines() {
  const { data: pipelines = [], isLoading } = usePipelines();

  return (
    <PageShell title="Loan Pipelines" subtitle="Active post-acceptance workflows">
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon="pipeline"
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
    </PageShell>
  );
}
