// =============================================================
// Ficium Portal — inst:esign hooks
// Backend: ficium-portal-api /esign/*
//
// Extracted from institution/hooks/useApprovalEngine.ts. E-sign is its own
// licensed module with its own pages, so having its data layer live inside
// the approval engine's hook file meant the esign/ module reached across a
// module boundary for every query it made.
//
// E-sign stays *related* to approvals — an envelope may carry the
// approval_instance_id of the decision that authorised it — but that is a
// field on the payload, not a reason to share a file.
// =============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import { poll30s } from '@/shared/lib/polling'
import type { EsignEnvelope, EsignEventTrail, EntityType } from '@/institution/types/approvalEngine'

export const ESQK = {
  envelopes: ['esign', 'envelopes'] as const,
  events:    (id: string) => ['esign', 'events', id] as const,
} as const

/** Entity types an envelope can be raised against (e-sign's own vocabulary). */
export type EsignEntityType = Extract<EntityType, 'offer_letter' | 'investment_mandate' | 'custom'>

export interface CreateEnvelopeBody {
  entity_type: EsignEntityType
  entity_id: string
  /** Approval instance that authorised this envelope, when raised from a decision. */
  approval_instance_id?: string
  title: string
  /** Storage path of the document to be signed — normally an output path from a doc generation. */
  document_path: string
  /** Generation this document came from, so the envelope is traceable to its source. */
  doc_generation_id?: string
  expires_hours?: number
  borrower_name: string
  borrower_email: string
  borrower_ref?: string
  countersigner_name: string
  countersigner_email: string
  countersigner_ref: string
}

export function useEsignEnvelopes() {
  return useQuery<EsignEnvelope[]>({
    queryKey: ESQK.envelopes,
    queryFn: () => portalApi.get<EsignEnvelope[]>('/esign/envelopes'),
    refetchInterval: poll30s,
    refetchOnWindowFocus: true,
  })
}

export function useCreateEnvelope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateEnvelopeBody) =>
      portalApi.post<{ envelope_id: string }>('/esign/envelopes', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ESQK.envelopes }),
  })
}

export function useEnvelopeEvents(envelopeId: string) {
  return useQuery<EsignEventTrail>({
    queryKey: ESQK.events(envelopeId),
    queryFn: () => portalApi.get<EsignEventTrail>(`/esign/envelopes/${envelopeId}/events`),
    enabled: !!envelopeId,
  })
}

export function useSealedUrl() {
  return useMutation({
    mutationFn: (envelopeId: string) =>
      portalApi.get<{ url: string; sha256: string }>(`/esign/envelopes/${envelopeId}/sealed-url`),
  })
}
