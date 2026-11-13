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
import type { EsignEnvelope, EsignEventTrail } from '@/institution/types/approvalEngine'
import type { EsignEntityType } from '@/shared/lib/entities'

const ESQK = {
  envelopes: ['esign', 'envelopes'] as const,
  events:    (id: string) => ['esign', 'events', id] as const,
} as const

export type { EsignEntityType }

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

export function useEsignEnvelopes(enabled = true) {
  return useQuery<EsignEnvelope[]>({
    queryKey: ESQK.envelopes,
    enabled,
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

// ─── One-step offer from a deal ─── /institution/deals/{id}/* ─
// Readiness tells the officer what's ready and what's blocking before they
// press anything; send-offer generates the document and sends it in one call.
// Borrower and countersigner identities are resolved server-side.

export interface OfferTemplateOption {
  id: string
  name: string
  doc_category: string
  envelope_type: EsignEntityType
}

export interface OfferReadiness {
  ready: boolean
  blockers: string[]
  approval: { state: 'approved' | 'pending' | 'rejected' | 'none'; message: string }
  borrower: { name: string; email: string }
  templates: OfferTemplateOption[]
  default_template_id: string | null
  already_sent: number
  deal_label: string
}

export interface SendOfferBody {
  template_id: string
  countersigner_member_id: string
  expires_hours: number
}

const offerKey = (dealId: string) => ['esign', 'offer-readiness', dealId] as const

export function useOfferReadiness(dealId: string, enabled = true) {
  return useQuery<OfferReadiness>({
    queryKey: offerKey(dealId),
    enabled: enabled && !!dealId,
    queryFn: () => portalApi.get<OfferReadiness>(`/institution/deals/${dealId}/offer-readiness`),
    refetchOnWindowFocus: true,
  })
}

export function useSendOffer(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SendOfferBody) =>
      portalApi.post<{ envelope_id: string; generation_id: string }>(
        `/institution/deals/${dealId}/send-offer`, body,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ESQK.envelopes })
      void qc.invalidateQueries({ queryKey: offerKey(dealId) })
      void qc.invalidateQueries({ queryKey: ['doc-templates', 'generations'] })
    },
  })
}
