/** Autobid — shapes returned by ficium-portal-api /v1/autobid. */

export type DecisionMode = 'rules' | 'external' | 'rules_then_external'
export type ApprovalMode = 'queue_for_approval' | 'pre_approved'
export type FailureMode  = 'skip' | 'use_rule'
export type FieldKind    = 'num' | 'str' | 'bool' | 'tier'
export type Op           = 'eq' | 'in' | 'between' | 'lte' | 'gte'

export interface AutobidConfig {
  enabled:              boolean
  decision_mode:        DecisionMode
  approval_mode:        ApprovalMode
  engine_url:           string | null
  engine_timeout_ms:    number
  engine_failure_mode:  FailureMode
  max_bids_per_day:     number
  max_amount_per_day:   number
  product_codes:        string[] | null
  engine_secret_set_at: string | null
  version:              number
  updated_at:           string | null
}

export type ConfigFields = Pick<AutobidConfig,
  'enabled' | 'decision_mode' | 'approval_mode' | 'engine_url' | 'engine_timeout_ms'
  | 'engine_failure_mode' | 'max_bids_per_day' | 'max_amount_per_day' | 'product_codes'>

export interface PendingChange {
  id:               string
  proposed:         ConfigFields
  before:           ConfigFields
  reason:           string
  proposed_by_name: string | null
  created_at:       string
  expires_at:       string
  mine:             boolean
  can_approve:      boolean
}

export interface Vocabulary {
  fields:     { field: string; kind: FieldKind; ops: Op[] }[]
  products:   string[]
  risk_tiers: string[]
}

export interface AutobidOverview {
  config:            AutobidConfig
  pending_change:    PendingChange | null
  active_rules:      number
  me:                { member_id: string; may_approve: boolean; is_admin: boolean }
  vocabulary:        Vocabulary
  decision_contract: string
}

export type Leaf = { field: string; op: Op; value: unknown }
export type Predicate = Leaf | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }

export interface RuleAction {
  rate_pct:        number
  rate_by_tier?:   Record<string, number>
  rate_type:       'fixed' | 'variable'
  amount:          { mode: 'requested' | 'fixed' | 'pct_of_requested'; value?: number }
  term:            { mode: 'requested' | 'fixed'; value?: number }
  rate_valid_days: number
  conditions?:     string
}

export interface RuleGuardrails {
  max_bids_per_day:   number
  max_amount_per_day: number
  expires_at?:        string
}

export type RuleStatus = 'draft' | 'pending_approval' | 'active' | 'paused' | 'rejected' | 'retired'

export interface RuleSummary {
  id:                 string
  name:               string
  description:        string | null
  status:             RuleStatus
  priority:           number
  current_version_no: number | null
  submitted_by_name:  string | null
  approved_by_name:   string | null
  approved_at:        string | null
  action:             RuleAction | null
  guardrails:         RuleGuardrails | null
  mine:               boolean
}

export interface RuleDetail {
  rule: { id: string; name: string; description: string | null; status: RuleStatus; priority: number }
  current_version: {
    id: string; version_no: number; predicate: Predicate; action: RuleAction; guardrails: RuleGuardrails
    submitted_at: string | null; approved_at: string | null; rejection_note: string | null
    submitted_by_name: string | null; approved_by_name: string | null
  } | null
  mine:        boolean
  can_approve: boolean
}

export interface RuleInput {
  name:        string
  description: string | null
  priority:    number
  predicate:   Predicate
  action:      RuleAction
  guardrails:  RuleGuardrails
}

export interface PricedBid {
  rate_pct: number; rate_type: string; amount: number; term_months: number
  rate_valid_days: number; conditions: string | null
}

export interface PreviewResult {
  days:             number
  requests_checked: number
  would_bid:        number
  total_amount:     number
  sample: { request_id: string; product: string; amount: number; term_months: number
            risk_tier: string | null; bid: PricedBid | null }[]
}

export type Outcome =
  | 'bid_placed' | 'queued_for_approval' | 'declined_by_engine' | 'no_match'
  | 'suppressed_guardrail' | 'suppressed_exposure' | 'skipped_compliance'
  | 'skipped_product' | 'engine_unavailable' | 'error'

export interface Execution {
  id:              number
  rule_id:         string | null
  rule_name:       string | null
  loan_request_id: string
  outcome:         Outcome
  bid_id:          string | null
  detail:          Record<string, unknown> & {
    amount?: number; rate_pct?: number; term_months?: number; reason?: string
    engine?: { reference?: string | null; latency_ms?: number | null; reason?: string | null }
  }
  occurred_at:     string
}

export interface Summary {
  today:              Partial<Record<Outcome, number>>
  bids_today:         number
  amount_today:       number
  max_bids_per_day:   number
  max_amount_per_day: number
  enabled:            boolean
}

export interface EngineTestResult {
  answer: {
    decision: 'bid' | 'decline' | 'unavailable'
    rate_pct: number | null; amount: number | null; term_months: number | null
    reference: string | null; reason: string | null; status_code: number | null; latency_ms: number | null
  }
}

export interface ConfigChangeHistory {
  id: string; proposed: ConfigFields; before: ConfigFields; reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'
  created_at: string; decided_at: string | null; decision_note: string | null
  proposed_by_name: string | null; decided_by_name: string | null
}
