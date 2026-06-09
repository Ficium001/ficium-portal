/**
 * @module admin/types
 * @description
 *   Complete TypeScript type definitions for the Ficium Admin Portal.
 *   All types mirror the portal_admin Postgres schema exactly.
 *   Never scatter types — extend here only.
 *
 * @schema portal_admin
 * @owner  Ficium Engineering
 * @lastReviewed 2025-08
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export type AdminRoleSlug =
  | 'super_admin'
  | 'institution_mgr'
  | 'compliance'
  | 'support'
  | 'auditor'
  | 'custom'

export type AdminUserStatus =
  | 'active'
  | 'locked'
  | 'suspended'
  | 'pending_mfa'
  | 'deactivated'

export type DualControlStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'executed'

export type ActionRisk = 'low' | 'medium' | 'high' | 'critical'

export type AuditOutcome =
  | 'success'
  | 'rejected'
  | 'failed'
  | 'blocked'
  | 'expired'
  | 'logged'

// ─────────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id:                   string
  auth_user_id:         string
  email:                string
  display_name:         string
  role_slug:            AdminRoleSlug
  custom_role_id?:      string | null
  status:               AdminUserStatus
  mfa_enabled:          boolean
  mfa_verified_at?:     string | null
  last_login_at?:       string | null
  last_login_ip?:       string | null
  failed_login_count:   number
  locked_at?:           string | null
  locked_reason?:       string | null
  suspended_at?:        string | null
  suspended_by?:        string | null
  suspension_reason?:   string | null
  password_changed_at?: string | null
  force_password_reset: boolean
  created_by:           string
  created_at:           string
  updated_at:           string
  role_label?:          string
  permissions?:         string[]
}

export interface AdminRole {
  id:          string
  slug:        string
  label:       string
  description: string
  permissions: string[]
  is_system:   boolean
  created_by:  string
  created_at:  string
  updated_at:  string
}

export interface AdminPermission {
  key:         string
  label:       string
  description: string
  category:    string
  risk:        ActionRisk
}

export interface AdminSession {
  id:             string
  admin_user_id:  string
  ip_address:     string
  user_agent:     string
  country?:       string | null
  city?:          string | null
  started_at:     string
  last_active_at: string
  ended_at?:      string | null
  end_reason?:    'logout' | 'timeout' | 'forced' | 'expired' | null
  is_active:      boolean
  admin_email?:   string
  admin_name?:    string
  admin_role?:    string
}

export interface DualControlAction {
  id:               string
  action_category:  string
  action_label:     string
  risk:             ActionRisk
  maker_id:         string
  maker_email:      string
  maker_role:       string
  maker_ip:         string
  resource_type:    string
  resource_id?:     string | null
  resource_label?:  string | null
  payload:          Record<string, unknown>
  payload_before?:  Record<string, unknown> | null
  status:           DualControlStatus
  checker_id?:      string | null
  checker_email?:   string | null
  checker_role?:    string | null
  checker_note?:    string | null
  checker_ip?:      string | null
  checked_at?:      string | null
  initiated_at:     string
  expires_at:       string
  executed_at?:     string | null
  execution_error?: string | null
}

export interface AdminAuditEntry {
  id:               string
  session_id?:      string | null
  actor_id?:        string | null
  actor_email?:     string | null
  actor_role?:      string | null
  actor_ip?:        string | null
  action_category:  string
  event_label:      string
  resource_type?:   string | null
  resource_id?:     string | null
  resource_label?:  string | null
  dual_control_id?: string | null
  state_before?:    Record<string, unknown> | null
  state_after?:     Record<string, unknown> | null
  outcome:          AuditOutcome
  outcome_note?:    string | null
  created_at:       string
}

export interface SystemMetric {
  key:        string
  label:      string
  value:      string | number
  unit?:      string
  status:     'ok' | 'warn' | 'critical'
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Payloads for dual-control actions
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateAdminUserPayload {
  email:           string
  display_name:    string
  role_slug:       AdminRoleSlug
  custom_role_id?: string
}

export interface UpdateAdminRolePayload {
  admin_user_id: string
  new_role_slug: AdminRoleSlug
  reason:        string
}

export interface SuspendAdminUserPayload {
  admin_user_id:     string
  suspension_reason: string
}

export interface ResetPasswordPayload {
  admin_user_id: string
  reason:        string
}

export interface UnlockUserPayload {
  admin_user_id: string
  note:          string
}

export interface ForceLogoutPayload {
  admin_user_id: string
  session_ids:   string[]
  reason:        string
}

export interface CreateRolePayload {
  slug:        string
  label:       string
  description: string
  permissions: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

export type AdminSection =
  | 'dashboard'
  | 'users'
  | 'roles'
  | 'dual-control'
  | 'sessions'
  | 'audit'
  | 'system'

// ─────────────────────────────────────────────────────────────────────────────
// Permission catalogue (static — mirrors DB seed data)
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_CATALOGUE: AdminPermission[] = [
  { key: 'users:view',              label: 'View admin users',              description: 'List and inspect admin user accounts',           category: 'users',        risk: 'low'      },
  { key: 'users:create',            label: 'Create admin users',            description: 'Invite new admin users (dual-control)',          category: 'users',        risk: 'high'     },
  { key: 'users:suspend',           label: 'Suspend admin users',           description: 'Suspend user accounts (dual-control)',           category: 'users',        risk: 'high'     },
  { key: 'users:unlock',            label: 'Unlock admin users',            description: 'Unlock locked accounts (dual-control)',          category: 'users',        risk: 'medium'   },
  { key: 'users:reset_password',    label: 'Reset admin passwords',         description: 'Trigger forced password reset (dual-control)',   category: 'users',        risk: 'high'     },
  { key: 'users:force_logout',      label: 'Force session logout',          description: 'Terminate active sessions (dual-control)',       category: 'users',        risk: 'medium'   },
  { key: 'users:role_change',       label: 'Change user roles',             description: 'Reassign roles (dual-control)',                  category: 'users',        risk: 'critical' },
  { key: 'users:deactivate',        label: 'Deactivate admin users',        description: 'Permanently deactivate accounts',               category: 'users',        risk: 'critical' },
  { key: 'roles:view',              label: 'View roles',                    description: 'List role definitions and permissions',          category: 'roles',        risk: 'low'      },
  { key: 'roles:create',            label: 'Create custom roles',           description: 'Define new roles with permission sets',          category: 'roles',        risk: 'high'     },
  { key: 'roles:edit',              label: 'Edit custom roles',             description: 'Modify non-system role permissions',             category: 'roles',        risk: 'high'     },
  { key: 'roles:delete',            label: 'Delete custom roles',           description: 'Remove unused custom roles',                    category: 'roles',        risk: 'high'     },
  { key: 'institutions:view',       label: 'View institutions',             description: 'List and inspect institution records',           category: 'institutions', risk: 'low'      },
  { key: 'institutions:approve',    label: 'Approve institutions',          description: 'Approve pending institution applications',       category: 'institutions', risk: 'high'     },
  { key: 'institutions:suspend',    label: 'Suspend institutions',          description: 'Suspend live institution access',                category: 'institutions', risk: 'critical' },
  { key: 'institutions:modules',    label: 'Manage modules',               description: 'Enable/disable institution feature modules',     category: 'institutions', risk: 'high'     },
  { key: 'audit:view',              label: 'View admin audit log',          description: 'Read-only access to admin audit trail',          category: 'audit',        risk: 'low'      },
  { key: 'audit:export',            label: 'Export audit log',              description: 'Download audit log as CSV',                     category: 'audit',        risk: 'medium'   },
  { key: 'sessions:view',           label: 'View active sessions',          description: 'List all active admin sessions',                 category: 'sessions',     risk: 'low'      },
  { key: 'sessions:terminate',      label: 'Terminate sessions',            description: 'Force-logout any admin session',                 category: 'sessions',     risk: 'high'     },
  { key: 'system:view',             label: 'View system health',            description: 'Read infrastructure and health metrics',         category: 'system',       risk: 'low'      },
  { key: 'system:config',           label: 'Edit system config',            description: 'Change platform-level settings',                 category: 'system',       risk: 'critical' },
  { key: 'dual_control:approve',    label: 'Approve dual-control actions',  description: 'Act as checker on pending actions',              category: 'dual_control', risk: 'high'     },
  { key: 'dual_control:view',       label: 'View dual-control queue',       description: 'Read all pending and historical actions',        category: 'dual_control', risk: 'low'      },
]

export const ROLE_PERMISSIONS: Record<AdminRoleSlug, string[]> = {
  super_admin:     PERMISSION_CATALOGUE.map(p => p.key),
  institution_mgr: ['institutions:view','institutions:approve','institutions:suspend','institutions:modules','audit:view','dual_control:approve','dual_control:view'],
  compliance:      ['institutions:view','audit:view','audit:export','dual_control:view','sessions:view'],
  support:         ['users:view','users:unlock','users:reset_password','users:force_logout','institutions:view','audit:view','dual_control:view'],
  auditor:         ['audit:view','audit:export','dual_control:view','sessions:view'],
  custom:          [],
}

export const ROLE_LABELS: Record<AdminRoleSlug, string> = {
  super_admin:     'Super Admin',
  institution_mgr: 'Institution Manager',
  compliance:      'Compliance Officer',
  support:         'Support',
  auditor:         'Auditor',
  custom:          'Custom',
}
