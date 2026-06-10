/**
 * @module admin/hooks/useAdmin
 * @description
 *   TanStack Query hooks for the Ficium Admin Portal.
 *   All data reads use SECURITY DEFINER RPCs in the public schema
 *   to bypass RLS — direct table queries 403 with the anon key.
 *   All mutations route through dual-control (no immediate execution).
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../shared/lib/supabase'
import adminDb from '../lib/adminSupabase'
import type {
  AdminUser, AdminRole, AdminSession, DualControlAction,
  AdminAuditEntry, SystemMetric,
  CreateAdminUserPayload, SuspendAdminUserPayload,
  ResetPasswordPayload, UnlockUserPayload, ForceLogoutPayload,
  UpdateAdminRolePayload, CreateRolePayload,
} from '../types/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Query key registry
// ─────────────────────────────────────────────────────────────────────────────

export const QK = {
  me:          ['admin', 'me']           as const,
  users:       ['admin', 'users']        as const,
  roles:       ['admin', 'roles']        as const,
  sessions:    ['admin', 'sessions']     as const,
  dualControl: ['admin', 'dual-control'] as const,
  audit:       ['admin', 'audit']        as const,
  metrics:     ['admin', 'metrics']      as const,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Call a public SECURITY DEFINER RPC and return its JSONB result. */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { console.error(`RPC ${fn} error:`, error.message); return null }
  return data as T
}

// ─────────────────────────────────────────────────────────────────────────────
// Read hooks — all use RPCs
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminMe() {
  return useQuery<AdminUser | null>({
    queryKey: QK.me,
    queryFn:  () => rpc<AdminUser>('get_admin_me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useAdminUsers(statusFilter?: string) {
  return useQuery<AdminUser[]>({
    queryKey: [...QK.users, statusFilter],
    queryFn:  async () => {
      const data = await rpc<AdminUser[]>('get_admin_users', {
        p_status: (statusFilter && statusFilter !== 'all') ? statusFilter : null,
      })
      return data ?? []
    },
    staleTime: 30 * 1000,
  })
}

export function useAdminRoles() {
  return useQuery<AdminRole[]>({
    queryKey: QK.roles,
    queryFn:  async () => (await rpc<AdminRole[]>('get_admin_roles')) ?? [],
    staleTime: 60 * 60 * 1000,
  })
}

export function useAdminSessions(activeOnly = false) {
  return useQuery<AdminSession[]>({
    queryKey: [...QK.sessions, activeOnly],
    queryFn:  async () => {
      const data = await rpc<AdminSession[]>('get_admin_sessions', { p_active_only: activeOnly })
      return data ?? []
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

export function useDualControlActions(statusFilter = 'pending') {
  return useQuery<DualControlAction[]>({
    queryKey: [...QK.dualControl, statusFilter],
    queryFn:  async () => {
      const data = await rpc<DualControlAction[]>('get_admin_dual_control', { p_status: statusFilter })
      return data ?? []
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

export function useAdminAudit(limit = 100, outcomeFilter?: string, categoryFilter?: string) {
  return useQuery<AdminAuditEntry[]>({
    queryKey: [...QK.audit, limit, outcomeFilter, categoryFilter],
    queryFn:  async () => {
      const data = await rpc<AdminAuditEntry[]>('get_admin_audit', {
        p_limit:    limit,
        p_outcome:  (outcomeFilter  && outcomeFilter  !== 'all') ? outcomeFilter  : null,
        p_category: (categoryFilter && categoryFilter !== 'all') ? categoryFilter : null,
      })
      return data ?? []
    },
    staleTime: 15 * 1000,
  })
}

export function useSystemMetrics() {
  return useQuery<SystemMetric[]>({
    queryKey: QK.metrics,
    queryFn:  async () => {
      const raw = await rpc<{
        total_admins:    number
        active_admins:   number
        locked_accounts: number
        active_sessions: number
        pending_dc:      number
        recent_audit:    { outcome: string }[] | null
      }>('get_admin_metrics')

      if (!raw) return []

      const recentAudit = raw.recent_audit ?? []
      const failCount   = recentAudit.filter(e => e.outcome === 'failed' || e.outcome === 'blocked').length
      const failRate    = recentAudit.length > 0 ? Math.round(failCount / recentAudit.length * 100) : 0
      const now         = new Date().toISOString()

      return [
        { key: 'total_admins',    label: 'Total admin users',    value: raw.total_admins,    status: 'ok',                                                          updated_at: now },
        { key: 'active_admins',   label: 'Active accounts',      value: raw.active_admins,   status: 'ok',                                                          updated_at: now },
        { key: 'locked_accounts', label: 'Locked accounts',      value: raw.locked_accounts, status: raw.locked_accounts > 0 ? 'warn' : 'ok',                       updated_at: now },
        { key: 'active_sessions', label: 'Active sessions',      value: raw.active_sessions, status: raw.active_sessions > 50 ? 'warn' : 'ok',                      updated_at: now },
        { key: 'pending_dc',      label: 'Pending dual-control', value: raw.pending_dc,      status: raw.pending_dc > 10 ? 'warn' : 'ok',                           updated_at: now },
        { key: 'audit_fail_rate', label: 'Audit failure rate',   value: `${failRate}%`,      status: failRate > 10 ? 'critical' : failRate > 5 ? 'warn' : 'ok',     updated_at: now },
      ] as SystemMetric[]
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-control mutation factory
// ─────────────────────────────────────────────────────────────────────────────

async function submitDualControl(params: {
  action_category: string
  action_label:    string
  risk:            string
  resource_type:   string
  resource_id?:    string | null
  resource_label?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload:         any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload_before?: any
}): Promise<string> {
  const { data, error } = await adminDb.rpc('admin_submit_dual_control', params)
  if (error) throw new Error(error.message)
  return data as string
}

// ─────────────────────────────────────────────────────────────────────────────
// User mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAdminUserPayload) =>
      submitDualControl({
        action_category: 'user.create',
        action_label:    `Create admin user: ${payload.email}`,
        risk:            'high',
        resource_type:   'admin_user',
        resource_label:  payload.email,
        payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.dualControl }),
  })
}

export function useSuspendAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SuspendAdminUserPayload) =>
      submitDualControl({
        action_category: 'user.suspend',
        action_label:    'Suspend admin user',
        risk:            'high',
        resource_type:   'admin_user',
        resource_id:     payload.admin_user_id,
        payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.users })
    },
  })
}

export function useUnlockAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UnlockUserPayload) =>
      submitDualControl({
        action_category: 'user.unlock',
        action_label:    'Unlock admin user',
        risk:            'medium',
        resource_type:   'admin_user',
        resource_id:     payload.admin_user_id,
        payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.users })
    },
  })
}

export function useResetAdminPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) =>
      submitDualControl({
        action_category: 'user.reset_password',
        action_label:    'Force password reset',
        risk:            'high',
        resource_type:   'admin_user',
        resource_id:     payload.admin_user_id,
        payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.dualControl }),
  })
}

