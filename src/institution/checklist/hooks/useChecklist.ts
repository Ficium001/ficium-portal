/** Document checklist queries. Changing a document refreshes the deal too (stage counts). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PK } from '@/institution/pipeline/hooks/usePipeline'
import {
  createRequirement, fetchDealDocuments, fetchRequirements, removeRequirement,
  reviewDealDocument, updateRequirement, uploadDealDocument,
} from '../api/checklist'
import type { DocRequirement } from '../types'

export const CK = {
  deal: (pid: string) => ['checklist', 'deal', pid] as const,
  template: (tid: string) => ['checklist', 'template', tid] as const,
}

export function useDealDocuments(pipelineId: string, enabled = true) {
  return useQuery({
    queryKey: CK.deal(pipelineId),
    queryFn: () => fetchDealDocuments(pipelineId),
    enabled,
  })
}

function useRefreshDeal(pipelineId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: CK.deal(pipelineId) })
    qc.invalidateQueries({ queryKey: PK.detail(pipelineId) })
  }
}

export function useUploadDealDocument(pipelineId: string) {
  const refresh = useRefreshDeal(pipelineId)
  return useMutation({
    mutationFn: ({ docId, file }: { docId: string; file: File }) =>
      uploadDealDocument(pipelineId, docId, file),
    onSuccess: refresh,
  })
}

export function useReviewDealDocument(pipelineId: string) {
  const refresh = useRefreshDeal(pipelineId)
  return useMutation({
    mutationFn: ({ docId, action, note }: { docId: string; action: 'verify' | 'reject' | 'waive'; note?: string }) =>
      reviewDealDocument(pipelineId, docId, action, note),
    onSuccess: refresh,
  })
}

export function useRequirements(templateId: string) {
  return useQuery({ queryKey: CK.template(templateId), queryFn: () => fetchRequirements(templateId) })
}

export function useSaveRequirement(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<DocRequirement> }) =>
      id ? updateRequirement(templateId, id, body) : createRequirement(templateId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CK.template(templateId) }),
  })
}

export function useRemoveRequirement(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeRequirement(templateId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CK.template(templateId) }),
  })
}
