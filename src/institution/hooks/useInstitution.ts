// =============================================================
// Ficium 3 — Institution Portal Hooks
//
// Data sources:
//   ficium-portal-api  → institution-scoped data (RLS, this project)
//   institutionSupabase → cross-project reads (marketplace requests,
//                         bids, products from the ficium app project)
//
// Hooks migrated to portal-api:
//   useMyInstitution, useMyRole, useInstitutionUsers,
//   usePendingActions, useApproveAction, useRejectAction,
//   useSubmitBid, useWebhooks, useAuditEvents
//
// Hooks kept on Supabase (cross-project or view-based reads):
//   useMarketplace, useMyBids, useProducts
// =============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import institutionSupabase from '../lib/institutionSupabase'
import { db } from '../../shared/lib/supabase'
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

// ─── useMyInstitution ─── portal-api ─────────────────────────
export function useMyInstitution() {
  return useQuery<Institution>({
    queryKey: QK.institution,
    queryFn: () => portalApi.get<Institution>('/institutions/me'),
    staleTime: 5 * 60 * 1000,
  })
}

// ─── useMyRole ─── portal-api ────────────────────────────────
export function useMyRole() {
  return useQuery<InstitutionUser>({
    queryKey: [...QK.institutionUsers, 'me'],
    queryFn: () => portalApi.get<InstitutionUser>('/members/me'),
    staleTime: 10 * 60 * 1000,
  })
}

// ─── useMarketplace ─── Supabase (cross-project) ─────────────
export function useMarketplace(productCode?: string) {
  return useQuery<MarketplaceRequest[]>({
    queryKey: [...QK.marketplace, productCode],
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('marketplace_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (error || !data?.length) {
        const pubClient = db('public')
        let pubQuery = pubClient
          .from('requests')
          .select('id, product_type, status, amount, purpose, preferred_term_months, decision_deadline, created_at, client_id')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
        if (productCode) pubQuery = pubQuery.eq('product_type', productCode)
        const { data: pubData } = await pubQuery
        return (pubData ?? []).map((r: Record<string, unknown>) => ({
          id: r.id, product_type: r.product_type, status: r.status,
          amount: r.amount, currency: 'MUR', term_months: r.preferred_term_months,
          purpose: r.purpose, financial_snapshot: undefined,
          bid_window_closes_at: r.decision_deadline ?? new Date(Date.now() + 24*60*60*1000).toISOString(),
          created_at: r.created_at,
          client_ref: String(r.client_id).slice(0, 8),
          client_type: 'individual', product_id: undefined,
          product_label: String(r.product_type).replace(/_/g, ' '),
          family_label: undefined,
          client_country: (r.client_country as string) ?? null,
          client_monthly_income: (r.client_monthly_income as number) ?? null,
          client_net_worth: (r.client_net_worth as number) ?? null,
          client_health_score: (r.client_health_score as number) ?? null,
          client_risk_score: (r.client_risk_score as number) ?? null,
          client_affordability_score: (r.client_affordability_score as number) ?? null,
          client_employment_status: (r.client_employment_status as string) ?? null,
        })) as MarketplaceRequest[]
      }

      if (productCode) return (data ?? []).filter((r: Record<string, unknown>) => r.product_type === productCode) as MarketplaceRequest[]
      return (data ?? []) as MarketplaceRequest[]
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

// ─── useMyBids ─── Supabase (cross-project view) ─────────────
export function useMyBids(status?: string) {
  return useQuery<InstitutionBid[]>({
    queryKey: [...QK.myBids, status],
    queryFn: async () => {
      let query = institutionSupabase
        .from('my_bids')
        .select('*')
        .order('submitted_at', { ascending: false })
      if (status) query = query.eq('status', status)
      const { data, error } = await query
      if (error) return []
      return (data ?? []) as InstitutionBid[]
    },
    staleTime: 30 * 1000,
  })
}

// ─── useSubmitBid ─── portal-api ─────────────────────────────
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

// ─── usePendingActions ─── portal-api ────────────────────────
export function usePendingActions() {
  return useQuery<PendingAction[]>({
    queryKey: QK.pendingActions,
    queryFn: () => portalApi.get<PendingAction[]>('/approvals/pending'),
    refetchInterval: 60 * 1000,
  })
}

// ─── useApproveAction ─── portal-api ─────────────────────────
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

// ─── useRejectAction ─── portal-api ──────────────────────────
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

// ─── useWebhooks ─── portal-api ──────────────────────────────
export function useWebhooks() {
  return useQuery<InstitutionWebhook[]>({
    queryKey: QK.webhooks,
    queryFn: () => portalApi.get<InstitutionWebhook[]>('/webhooks'),
  })
}

// ─── useProducts ─── Supabase (cross-project) ────────────────
export function useProducts() {
  return useQuery<Product[]>({
    queryKey: QK.products,
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('products')
        .select('*, product_families ( label ), product_rate_config ( * ), product_sla_defaults ( * )')
        .eq('active', true)
        .order('sort_order')
      if (error) return []
      return (data ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        family_label: (p.product_families as { label: string } | null)?.label,
        rate_config: p.product_rate_config,
        sla_defaults: p.product_sla_defaults,
      })) as Product[]
    },
    staleTime: 60 * 60 * 1000,
  })
}

// ─── useAuditEvents ─── portal-api ───────────────────────────
export function useAuditEvents(limit = 50) {
  return useQuery<AuditEvent[]>({
    queryKey: [...QK.audit, limit],
    queryFn: () => portalApi.get<AuditEvent[]>(`/audit?limit=${limit}`),
    staleTime: 30 * 1000,
  })
}

// ─── useInstitutionUsers ─── portal-api ──────────────────────
export function useInstitutionUsers() {
  return useQuery<InstitutionUser[]>({
    queryKey: QK.institutionUsers,
    queryFn: () => portalApi.get<InstitutionUser[]>('/members'),
  })
}