export function useForceLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ForceLogoutPayload) =>
      submitDualControl({
        action_category: 'user.force_logout',
        action_label:    'Force logout all sessions',
        risk:            'medium',
        resource_type:   'admin_session',
        resource_id:     payload.admin_user_id,
        payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.sessions })
    },
  })
}

export function useChangeAdminRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateAdminRolePayload) =>
      submitDualControl({
        action_category: 'user.role_change',
        action_label:    `Change role to ${payload.new_role_slug}`,
        risk:            'critical',
        resource_type:   'admin_user',
        resource_id:     payload.admin_user_id,
        payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.users })
    },
  })
}

export function useDeactivateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { admin_user_id: string; reason: string }) =>
      submitDualControl({
        action_category: 'user.deactivate',
        action_label:    'Permanently deactivate admin user',
        risk:            'critical',
        resource_type:   'admin_user',
        resource_id:     payload.admin_user_id,
        payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.users })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Role mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateAdminRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateRolePayload) =>
      submitDualControl({
        action_category: 'role.create',
        action_label:    `Create role: ${payload.label}`,
        risk:            'high',
        resource_type:   'admin_role',
        resource_label:  payload.label,
        payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.roles })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-control approve / reject
// ─────────────────────────────────────────────────────────────────────────────

export function useApproveDualControl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ actionId, note }: { actionId: string; note?: string }) => {
      const { data, error } = await adminDb.rpc('admin_approve_dual_control', {
        p_action_id: actionId,
        p_note:      note ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.users })
      qc.invalidateQueries({ queryKey: QK.audit })
      qc.invalidateQueries({ queryKey: QK.metrics })
    },
  })
}

export function useRejectDualControl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ actionId, note }: { actionId: string; note: string }) => {
      const { data, error } = await adminDb.rpc('admin_reject_dual_control', {
        p_action_id: actionId,
        p_note:      note,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.dualControl })
      qc.invalidateQueries({ queryKey: QK.audit })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Session termination
// ─────────────────────────────────────────────────────────────────────────────

export function useTerminateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, reason }: { sessionId: string; reason: string }) => {
      const { error } = await adminDb
        .from('admin_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString(), end_reason: 'forced' })
        .eq('id', sessionId)
      if (error) throw new Error(error.message)
      await adminDb.from('admin_audit_log').insert({
        action_category: 'session.terminate',
        event_label:     'Session forcibly terminated',
        resource_type:   'admin_session',
        resource_id:     sessionId,
        outcome:         'success',
        outcome_note:    reason,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.sessions }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminGroups() {
  return useQuery({
    queryKey: ['admin', 'groups'],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_user_groups')
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

export function useMyGroup() {
  return useQuery({
    queryKey: ['admin', 'my-group'],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_my_group')
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000,
  })
}

export function useCreateAdminGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: import('../../shared/lib/groups').CreateGroupPayload) =>
      submitDualControl({
        action_category: 'group.create',
        action_label:    `Create group: ${payload.label}`,
        risk:            'high',
        resource_type:   'user_group',
        resource_label:  payload.label,
        payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'groups'] }),
  })
}

export function useUpdateGroupModules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: import('../../shared/lib/groups').UpdateGroupModulesPayload) =>
      submitDualControl({
        action_category: 'group.update_modules',
        action_label:    `Update module access for group`,
        risk:            'high',
        resource_type:   'user_group',
        resource_id:     payload.group_id,
        payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'groups'] }),
  })
}
