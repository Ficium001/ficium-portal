// =============================================================
// Ficium Portal — Approval Engine + E-Signature hooks
// Backend: ficium-portal-api /approval-engine/*, /esign/*
//
// Kept in a separate file/QK namespace from useInstitution.ts to avoid
// touching the existing maker-checker hooks (usePendingActions etc.) —
// the two systems coexist; this module is additive.
// =============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import type {
  Committee, CommitteeMember, ApprovalTemplate, DoaRule, DoaConditions,
  ApprovalInboxItem, ApprovalInstanceDetail, SimulateResult, EntityType,
  VoteAction, EsignEnvelope, EsignEventTrail, Delegation,
} from '@/institution/types/approvalEngine'
import { poll30s } from '@/shared/lib/polling'

export const AEQK = {
  committees: ['approval-engine', 'committees'] as const,
  templates:  ['approval-engine', 'templates'] as const,
  doaRules:   (et: string) => ['approval-engine', 'doa-rules', et] as const,
  inbox:      ['approval-engine', 'inbox'] as const,
  instance:   (id: string) => ['approval-engine', 'instance', id] as const,
  analytics:  ['approval-engine', 'analytics'] as const,
  envelopes:  ['esign', 'envelopes'] as const,
  delegations: ['approval-engine', 'delegations'] as const,
} as const

// ─── Committees ───────────────────────────────────────────────

export function useApprovalCommittees() {
  return useQuery<Committee[]>({
    queryKey: AEQK.committees,
    queryFn: () => portalApi.get<Committee[]>('/approval-engine/committees'),
  })
}

export function useCreateCommittee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string; description?: string | null
      quorum_type: Committee['quorum_type']; quorum_value: number | null
      tie_break: Committee['tie_break']; allow_abstain: boolean
    }) => portalApi.post<{ id: string }>('/approval-engine/committees', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.committees }),
  })
}

export function useAddCommitteeMember(committeeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Pick<CommitteeMember, 'member_id' | 'role' | 'is_voting' | 'valid_from'>) =>
      portalApi.post<{ id: string }>(`/approval-engine/committees/${committeeId}/members`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.committees }),
  })
}

export function useEndCommitteeMembership(committeeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberRowId: string) =>
      portalApi.delete(`/approval-engine/committees/${committeeId}/members/${memberRowId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.committees }),
  })
}

// ─── Delegations ───────────────────────────────────────────────

export function useDelegations() {
  return useQuery<Delegation[]>({
    queryKey: AEQK.delegations,
    queryFn: () => portalApi.get<Delegation[]>('/approval-engine/delegations'),
  })
}

export function useCreateDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      from_member: string; to_member: string; scope?: string
      reason: string; valid_from: string; valid_to: string
    }) => portalApi.post<{ id: string }>('/approval-engine/delegations', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.delegations }),
  })
}

export function useRevokeDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (delegationId: string) =>
      portalApi.delete(`/approval-engine/delegations/${delegationId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.delegations }),
  })
}

// ─── Templates ────────────────────────────────────────────────

export function useApprovalTemplates() {
  return useQuery<ApprovalTemplate[]>({
    queryKey: AEQK.templates,
    queryFn: () => portalApi.get<ApprovalTemplate[]>('/approval-engine/templates'),
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; entity_type: EntityType; stages: ApprovalTemplate['stages'] }) =>
      portalApi.post<{ id: string }>('/approval-engine/templates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.templates }),
  })
}

export function useActivateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) =>
      portalApi.post<{ status: string }>(`/approval-engine/templates/${templateId}/activate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.templates }),
  })
}

// ─── DoA routing + simulator ──────────────────────────────────

export function useDoaRules(entityType: EntityType) {
  return useQuery<DoaRule[]>({
    queryKey: AEQK.doaRules(entityType),
    queryFn: () => portalApi.get<DoaRule[]>(`/approval-engine/doa-rules?entity_type=${entityType}`),
  })
}

export function useCreateDoaRule(entityType: EntityType) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { priority: number; conditions: DoaConditions; template_id: string }) =>
      portalApi.post<{ id: string }>('/approval-engine/doa-rules', { entity_type: entityType, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.doaRules(entityType) }),
  })
}

export function useSimulateRouting() {
  return useMutation({
    mutationFn: (body: {
      entity_type: EntityType; amount?: number; risk_tier?: string
      product_type?: string; secured?: boolean; tenor_months?: number
    }) => portalApi.post<SimulateResult>('/approval-engine/doa-rules/simulate', body),
  })
}

// ─── Runtime: inbox, instance, cast, withdraw ─────────────────

export function useApprovalInbox() {
  return useQuery<ApprovalInboxItem[]>({
    queryKey: AEQK.inbox,
    queryFn: () => portalApi.get<ApprovalInboxItem[]>('/approval-engine/inbox'),
    refetchInterval: poll30s, // keep SLA countdowns honest (backs off when tab hidden)
    refetchOnWindowFocus: true,
  })
}

export function useApprovalInstance(instanceId: string) {
  return useQuery<ApprovalInstanceDetail>({
    queryKey: AEQK.instance(instanceId),
    queryFn: () => portalApi.get<ApprovalInstanceDetail>(`/approval-engine/instances/${instanceId}`),
    enabled: !!instanceId,
  })
}

export function useCastApprovalVote(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      stage_instance_id: string; action: VoteAction
      comment?: string; checklist_state?: Record<string, boolean>
    }) => portalApi.post<{ stage_status: string }>(`/approval-engine/instances/${instanceId}/actions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AEQK.inbox })
      qc.invalidateQueries({ queryKey: AEQK.instance(instanceId) })
      qc.invalidateQueries({ queryKey: AEQK.analytics })
    },
  })
}

export function useWithdrawApproval(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) =>
      portalApi.post<{ ok: boolean }>(`/approval-engine/instances/${instanceId}/withdraw`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AEQK.inbox })
      qc.invalidateQueries({ queryKey: AEQK.instance(instanceId) })
    },
  })
}

export function useApprovalAnalytics() {
  return useQuery({
    queryKey: AEQK.analytics,
    queryFn: () => portalApi.get<{
      stage_cycle_times: { template: string; stage: string; median_hours: number; sla_breaches: number; total: number }[]
      lost_in_committee: { deals_lost: number; amount_lost: number }
    }>('/approval-engine/analytics'),
  })
}

// ─── E-signature (institution side) ───────────────────────────

export function useEsignEnvelopes() {
  return useQuery<EsignEnvelope[]>({
    queryKey: AEQK.envelopes,
    queryFn: () => portalApi.get<EsignEnvelope[]>('/esign/envelopes'),
    refetchInterval: poll30s,
    refetchOnWindowFocus: true,
  })
}

export function useCreateEnvelope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      entity_type: 'offer_letter' | 'investment_mandate' | 'custom'
      entity_id: string; approval_instance_id?: string; title: string
      document_path: string; expires_hours?: number
      borrower_name: string; borrower_email: string; borrower_ref?: string
      countersigner_name: string; countersigner_email: string; countersigner_ref: string
    }) => portalApi.post<{ envelope_id: string }>('/esign/envelopes', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AEQK.envelopes }),
  })
}

export function useEnvelopeEvents(envelopeId: string) {
  return useQuery<EsignEventTrail>({
    queryKey: ['esign', 'events', envelopeId],
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
