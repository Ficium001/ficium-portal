/**
 * institution/pipeline/api/pipeline.ts
 * Raw API calls for the pipeline module — run-time + template config.
 */
import { portalApi } from "@/shared/lib/portalApi";
import type {
  PipelineSummary, PipelineDetail, AdvanceStageResult,
  PipelineTemplate, PipelineTemplateDetail,
  CreateTemplatePayload, CreateStageDefPayload, UpdateStageDefPayload,
} from "@/institution/pipeline/types/pipeline";

// ── Run-time ──────────────────────────────────────────────────────────────────
export const fetchPipelines = (status = "active") =>
  portalApi.get<PipelineSummary[]>(`/pipelines?status=${status}`);

export const fetchPipeline = (id: string) =>
  portalApi.get<PipelineDetail>(`/pipelines/${id}`);

export const advanceStage = (pipelineId: string, stageId: string, notes?: string) =>
  portalApi.post<AdvanceStageResult>(
    `/pipelines/${pipelineId}/stages/${stageId}/advance`, { notes });

export const approveStage = (pipelineId: string, stageId: string, notes?: string) =>
  portalApi.post<AdvanceStageResult>(
    `/pipelines/${pipelineId}/stages/${stageId}/approve`, { notes });

// ── Template config ───────────────────────────────────────────────────────────
export const fetchTemplates = () =>
  portalApi.get<PipelineTemplate[]>("/pipelines/templates");

export const fetchTemplate = (id: string) =>
  portalApi.get<PipelineTemplateDetail>(`/pipelines/templates/${id}`);

export const createTemplate = (payload: CreateTemplatePayload) =>
  portalApi.post<PipelineTemplateDetail>("/pipelines/templates", payload);

export const updateTemplate = (
  id: string,
  payload: Partial<{ name: string; description: string; is_default: boolean; is_active: boolean }>,
) => portalApi.put<PipelineTemplate>(`/pipelines/templates/${id}`, payload);

export const addStageDef = (templateId: string, payload: CreateStageDefPayload) =>
  portalApi.post<PipelineTemplateDetail["stages"][number]>(
    `/pipelines/templates/${templateId}/stages`, payload);

export const updateStageDef = (templateId: string, stageId: string, payload: UpdateStageDefPayload) =>
  portalApi.put<PipelineTemplateDetail["stages"][number]>(
    `/pipelines/templates/${templateId}/stages/${stageId}`, payload);

export const deleteStageDef = (templateId: string, stageId: string) =>
  portalApi.delete(`/pipelines/templates/${templateId}/stages/${stageId}`);
