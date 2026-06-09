/**
 * @module admin/hooks/useAdmin
 * @description
 *   TanStack Query hooks for every admin portal data surface.
 *   All mutations that represent material actions return a
 *   dual_control_action ID — they do NOT execute immediately.
 *
 *   Query key registry (QK) is the single source of truth for
 *   cache invalidation. Mutations invalidate the correct keys.
 *
 * @schema portal_admin
 * @owner  Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminDb } from '../lib/adminSupabase'
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
  me:          ['admin', 'me']          as const,
  users:       ['admin', 'users']       as const,
  roles:       ['admin', 'roles']       as const,
  sessions:    ['admin', 'sessions']    as const,
  dualControl: ['admin', 'dual-control'] as const,
  audit:       ['admin', 'audit']       as const,
  metrics:     ['admin', 'metrics']     as const,
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdminMe — current admin user identity
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminMe() {
  return useQuery<AdminUser | null>({
    queryKey: QK.me,
    queryFn: async () => {
      const { data: { user } } = await adminDb.auth.getUser()
      if (!user) return null
      const { data, error } = await adminDb
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .single()
      if (error) return null
      return data as AdminUser
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdminUsers — full user list
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminUsers(statusFilter?: string) {
  return useQuery<AdminUser[]>({
    queryKey: [...QK.users, statusFilter],
    queryFn: async () => {
      let q = adminDb
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false })
      if (statusFilter && statusFilter !== 'all') {
        q = q.eq('status', statusFilter)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AdminUser[]
    },
    staleTime: 30 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdminRoles
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminRoles() {
  return useQuery<AdminRole[]>({
    queryKey: QK.roles,
    queryFn: async () => {
      const { data, error } = await adminDb
        .from('admin_roles')
        .select('*')
        .order('is_system', { ascending: false })
      if (error) throw error
      return (data ?? []) as AdminRole[]
    },
    staleTime: 60 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdminSessions
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminSessions(activeOnly = false) {
  return useQuery<AdminSession[]>({
    queryKey: [...QK.sessions, activeOnly],
    queryFn: async () => {
      let q = adminDb
        .from('admin_sessions')
        .select('*')
        .order('last_active_at', { ascending: false })
        .limit(200)
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AdminSession[]
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// useDualControlActions
// ─────────────────────────────────────────────────────────────────────────────

export function useDualControlActions(statusFilter = 'pending') {
  return useQuery<DualControlAction[]>({
    queryKey: [...QK.dualControl, statusFilter],
    queryFn: async () => {
      let q = adminDb
        .from('admin_dual_control_actions')
        .select('*')
        .order('initiated_at', { ascending: false })
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as DualControlAction[]
    },
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdminAudit
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminAudit(limit = 100, outcomeFilter?: string, categoryFilter?: string) {
  return useQuery<AdminAuditEntry[]>({
    queryKey: [...QK.audit, limit, outcomeFilter, categoryFilter],
    queryFn: async () => {
      let q = adminDb
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (outcomeFilter && outcomeFilter !== 'all') q = q.eq('outcome', outcomeFilter)
      if (categoryFilter && categoryFilter !== 'all') q = q.ilike('action_category', `${categoryFilter}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AdminAuditEntry[]
    },
    staleTime: 15 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// useSystemMetrics
// ─────────────────────────────────────────────────────────────────────────────

export function useSystemMetrics() {
  return useQuery<SystemMetric[]>({
    queryKey: QK.metrics,
    queryFn: async () => {
      // Pull from multiple sources and normalise into metric objects
      const [usersRes, sessionsRes, pendingRes, auditRes] = await Promise.all([
        adminDb.from('admin_users').select('status', { count: 'exact', head: false }),
        adminDb.from('admin_sessions').select('is_active', { count: 'exact', head: false }).eq('is_active', true),
        adminDb.from('admin_dual_control_actions').select('status', { count: 'exact', head: false }).eq('status', 'pending'),
        adminDb.from('admin_audit_log').select('outcome').order('created_at', { ascending: false }).limit(100),
      ])

      const users    = (usersRes.data ?? []) as { status: string }[]
      const sessions = sessionsRes.data ?? []
      const pending  = pendingRes.data ?? []
      const recentAudit = (auditRes.data ?? []) as { outcome: string }[]

      const activeUsers  = users.filter(u => u.status === 'active').length
      const lockedUsers  = users.filter(u => u.status === 'locked').length
      const failRate     = recentAudit.length > 0
        ? Math.round(recentAudit.filter(e => e.outcome === 'failed' || e.outcome === 'blocked').length / recentAudit.length * 100)
        : 0

      const now = new Date().toISOString()
      return [
        { key: 'total_admins',    label: 'Total admin users',     value: users.length,     status: 'ok',                                          updated_at: now },
        { key: 'active_admins',   label: 'Active accounts',       value: activeUsers,      status: 'ok',                                          updated_at: now },
        { key: 'locked_accounts', label: 'Locked accounts',       value: lockedUsers,      status: lockedUsers > 0 ? 'warn' : 'ok',               updated_at: now },
        { key: 'active_sessions', label: 'Active sessions',       value: sessions.length,  status: sessions.length > 50 ? 'warn' : 'ok',          updated_at: now },
        { key: 'pending_dc',      label: 'Pending dual-control',  value: pending.length,   status: pending.length > 10 ? 'warn' : 'ok',           updated_at: now },
        { key: 'audit_fail_rate', label: 'Audit failure rate',    value: `${failRate}%`,   status: failRate > 10 ? 'critical' : failRate > 5 ? 'warn' : 'ok', updated_at: now },
      ] as SystemMetric[]
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-control mutation factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits any action to the dual_control queue.
 * Returns the dual_control_action ID — never executes immediately.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function submitDualControl(params: {
  action_category: string
  action_label:    string
  risk:            string
  resource_type:   string
  resource_id?:    string | null
  resource_label?: string | null
  payload:         any
  payload_before?: any
}): Promise<string> {
  const { data, error } = await adminDb.rpc('admin_submit_dual_control', params)
  if (error) throw new Error(error.message)
  return data as string
}

// ─────────────────────────────────────────────────────────────────────────────
// User mutations — all go through dual control
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
        action_label:    `Suspend admin user`,
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
        action_label:    `Unlock admin user`,
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
        action_label:    `Force password reset`,
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
        action_label:    `Force logout all sessions`,
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
        action_label:    `Permanently deactivate admin user`,
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
// Dual-control approval / rejection
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
// Session termination (direct — no dual control for own sessions)
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
      // Log to audit
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
