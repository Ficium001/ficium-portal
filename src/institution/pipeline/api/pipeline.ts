/**
 * institution/pipeline/api/pipeline.ts
 * Raw API calls for the pipeline module — run-time + template config.
 * All calls go through portalApi — no direct fetch() calls in components.
 */
import { portalApi } from "@/shared/lib/portalApi";
import type {
  PipelineSummary,
  PipelineDetail,
  AdvanceStageResult,
  PipelineTemplate,
  PipelineTemplateDetail,
  CreateTemplatePayload,
  CreateStagePayload,
  UpdateStagePayload,
} from "@/institution/pipeline/types/pipeline";

// ── Run-time ──────────────────────────────────────────────────────────────────
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

// ── Template config ───────────────────────────────────────────────────────────
export async function fetchTemplates(): Promise<PipelineTemplate[]> {
  return portalApi.get<PipelineTemplate[]>("/pipelines/templates");
}

export async function fetchTemplate(id: string): Promise<PipelineTemplateDetail> {
  return portalApi.get<PipelineTemplateDetail>(`/pipelines/templates/${id}`);
}

export async function createTemplate(
  payload: CreateTemplatePayload,
): Promise<PipelineTemplateDetail> {
  return portalApi.post<PipelineTemplateDetail>("/pipelines/templates", payload);
}

export async function updateTemplate(
  id:      string,
  payload: Partial<{ name: string; description: string; is_active: boolean }>,
): Promise<PipelineTemplate> {
  return portalApi.put<PipelineTemplate>(`/pipelines/templates/${id}`, payload);
}

export async function addStage(
  templateId: string,
  payload:    CreateStagePayload,
): Promise<PipelineTemplateDetail["stages"][number]> {
  return portalApi.post(`/pipelines/templates/${templateId}/stages`, payload);
}

export async function updateStageApi(
  templateId: string,
  stageId:    string,
  payload:    UpdateStagePayload,
): Promise<PipelineTemplateDetail["stages"][number]> {
  return portalApi.put(`/pipelines/templates/${templateId}/stages/${stageId}`, payload);
}

export async function deleteStageApi(
  templateId: string,
  stageId:    string,
): Promise<void> {
  return portalApi.delete(`/pipelines/templates/${templateId}/stages/${stageId}`);
}
