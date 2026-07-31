// =============================================================
// Ficium 3 — Institution Portal Hooks
//
// All data flows through ficium-portal-api (FastAPI on Railway).
// No direct Supabase reads remain in this file.
//
// Hooks:
//   useMyInstitution, useMyRole, useInstitutionUsers   → /institutions /members
//   useMarketplace                                      → /marketplace/requests
//   useMyBids                                          → /marketplace/my-bids
//   useSubmitBid                                       → /approvals/submit
//   usePendingActions, useApproveAction, useRejectAction → /approvals/*
//   useWebhooks                                        → /webhooks
//   useProducts                                        → /products
//   useAuditEvents                                     → /audit
// =============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import type {
  Institution, InstitutionUser, InstitutionMember, InstitutionBid,
  MarketplaceRequest, PendingAction, InstitutionWebhook,
  Product, AuditEvent, BidPayload,
  BenefitCategory, Benefit, DocType, InstitutionDoc, ComplianceGate,
  ApiKey, WebhookDeliveryPage,
} from '@/institution/types/institution'
import { poll30s, poll60s } from '@/shared/lib/polling'

export const QK = {
  institution:      ['institution'] as const,
  institutionUsers: ['institution', 'users'] as const,
  marketplace:      ['marketplace'] as const,
  myBids:           ['my-bids'] as const,
  pendingActions:   ['pending-actions'] as const,
  webhooks:         ['webhooks'] as const,
  products:         ['products'] as const,
  audit:            ['audit'] as const,
  benefitCats:      ['benefit-categories'] as const,
  benefits:         ['benefits'] as const,
  docTypes:         ['doc-types'] as const,
  documents:        ['documents'] as const,
  compliance:       ['compliance'] as const,
} as const

// ─── useMyInstitution ─── portal-api /institutions/me ────────
export function useMyInstitution(options?: { enabled?: boolean }) {
  return useQuery<Institution>({
    queryKey: QK.institution,
    queryFn: () => portalApi.get<Institution>('/institutions/me'),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  })
}

// ─── useMyRole ─── portal-api /members/me ────────────────────
export function useMyRole() {
  return useQuery<InstitutionUser>({
    queryKey: [...QK.institutionUsers, 'me'],
    queryFn: () => portalApi.get<InstitutionUser>('/members/me'),
    staleTime: 10 * 60 * 1000,
  })
}

// ─── useMarketplace ─── portal-api /marketplace/requests ─────
export function useMarketplace(productCode?: string) {
  return useQuery<MarketplaceRequest[]>({
    queryKey: [...QK.marketplace, productCode],
    queryFn: () => {
      const path = productCode
        ? `/marketplace/requests?product_type=${encodeURIComponent(productCode)}`
        : '/marketplace/requests'
      return portalApi.get<MarketplaceRequest[]>(path)
    },
    refetchInterval: poll30s,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  })
}

// ─── useMyBids ─── portal-api /marketplace/my-bids ───────────
export function useMyBids(status?: string) {
  return useQuery<InstitutionBid[]>({
    queryKey: [...QK.myBids, status],
    queryFn: () => {
      const path = status
        ? `/marketplace/my-bids?status=${encodeURIComponent(status)}`
        : '/marketplace/my-bids'
      return portalApi.get<InstitutionBid[]>(path)
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── useSubmitBid ─── portal-api /approvals/submit ───────────
export function useSubmitBid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BidPayload) =>
      portalApi.post<{ action_id: string }>('/approvals/submit', {
        action_category: 'bid.submit',
        resource_type:   'institution_bids',
        resource_id:     null,
        payload,
      }).then(r => r.action_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pendingActions })
      qc.invalidateQueries({ queryKey: QK.myBids })
    },
  })
}

// ─── useRejectRequest ─── portal-api /marketplace/requests/{id}/reject ───
// Direct action, not routed through maker-checker: declining a request
// commits no capital and carries none of the risk a bid does, so unlike
// useSubmitBid it doesn't go through /approvals/submit.
export function useRejectRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      portalApi.post<{ ok: boolean; status: string }>(
        `/marketplace/requests/${requestId}/reject`,
        { reason: reason ?? null },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.marketplace })
      qc.invalidateQueries({ queryKey: QK.audit })
    },
  })
}

// ─── usePendingActions ─── portal-api /approvals/pending ─────
/**
 * Pending maker-checker actions.
 *
 * `scope` selects one half of the queue server-side:
 *   bids     — bid.* only          (Marketplace > Approvals)
 *   internal — everything but bid.* (Dual Control)
 *
 * Both screens previously fetched the whole list and filtered client-side,
 * so each polled for rows it then threw away and the split rule was
 * duplicated in two components that could drift apart. The server owns the
 * partition now; omit `scope` to get everything the caller may see.
 */
export function usePendingActions(scope?: 'bids' | 'internal') {
  return useQuery<PendingAction[]>({
    queryKey: [...QK.pendingActions, scope ?? 'all'],
    queryFn: () => portalApi.get<PendingAction[]>(
      scope ? `/approvals/pending?scope=${scope}` : '/approvals/pending',
    ),
    refetchInterval: poll60s,
    refetchOnWindowFocus: true,
  })
}

// ─── useApproveAction ─── portal-api /approvals/{id}/approve ─
export function useApproveAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actionId, note }: { actionId: string; note?: string }) =>
      portalApi.post(`/approvals/${actionId}/approve`, { note: note ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pendingActions })
      qc.invalidateQueries({ queryKey: QK.myBids })
      qc.invalidateQueries({ queryKey: QK.audit })
    },
  })
}

// ─── useRejectAction ─── portal-api /approvals/{id}/reject ───
export function useRejectAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actionId, note }: { actionId: string; note: string }) =>
      portalApi.post(`/approvals/${actionId}/reject`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pendingActions })
      qc.invalidateQueries({ queryKey: QK.audit })
    },
  })
}

