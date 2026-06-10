/**
 * @module shared/lib/groups
 * @description
 *   TypeScript types and helpers for the user_groups system.
 *   Groups live in portal_admin schema and are managed by Ficium admins.
 *   Both admin and institution users are assigned a group_id.
 *
 * @owner Ficium Engineering
 */

export type UserType = 'admin' | 'institution'

export interface UserGroup {
  id:                 string
  slug:               string
  label:              string
  description:        string
  user_type:          UserType
  module_permissions: string[]   // keys from MODULE_CATALOGUE, or ['*']
  is_system:          boolean
  member_count?:      number
  created_by:         string
  created_at:         string
  updated_at:         string
}

export interface GroupMember {
  id:           string
  auth_user_id: string
  email:        string
  display_name: string
  group_id:     string
  group_label?: string
  status:       string
  created_at:   string
}

// ─── Payloads ─────────────────────────────────────────────────

export interface CreateGroupPayload {
  slug:               string
  label:              string
  description:        string
  user_type:          UserType
  module_permissions: string[]
}

export interface UpdateGroupModulesPayload {
  group_id:           string
  module_permissions: string[]
  reason:             string
}

export interface AssignGroupPayload {
  user_id:   string
  group_id:  string
  reason:    string
}

/** Expand ['*'] into the full key list for display. */
export function resolvePermissions(
  permissions: string[],
  allKeys: string[],
): string[] {
  return permissions.includes('*') ? allKeys : permissions
}
