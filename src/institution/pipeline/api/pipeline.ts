/**
 * institution/pipeline/api/pipeline.ts
 * Raw API calls for the pipeline module.
 * All calls go through portalApi — no direct fetch() calls in components.
 */
import { portalApi } from "@/shared/lib/portalApi";
import type {
  PipelineSummary,
  PipelineDetail,
  AdvanceStageResult,
} from "@/institution/pipeline/types/pipeline";

export async function fetchPipelines(
  status = "active",
): Promise<PipelineSummary[]> {
  return portalApi.get<PipelineSummary[]>(`/pipelines?status=${status}`);
}

export async function fetchPipeline(id: string): Promise<PipelineDetail> {
  return portalApi.get<PipelineDetail>(`/pipelines/${id}`);
}

export async function advanceStage(
  pipelineId: string,
  stageId:    string,
  notes?:     string,
): Promise<AdvanceStageResult> {
  return portalApi.post<AdvanceStageResult>(
    `/pipelines/${pipelineId}/stages/${stageId}/advance`,
    { notes },
  );
}

export async function approveStage(
  pipelineId: string,
  stageId:    string,
  notes?:     string,
): Promise<AdvanceStageResult> {
  return portalApi.post<AdvanceStageResult>(
    `/pipelines/${pipelineId}/stages/${stageId}/approve`,
    { notes },
  );
}
