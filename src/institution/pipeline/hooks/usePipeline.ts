/**
 * institution/pipeline/hooks/usePipeline.ts
 * React Query hooks for the pipeline module — run-time + template config.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  advanceStage, approveStage, fetchPipeline, fetchPipelines,
  fetchTemplates, fetchTemplate,
  createTemplate, updateTemplate,
  addStage, updateStageApi, deleteStageApi,
} from "@/institution/pipeline/api/pipeline";
import type {
  PipelineStatus,
  CreateTemplatePayload, CreateStagePayload, UpdateStagePayload,
} from "@/institution/pipeline/types/pipeline";

// ── Query key namespaces ──────────────────────────────────────────────────────
export const PipelineKeys = {
  all:       ["pipelines"]                                      as const,
  list:      (status: PipelineStatus | "active") =>
               ["pipelines", "list", status]                   as const,
  detail:    (id: string) => ["pipelines", id]                  as const,
  templates: ["pipelines", "templates"]                         as const,
  template:  (id: string) => ["pipelines", "template", id]     as const,
} as const;

// ── Run-time hooks ────────────────────────────────────────────────────────────
export function usePipelines(status: PipelineStatus | "active" = "active") {
  return useQuery({
    queryKey: PipelineKeys.list(status),
    queryFn:  () => fetchPipelines(status),
    staleTime: 30_000,
  });
}

export function usePipeline(id: string) {
  return useQuery({
    queryKey: PipelineKeys.detail(id),
    queryFn:  () => fetchPipeline(id),
    enabled:  !!id,
    staleTime: 20_000,
  });
}

export function useAdvanceStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, notes }: { stageId: string; notes?: string }) =>
      advanceStage(pipelineId, stageId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PipelineKeys.detail(pipelineId) });
      qc.invalidateQueries({ queryKey: PipelineKeys.all });
    },
  });
}

export function useApproveStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, notes }: { stageId: string; notes?: string }) =>
      approveStage(pipelineId, stageId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PipelineKeys.detail(pipelineId) });
      qc.invalidateQueries({ queryKey: PipelineKeys.all });
    },
  });
}

// ── Template config hooks ─────────────────────────────────────────────────────
export function useTemplates() {
  return useQuery({
    queryKey: PipelineKeys.templates,
    queryFn:  fetchTemplates,
    staleTime: 60_000,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: PipelineKeys.template(id),
    queryFn:  () => fetchTemplate(id),
    enabled:  !!id,
    staleTime: 30_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateTemplatePayload) => createTemplate(p),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PipelineKeys.templates }),
  });
}

export function useUpdateTemplate(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<{ name: string; description: string; is_active: boolean }>) =>
      updateTemplate(templateId, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PipelineKeys.templates });
      qc.invalidateQueries({ queryKey: PipelineKeys.template(templateId) });
    },
  });
}

export function useAddStage(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateStagePayload) => addStage(templateId, p),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PipelineKeys.template(templateId) }),
  });
}

export function useUpdateStage(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, payload }: { stageId: string; payload: UpdateStagePayload }) =>
      updateStageApi(templateId, stageId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: PipelineKeys.template(templateId) }),
  });
}

export function useDeleteStage(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) => deleteStageApi(templateId, stageId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PipelineKeys.template(templateId) }),
  });
}
