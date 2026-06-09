// =============================================================
// Ficium 3 — Institution Portal Hooks (V2)
// V2: institution_users → institution_members (auth_user_id not user_id)
// =============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import institutionSupabase from '../lib/institutionSupabase'
import { db } from '../../shared/lib/supabase'
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
    queryFn: async () => {
      const { data: { user } } = await institutionSupabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // V2: use institution_members (auth_user_id instead of user_id)
      const { data: membership, error: mErr } = await institutionSupabase
        .from('institution_members')
        .select('institution_id')
        .eq('auth_user_id', user.id)
        .eq('active', true)
        .single()

      if (mErr) throw mErr

      const { data, error } = await institutionSupabase
        .from('institutions')
        .select('*')
        .eq('id', membership.institution_id)
        .single()

      if (error) throw error
      return data as Institution
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── useMyRole ────────────────────────────────────────────────
export function useMyRole() {
  return useQuery<InstitutionUser>({
    queryKey: [...QK.institutionUsers, 'me'],
    queryFn: async () => {
      const { data: { user } } = await institutionSupabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // V2: institution_members with auth_user_id
      const { data, error } = await institutionSupabase
        .from('institution_members')
        .select('*')
        .eq('auth_user_id', user.id)
        .eq('active', true)
        .single()

      if (error) throw error
      return data as InstitutionUser
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ─── useMarketplace ───────────────────────────────────────────
export function useMarketplace(productCode?: string) {
  return useQuery<MarketplaceRequest[]>({
    queryKey: [...QK.marketplace, productCode],
    queryFn: async () => {
      let query = institutionSupabase
        .from('marketplace_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (productCode) query = query.eq('product_type', productCode)

      const { data, error } = await query

      if (error || !data?.length) {
        const pubClient = db("public")
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

      return (data ?? []) as MarketplaceRequest[]
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

// ─── useMyBids ────────────────────────────────────────────────
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
      if (error) throw error
      return (data ?? []) as InstitutionBid[]
    },
    staleTime: 30 * 1000,
  })
}

// ─── useSubmitBid ─────────────────────────────────────────────
export function useSubmitBid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BidPayload) => {
      const { data, error } = await institutionSupabase
        .rpc('submit_for_approval', {
          p_action_category: 'bid.submit',
          p_resource_type:   'institution_bids',
          p_resource_id:     null,
          p_payload:         payload,
        })
      if (error) throw error
      return data as string
    },
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
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('pending_actions')
        .select('*')
        .eq('action_status', 'pending')
        .order('expires_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as PendingAction[]
    },
    refetchInterval: 60 * 1000,
  })
}

// ─── useApproveAction ─────────────────────────────────────────
export function useApproveAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ actionId, note }: { actionId: string; note?: string }) => {
      const { data, error } = await institutionSupabase
        .rpc('approve_action', { p_action_id: actionId, p_note: note ?? null })
      if (error) throw error
      return data
    },
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
    mutationFn: async ({ actionId, note }: { actionId: string; note: string }) => {
      const { data, error } = await institutionSupabase
        .rpc('reject_action', { p_action_id: actionId, p_note: note })
      if (error) throw error
      return data
    },
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
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('institution_webhooks')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as InstitutionWebhook[]
    },
  })
}

// ─── useProducts ──────────────────────────────────────────────
export function useProducts() {
  return useQuery<Product[]>({
    queryKey: QK.products,
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('products')
        .select(`*, product_families ( label ), product_rate_config ( * ), product_sla_defaults ( * )`)
        .eq('active', true)
        .order('sort_order')
      if (error) throw error
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

// ─── useAuditEvents ───────────────────────────────────────────
export function useAuditEvents(limit = 50) {
  return useQuery<AuditEvent[]>({
    queryKey: [...QK.audit, limit],
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('audit_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AuditEvent[]
    },
    staleTime: 30 * 1000,
  })
}

// ─── useInstitutionUsers ──────────────────────────────────────
// V2: reads from institution_members (auth_user_id instead of user_id)
export function useInstitutionUsers() {
  return useQuery<InstitutionUser[]>({
    queryKey: QK.institutionUsers,
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from('institution_members')
        .select('*')
        .eq('active', true)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as InstitutionUser[]
    },
  })
}
