/**
 * Autobid hooks over ficium-portal-api /v1/autobid.
 * A bank without the AUTOBID licence gets 403 on every call; useAutobidOverview
 * turns that into { licensed: false } so the page can say so plainly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portalApi, PortalApiError } from '@/shared/lib/portalApi'
import type {
  AutobidOverview, ConfigChangeHistory, ConfigFields, EngineTestResult, Execution, PreviewResult,
  Predicate, RuleAction, RuleDetail, RuleInput, RuleSummary, Summary,
} from '../types'

const BASE = '/v1/autobid'
export const ABQK = {
  all:       ['autobid'] as const,
  overview:  ['autobid', 'overview'] as const,
  rules:     ['autobid', 'rules'] as const,
  rule:      (id: string) => ['autobid', 'rule', id] as const,
  runs:      (outcome: string) => ['autobid', 'executions', outcome] as const,
  summary:   ['autobid', 'summary'] as const,
  changes:   ['autobid', 'changes'] as const,
}

export type OverviewState =
  | { licensed: true; data: AutobidOverview }
  | { licensed: false; reason: string }

export function useAutobidOverview(enabled = true) {
  return useQuery<OverviewState>({
    queryKey: ABQK.overview,
    enabled,
    queryFn: async () => {
      try {
        return { licensed: true, data: await portalApi.get<AutobidOverview>(`${BASE}/config`) }
      } catch (e) {
        if (e instanceof PortalApiError && e.status === 403) return { licensed: false, reason: e.message }
        throw e
      }
    },
    staleTime: 30_000,
  })
}

export function useRules(enabled = true) {
  return useQuery<RuleSummary[]>({
    queryKey: ABQK.rules, enabled, queryFn: () => portalApi.get<RuleSummary[]>(`${BASE}/rules`), staleTime: 15_000,
  })
}

export function useRule(id: string | null) {
  return useQuery<RuleDetail>({
    queryKey: ABQK.rule(id ?? ''), enabled: !!id,
    queryFn: () => portalApi.get<RuleDetail>(`${BASE}/rules/${id}`),
  })
}

export function useExecutions(outcome: string, enabled = true) {
  return useQuery<Execution[]>({
    queryKey: ABQK.runs(outcome), enabled,
    queryFn: () => portalApi.get<Execution[]>(
      `${BASE}/executions?limit=200${outcome === 'all' ? '' : `&outcome=${encodeURIComponent(outcome)}`}`),
    refetchInterval: 60_000,
  })
}

export function useSummary(enabled = true) {
  return useQuery<Summary>({
    queryKey: ABQK.summary, enabled, queryFn: () => portalApi.get<Summary>(`${BASE}/summary`),
    refetchInterval: 60_000,
  })
}

export function useConfigHistory(enabled = true) {
  return useQuery<ConfigChangeHistory[]>({
    queryKey: ABQK.changes, enabled, queryFn: () => portalApi.get<ConfigChangeHistory[]>(`${BASE}/config/changes`),
  })
}

/** Pending approvals for the Inbox badge: rules waiting + a setting change I can approve. */
export function useAutobidPendingCount(enabled: boolean): number {
  const overview = useAutobidOverview(enabled)
  const rules = useRules(enabled && overview.data?.licensed === true)
  if (!enabled || overview.data?.licensed !== true) return 0
  const o = overview.data.data
  if (!o.me.may_approve) return 0
  const ruleCount = (rules.data ?? []).filter((r) => r.status === 'pending_approval' && !r.mine).length
  return ruleCount + (o.pending_change?.can_approve ? 1 : 0)
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ABQK.all })
}

export function useCreateRule() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: RuleInput) => portalApi.post<{ id: string }>(`${BASE}/rules`, body),
    onSuccess: inv,
  })
}

export function useNewVersion(ruleId: string) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: { predicate: Predicate; action: RuleAction; guardrails: RuleInput['guardrails'] }) =>
      portalApi.post(`${BASE}/rules/${ruleId}/versions`, body),
    onSuccess: inv,
  })
}

export type RuleStep = 'submit' | 'approve' | 'pause' | 'resume' | 'retire'

export function useRuleStep() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, step }: { id: string; step: RuleStep }) => portalApi.post(`${BASE}/rules/${id}/${step}`, {}),
    onSuccess: inv,
  })
}

export function useRejectRule() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => portalApi.post(`${BASE}/rules/${id}/reject`, { note }),
    onSuccess: inv,
  })
}

export function usePreview() {
  return useMutation({
    mutationFn: (body: { predicate: Predicate; action: RuleAction; days?: number }) =>
      portalApi.post<PreviewResult>(`${BASE}/rules/preview`, body),
  })
}

export function useProposeConfig() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (body: { proposed: Partial<ConfigFields>; reason: string }) =>
      portalApi.post(`${BASE}/config/changes`, body),
    onSuccess: inv,
  })
}

export function useDecideConfig() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject' | 'cancel'; note?: string }) =>
      portalApi.post<{ status: string; engine_signing_secret?: string; warning?: string }>(
        `${BASE}/config/changes/${id}/${decision}`, decision === 'reject' ? { note } : {}),
    onSuccess: inv,
  })
}

export function usePauseBank() {
  const inv = useInvalidate()
  return useMutation({ mutationFn: () => portalApi.post(`${BASE}/config/pause`, {}), onSuccess: inv })
}

export function useRotateSecret() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: () => portalApi.post<{ engine_signing_secret: string; warning: string }>(
      `${BASE}/config/engine/secret`, {}),
    onSuccess: inv,
  })
}

export function useTestEngine() {
  return useMutation({ mutationFn: () => portalApi.post<EngineTestResult>(`${BASE}/config/engine/test`, {}) })
}