// ─── useWebhooks ─── portal-api /webhooks ────────────────────
export function useWebhooks() {
  return useQuery<InstitutionWebhook[]>({
    queryKey: QK.webhooks,
    queryFn: () => portalApi.get<InstitutionWebhook[]>('/webhooks'),
  })
}

// ─── useProducts ─── portal-api /products ────────────────────
export function useProducts() {
  return useQuery<Product[]>({
    queryKey: QK.products,
    queryFn: () => portalApi.get<Product[]>('/products'),
    staleTime: 60 * 60 * 1000,
  })
}

// ─── useAuditEvents ─── portal-api /audit ────────────────────
export function useAuditEvents(limit = 50) {
  return useQuery<AuditEvent[]>({
    queryKey: [...QK.audit, limit],
    queryFn: () => portalApi.get<AuditEvent[]>(`/audit?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── useInstitutionUsers ─── portal-api /members ─────────────
export function useInstitutionUsers() {
  return useQuery<InstitutionMember[]>({
    queryKey: QK.institutionUsers,
    queryFn: () => portalApi.get<InstitutionMember[]>('/members'),
  })
}

// ─── useBenefitCategories ─── portal-api /benefits/categories ─
export function useBenefitCategories() {
  return useQuery({
    queryKey: QK.benefitCats,
    queryFn:  () => portalApi.get<BenefitCategory[]>('/benefits/categories'),
    staleTime: 24 * 60 * 60 * 1000, // reference data — 24h
  })
}

// ─── useBenefits ─── portal-api /benefits ─────────────────────
export function useBenefits() {
  return useQuery({
    queryKey: QK.benefits,
    queryFn:  () => portalApi.get<Benefit[]>('/benefits'),
    staleTime: 2 * 60 * 1000,
  })
}

// ─── useCreateBenefit ─────────────────────────────────────────
export function useCreateBenefit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<Benefit>) =>
      portalApi.post<{ pending?: boolean; id?: string }>('/benefits', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.benefits })
      qc.invalidateQueries({ queryKey: QK.pendingActions })
    },
  })
}

// ─── useUpdateBenefit ─────────────────────────────────────────
export function useUpdateBenefit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<Benefit> & { id: string }) =>
      portalApi.put<{ pending?: boolean; id?: string }>(`/benefits/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.benefits })
      qc.invalidateQueries({ queryKey: QK.pendingActions })
    },
  })
}

// ─── useDeactivateBenefit ─────────────────────────────────────
export function useDeactivateBenefit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      portalApi.delete<{ ok: boolean }>(`/benefits/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.benefits }),
  })
}

// ─── useDocTypes ─── portal-api /documents/types ──────────────
export function useDocTypes() {
  return useQuery({
    queryKey: QK.docTypes,
    queryFn:  () => portalApi.get<DocType[]>('/documents/types'),
    staleTime: 24 * 60 * 60 * 1000,
  })
}

// ─── useDocuments ─── portal-api /documents ───────────────────
export function useDocuments() {
  return useQuery({
    queryKey: QK.documents,
    queryFn:  () => portalApi.get<InstitutionDoc[]>('/documents'),
    staleTime: 60 * 1000,
  })
}

// ─── useCompliance ─── portal-api /documents/compliance ───────
export function useCompliance() {
  return useQuery({
    queryKey: QK.compliance,
    queryFn:  () => portalApi.get<ComplianceGate>('/documents/compliance'),
    staleTime: 2 * 60 * 1000,
  })
}

// ─── useRegisterDocument ─────────────────────────────────────
export function useRegisterDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      doc_type_id: string
      storage_path: string
      file_name: string
      mime_type?: string
      expiry_date?: string
    }) => portalApi.post<InstitutionDoc>('/documents', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.documents })
      qc.invalidateQueries({ queryKey: QK.compliance })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key hooks — /api-keys
// ─────────────────────────────────────────────────────────────────────────────

export const QK_KEYS     = ['api-keys']  as const
export const QK_WEBHOOKS = ['webhooks']  as const

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: QK_KEYS,
    queryFn:  () => portalApi.get<ApiKey[]>('/api-keys'),
    staleTime: 30 * 1000,
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { label: string; scopes: string[]; expires_days?: number }) =>
      portalApi.post<ApiKey>('/api-keys', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_KEYS }),
  })
}

export function useApproveApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      portalApi.put<{ status: string }>(`/api-keys/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_KEYS }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      portalApi.post<{ status: string }>(`/api-keys/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_KEYS }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      portalApi.delete<void>(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_KEYS }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook hooks — /webhooks
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      label: string; endpoint_url: string; event_types: string[]
      retry_max?: number; timeout_ms?: number
    }) => portalApi.post<InstitutionWebhook>('/webhooks', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.webhooks }),
  })
}

export function useUpdateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; active?: boolean; label?: string; event_types?: string[] }) =>
      portalApi.put<InstitutionWebhook>(`/webhooks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.webhooks }),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => portalApi.delete<void>(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.webhooks }),
  })
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) =>
      portalApi.post<{ status: string }>(`/webhooks/${id}/test`, {}),
  })
}

export function useWebhookDeliveries(webhookId: string | null) {
  return useQuery<WebhookDeliveryPage>({
    queryKey: ['webhook-deliveries', webhookId],
    queryFn:  () => portalApi.get<WebhookDeliveryPage>(`/webhooks/${webhookId}/deliveries?limit=25`),
    enabled:  !!webhookId,
    staleTime: 10 * 1000,
  })
}

export function useResetWebhookFailures() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      portalApi.post<{ status: string }>(`/webhooks/${id}/reset-failures`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.webhooks }),
  })
}
