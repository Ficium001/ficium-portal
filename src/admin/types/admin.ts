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
  /** Group assigned via user_groups system. */
  group_id?:            string | null
  /** Resolved from group.module_permissions — used for nav gating. */
  module_permissions?:  string[]
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
  /** Legacy — kept for backward compat during migration. */
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

// ─────────────────────────────────────────────────────────────────────────────
// Institutions
// ─────────────────────────────────────────────────────────────────────────────

export interface Institution {
  id:                    string
  name:                  string
  legal_name:            string
  institution_type:      string
  country:               string
  reg_number:            string | null
  regulator:             string | null
  deployment_model:      string
  modules:               string[]
  onboarding_stage:      string
  compliance_status:     string
  approved:              boolean
  primary_contact_name:  string
  primary_contact_email: string
  primary_contact_phone: string | null
  created_at:            string
}

export interface ApproveInstitutionPayload {
  institution_id:   string
  institution_name: string
}

export interface SuspendInstitutionPayload {
  institution_id:    string
  institution_name:  string
  suspension_reason: string
}

export const ROLE_LABELS: Record<AdminRoleSlug, string> = {
  super_admin:     'Super Admin',
  institution_mgr: 'Institution Manager',
  compliance:      'Compliance Officer',
  support:         'Support',
  auditor:         'Auditor',
  custom:          'Custom',
}

export interface AdminDoc {
  id:                 string
  institution_id:     string
  institution_name:   string
  institution_type:   string
  doc_type_code:      string
  doc_type_label:     string
  is_mandatory:       boolean
  file_name:          string
  storage_path:       string
  mime_type:          string | null
  status:             'pending' | 'approved' | 'rejected' | 'expired'
  expiry_date:        string | null
  rejection_reason:   string | null
  uploaded_at:        string
  reviewed_at:        string | null
  uploaded_by_email:  string | null
}
