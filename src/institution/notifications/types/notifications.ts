// =============================================================
// Ficium — Institution Portal Notification Types
// Module: inst:notifications — self-contained
// =============================================================

export type PortalNotificationKind =
  | 'bid_accepted'
  | 'bid_rejected'
  | 'bid_expired'
  | 'request_closed'
  | 'pipeline_advanced'
  | 'pipeline_approved'
  | 'approval_needed'
  | 'compliance_expiring'
  | 'system'

export interface PortalNotification {
  id:         string
  kind:       PortalNotificationKind
  title:      string
  body:       string | null
  link:       string | null
  read_at:    string | null
  created_at: string
  metadata?:  Record<string, unknown> | null
}
