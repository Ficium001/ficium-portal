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
import { portalApi } from '../../shared/lib/portalApi'
import type {
  Institution, InstitutionUser, InstitutionBid,
  MarketplaceRequest, PendingAction, InstitutionWebhook,
  Product, AuditEvent, BidPayload,
} from '../types/institution'

export const QK = {
  institution:      ['institution'] as const,
  institutionUsers: ['institution', 'users'] as const,
  marketplace:      ['marketplace'] as const,
  myBids:           ['my-bids'] as const,
  pendingActions:   ['pending-actions'] as const,
  webhooks:         ['webhooks'] as const,
  products:         ['products'] as const,
  audit:            ['audit'] as const,
} as const

// ─── useMyInstitution ─── portal-api /institutions/me ────────
export function useMyInstitution() {
  return useQuery<Institution>({
    queryKey: QK.institution,
    queryFn: () => portalApi.get<Institution>('/institutions/me'),
    staleTime: 5 * 60 * 1000,
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
        ? 
        : '/marketplace/requests'
      return portalApi.get<MarketplaceRequest[]>(path)
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

// ─── useMyBids ─── portal-api /marketplace/my-bids ───────────
export function useMyBids(status?: string) {
  return useQuery<InstitutionBid[]>({
    queryKey: [...QK.myBids, status],
    queryFn: () => {
      const path = status
        ? 
        : '/marketplace/my-bids'
      return portalApi.get<InstitutionBid[]>(path)
    },
    staleTime: 30 * 1000,
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

// ─── usePendingActions ─── portal-api /approvals/pending ─────
export function usePendingActions() {
  return useQuery<PendingAction[]>({
    queryKey: QK.pendingActions,
    queryFn: () => portalApi.get<PendingAction[]>('/approvals/pending'),
    refetchInterval: 60 * 1000,
  })
}

// ─── useApproveAction ─── portal-api /approvals/{id}/approve ─
export function useApproveAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actionId, note }: { actionId: string; note?: string }) =>
      portalApi.post(, { note: note ?? null }),
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
      portalApi.post(, { note }),
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
    queryFn: () => portalApi.get<AuditEvent[]>(),
    staleTime: 30 * 1000,
  })
}

// ─── useInstitutionUsers ─── portal-api /members ─────────────
export function useInstitutionUsers() {
  return useQuery<InstitutionUser[]>({
    queryKey: QK.institutionUsers,
    queryFn: () => portalApi.get<InstitutionUser[]>('/members'),
  })
}
