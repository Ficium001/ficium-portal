/**
 * institution/pipeline/hooks/usePipeline.ts
 * React Query hooks — run-time pipelines + template config.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  advanceStage, approveStage, fetchPipeline, fetchPipelines,
  fetchTemplates, fetchTemplate,
  createTemplate, updateTemplate,
  addStageDef, updateStageDef, deleteStageDef,
} from "@/institution/pipeline/api/pipeline";
import type {
  PipelineStatus, CreateTemplatePayload,
  CreateStageDefPayload, UpdateStageDefPayload,
} from "@/institution/pipeline/types/pipeline";

// ── Query keys ────────────────────────────────────────────────────────────────
export const PK = {
  all:       ["pipelines"]                                   as const,
  list:      (s: PipelineStatus | "active") =>
               ["pipelines", "list", s]                     as const,
  detail:    (id: string) => ["pipelines", id]              as const,
  templates: ["pipelines", "templates"]                     as const,
  template:  (id: string) => ["pipelines", "template", id] as const,
};

// ── Run-time ──────────────────────────────────────────────────────────────────
export function usePipelines(status: PipelineStatus | "active" = "active") {
  return useQuery({
    queryKey: PK.list(status),
    queryFn:  () => fetchPipelines(status),
    staleTime: 30_000,
  });
}

export function usePipeline(id: string) {
  return useQuery({
    queryKey: PK.detail(id),
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
      qc.invalidateQueries({ queryKey: PK.detail(pipelineId) });
      qc.invalidateQueries({ queryKey: PK.all });
    },
  });
}

export function useApproveStage(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, notes }: { stageId: string; notes?: string }) =>
      approveStage(pipelineId, stageId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PK.detail(pipelineId) });
      qc.invalidateQueries({ queryKey: PK.all });
    },
  });
}

// ── Template config ───────────────────────────────────────────────────────────
export function useTemplates() {
  return useQuery({
    queryKey: PK.templates,
    queryFn:  fetchTemplates,
    staleTime: 60_000,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: PK.template(id),
    queryFn:  () => fetchTemplate(id),
    enabled:  !!id,
    staleTime: 30_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateTemplatePayload) => createTemplate(p),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PK.templates }),
  });
}

export function useUpdateTemplate(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<{ name: string; description: string; is_default: boolean; is_active: boolean }>) =>
      updateTemplate(templateId, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PK.templates });
      qc.invalidateQueries({ queryKey: PK.template(templateId) });
    },
  });
}

export function useAddStageDef(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateStageDefPayload) => addStageDef(templateId, p),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PK.template(templateId) }),
  });
}

export function useUpdateStageDef(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, payload }: { stageId: string; payload: UpdateStageDefPayload }) =>
      updateStageDef(templateId, stageId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: PK.template(templateId) }),
  });
}

export function useDeleteStageDef(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) => deleteStageDef(templateId, stageId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PK.template(templateId) }),
  });
}
