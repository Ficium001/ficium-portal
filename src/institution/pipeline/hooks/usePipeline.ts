/**
 * institution/pipeline/hooks/usePipeline.ts
 * React Query hooks for the pipeline module.
 * Components import from here — never from api/ directly.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  advanceStage,
  approveStage,
  fetchPipeline,
  fetchPipelines,
} from "../api/pipeline";
import type { PipelineStatus } from "../types/pipeline";

// ── Query keys — pipeline module namespace ────────────────────────────────────
export const PipelineKeys = {
  all:    ["pipelines"]                            as const,
  list:   (status: PipelineStatus | "active") =>
            ["pipelines", "list", status]           as const,
  detail: (id: string) => ["pipelines", id]        as const,
} as const;

// ── List ──────────────────────────────────────────────────────────────────────
export function usePipelines(status: PipelineStatus | "active" = "active") {
  return useQuery({
    queryKey: PipelineKeys.list(status),
    queryFn:  () => fetchPipelines(status),
    staleTime: 30_000,
  });
}

// ── Detail ────────────────────────────────────────────────────────────────────
export function usePipeline(id: string) {
  return useQuery({
    queryKey: PipelineKeys.detail(id),
    queryFn:  () => fetchPipeline(id),
    enabled:  !!id,
    staleTime: 20_000,
  });
}

// ── Stage actions ─────────────────────────────────────────────────────────────
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
