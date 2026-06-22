// =============================================================
// Ficium 3 — Institution Portal Types
// All institution-schema types in one place.
// Extend here as new features are added — never scatter types.
// =============================================================

// ─── Enums (mirrors institution schema text fields) ───────────
export type DeploymentModel = 'saas' | 'paas' | 'on_prem'
export type OnboardingStage =
  | 'registered'
  | 'commercial_review'
  | 'deployment_selected'
  | 'modules_assigned'
  | 'technical_setup'
  | 'compliance_review'
  | 'pending_approval'
  | 'approved'
  | 'suspended'
export type ComplianceStatus =
  | 'not_submitted'
  | 'under_review'
  | 'passed'
  | 'failed'
  | 'expired'
export type InstitutionType =
  | 'bank'
  | 'fintech'
  | 'micro_credit'
  | 'insurance'
  | 'investment_firm'
  | 'other'
export type BidStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn'
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'
export type IntegrationMode = 'portal' | 'webhook' | 'api_pull' | 'core_banking'

// ─── Core entities ────────────────────────────────────────────
export interface Institution {
  id: string
  name: string
  legal_name: string
  institution_type: InstitutionType
  reg_number?: string
  country: string
  regulator?: string
  website?: string
  deployment_model: DeploymentModel
  modules: string[]
  onboarding_stage: OnboardingStage
  compliance_status: ComplianceStatus
  compliance_notes?: string
  approved: boolean
  approved_at?: string
  suspended_at?: string
  suspension_reason?: string
  primary_contact_name?: string
  primary_contact_email?: string
  primary_contact_phone?: string
  created_at: string
  updated_at: string
}

export interface InstitutionUser {
  id: string
  institution_id: string
  auth_user_id: string
  role: 'admin' | 'analyst' | 'viewer' | 'compliance'
  is_primary_admin: boolean
  invited_by?: string
  created_at: string
}

export interface InstitutionBid {
  id: string
  request_id: string
  institution_id: string
  product_id?: string | null
  submitted_by?: string
  rate: number
  rate_type: 'fixed' | 'variable'
  amount_offered: number
  term_months: number
  conditions?: Record<string, unknown>
  status: BidStatus
  submitted_via: IntegrationMode
  response_time_ms?: number
  submitted_at: string
  expires_at?: string
  withdrawn_at?: string
  withdraw_reason?: string
  // Joined from views
  product_type?: string
  requested_amount?: number
  currency?: string
  request_status?: string
  bid_window_closes_at?: string
  product_label?: string | null
}

export interface MarketplaceRequest {
  id: string
  product_type: string
  status: 'open' | 'bidding' | 'accepted' | 'cancelled' | 'expired'
  amount: number
  currency: string
  term_months?: number
  purpose?: string
  financial_snapshot?: Record<string, unknown> | null
  bid_window_closes_at: string
  created_at: string
  client_ref: string
  client_type: string
  product_id?: string | null
  product_label?: string | null
  family_label?: string | null
  // Anonymous client profile fields (visible to marker/checker only)
  client_country?: string | null
  client_monthly_income?: number | null
  client_net_worth?: number | null
  client_health_score?: number | null     // used as credit score proxy
  client_risk_score?: number | null
  client_affordability_score?: number | null
  client_employment_status?: string | null
}

export interface PendingAction {
  id: string
  action_category: string
  action_status: ActionStatus
  maker_id: string
  maker_role: string
  institution_id?: string
  initiated_at: string
  resource_type: string
  resource_id?: string
  payload: Record<string, unknown>
  payload_before?: Record<string, unknown>
  checker_id?: string
  checker_role?: string
  checker_note?: string
  checked_at?: string
  expires_at: string
  executed_at?: string
  execution_error?: string
  created_at: string
}

export interface InstitutionWebhook {
  id: string
  institution_id: string
  label: string
  endpoint_url: string
  event_types: string[]
  active: boolean
  retry_max: number
  timeout_ms: number
  last_fired_at?: string
  last_status?: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  family_id: string
  code: string
  label: string
  description?: string
  currency: string
  active: boolean
  sort_order: number
  // Joined
  family_label?: string | null
  rate_config?: ProductRateConfig
  sla_defaults?: ProductSlaDefaults
}

export interface ProductRateConfig {
  rate_type: 'fixed' | 'variable' | 'both'
  min_rate?: number
  max_rate?: number
  min_amount?: number
  max_amount?: number
  min_term_months?: number
  max_term_months?: number
}

export interface ProductSlaDefaults {
  bid_window_minutes: number
  auto_withdraw_minutes: number
}

export interface AuditEvent {
  id: string
  institution_id?: string
  pending_action_id?: string
  actor_id?: string
  actor_type: string
  actor_role?: string
  actor_ip?: string
  action_category?: string
  event_label: string
  resource_type?: string
  resource_id?: string
  state_before?: Record<string, unknown>
  state_after?: Record<string, unknown>
  outcome: 'success' | 'rejected' | 'failed' | 'expired' | 'logged'
  outcome_note?: string
  created_at: string
}

// ─── Bid submission payload ───────────────────────────────────
export interface BidPayload {
  request_id: string
  rate: number
  rate_type: 'fixed' | 'variable'
  amount_offered: number
  term_months: number
  conditions?: Record<string, unknown>
  submitted_via?: IntegrationMode
}

// ─── Portal navigation ────────────────────────────────────────
export type PortalSection =
  | 'dashboard'
  | 'marketplace'
  | 'my-bids'
  | 'products'
  | 'pending-actions'
  | 'webhooks'
  | 'audit'
  | 'settings'
