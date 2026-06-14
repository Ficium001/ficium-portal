// =============================================================
// Ficium 3 — Institution Portal Hooks
// Stage 4: fully migrated to ficium-portal-api. No Supabase
// data calls remain — all reads/writes go through portalApi,
// which attaches the ficium-auth RS256 JWT and relies on
// Postgres RLS for tenant isolation.
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

// ─── useMyInstitution ─────────────────────────────────────────
export function useMyInstitution() {
  return useQuery<Institution>({
    queryKey: QK.institution,
    queryFn: () => portalApi.get<Institution>('/institutions/me'),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── useMyRole ────────────────────────────────────────────────
export function useMyRole() {
  return useQuery<InstitutionUser>({
    queryKey: [...QK.institutionUsers, 'me'],
    queryFn: () => portalApi.get<InstitutionUser>('/members/me'),
    staleTime: 10 * 60 * 1000,
  })
}

// ─── useMarketplace ───────────────────────────────────────────
export function useMarketplace(productCode?: string) {
  return useQuery<MarketplaceRequest[]>({
    queryKey: [...QK.marketplace, productCode],
    queryFn: () => {
      const qs = productCode ? `?product_type=${encodeURIComponent(productCode)}` : ''
      return portalApi.get<MarketplaceRequest[]>(`/marketplace/requests${qs}`)
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

// ─── useMyBids ────────────────────────────────────────────────
export function useMyBids(status?: string) {
  return useQuery<InstitutionBid[]>({
    queryKey: [...QK.myBids, status],
    queryFn: () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ''
      return portalApi.get<InstitutionBid[]>(`/marketplace/my-bids${qs}`)
    },
    staleTime: 30 * 1000,
  })
}

// ─── useSubmitBid ─────────────────────────────────────────────
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

// ─── usePendingActions ────────────────────────────────────────
export function usePendingActions() {
  return useQuery<PendingAction[]>({
    queryKey: QK.pendingActions,
    queryFn: () => portalApi.get<PendingAction[]>('/approvals/pending'),
    refetchInterval: 60 * 1000,
  })
}

// ─── useApproveAction ─────────────────────────────────────────
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

// ─── useRejectAction ──────────────────────────────────────────
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

// ─── useWebhooks ──────────────────────────────────────────────
export function useWebhooks() {
  return useQuery<InstitutionWebhook[]>({
    queryKey: QK.webhooks,
    queryFn: () => portalApi.get<InstitutionWebhook[]>('/webhooks'),
  })
}

// ─── useProducts ──────────────────────────────────────────────
export function useProducts() {
  return useQuery<Product[]>({
    queryKey: QK.products,
    queryFn: () => portalApi.get<Product[]>('/products'),
    staleTime: 60 * 60 * 1000,
  })
}

// ─── useAuditEvents ───────────────────────────────────────────
export function useAuditEvents(limit = 50) {
  return useQuery<AuditEvent[]>({
    queryKey: [...QK.audit, limit],
    queryFn: () => portalApi.get<AuditEvent[]>(`/audit?limit=${limit}`),
    staleTime: 30 * 1000,
  })
}

// ─── useInstitutionUsers ──────────────────────────────────────
export function useInstitutionUsers() {
  return useQuery<InstitutionUser[]>({
    queryKey: QK.institutionUsers,
    queryFn: () => portalApi.get<InstitutionUser[]>('/members'),
  })
}
