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
  email?: string
  full_name?: string
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

export interface LoanRecord {
  type: string
  outstanding: number
  monthly: number
  bank?: string | null
  months_left?: number | null
}

// Phase 1 Ficium-attested verified attributes (from metadata column)
export interface RequestMetadata {
  ficium_attested?: boolean
  // KYC & risk
  kyc_verified?: boolean
  health_score?: number | null
  risk_score?: number | null
  affordability_score?: number | null
  risk_tier?: 'A' | 'B' | 'C' | 'D' | null
  age?: number | null
  // Employment
  employment_status?: string | null
  employment_type?: string | null
  employer?: string | null
  years_employed?: number | null
  gross_monthly_income?: number | null
  income_verified?: boolean
  // DSR
  dsr_current_pct?: number | null
  dsr_post_pct?: number | null
  // Net worth
  net_worth_band?: string | null
  // Existing obligations
  has_existing_loans?: boolean | null
  existing_monthly_repayment?: number | null
  existing_loan_balance?: number | null
  loan_breakdown?: LoanRecord[] | null
  // Legacy
  income_band?: string | null
}

// Bidding context (from params column) — no PII
export interface RequestParams {
  app_product_type?: string
  max_rate?: number | null
  loan_purpose?: string | null
  collateral_type?: string | null
  collateral_sub?: string | null
  ltv_pct?: number | null
}

export interface MarketplaceRequest {
  id: string
  consumer_ref?: string | null          // anonymised ref
  product_id?: string | null
  product_type: string                  // legacy / fallback path
  product_label?: string | null
  product_family_label?: string | null
  country?: string | null
  currency: string
  amount: number
  term_months?: number
  params?: RequestParams | null
  metadata?: RequestMetadata | null
  status: 'open' | 'bidding' | 'closed' | 'accepted' | 'cancelled' | 'expired'
  bid_window_opens_at?: string
  bid_window_closes_at: string
  bid_count?: number
  source?: string
  created_at: string
  // Legacy flat fields (app-DB fallback path — keep for compatibility)
  purpose?: string | null
  client_ref?: string | null
  family_label?: string | null
  client_country?: string | null
  client_monthly_income?: number | null
  client_net_worth?: number | null
  client_health_score?: number | null
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

// ─── Benefits ─────────────────────────────────────────────────
export interface BenefitCategory {
  id:         string
  code:       string
  label:      string
  icon_key:   string | null
  sort_order: number
}

export interface Benefit {
  id:             string
  institution_id: string
  product_id:     string | null
  cat_id:         string
  cat_code:       string
  cat_label:      string
  cat_icon:       string | null
  product_code:   string | null
  product_label:  string | null
  title:          string
  description:    string | null
  value_display:  string | null
  is_guaranteed:  boolean
  conditions:     string | null
  valid_from:     string | null
  valid_until:    string | null
  is_active:      boolean
  created_at:     string
  updated_at:     string
}

// ─── Documents ────────────────────────────────────────────────
export interface DocType {
  id:           string
  code:         string
  label:        string
  description:  string | null
  is_mandatory: boolean
  applies_to:   string[] | null
  sort_order:   number
}

export interface InstitutionDoc {
  id:                  string
  institution_id:      string
  doc_type_id:         string
  doc_type_code:       string
  doc_type_label:      string
  is_mandatory:        boolean
  doc_type_description: string | null
  storage_path:        string
  file_name:           string
  mime_type:           string | null
  status:              'pending' | 'approved' | 'rejected' | 'expired'
  expiry_date:         string | null
  rejection_reason:    string | null
  reviewed_at:         string | null
  uploaded_at:         string
}

export interface ComplianceGate {
  institution_id: string
  is_approved:    boolean
  is_compliant:   boolean
  missing_docs:   string[]
  can_bid:        boolean
}
