/** Plain-language labels for autobid's vocabulary, modes and outcomes. */
import type { ApprovalMode, DecisionMode, Op, Outcome } from '../types'

export const FIELD_LABELS: Record<string, string> = {
  product: 'Product',
  amount: 'Amount requested (MUR)',
  term_months: 'Term (months)',
  currency: 'Currency',
  risk_tier: 'Ficium risk tier',
  ficium_score: 'Ficium score',
  kyc_verified: 'Identity verified',
  income_verified: 'Income verified',
  employment_status: 'Employment status',
  employment_type: 'Employment type',
  years_employed: 'Years employed',
  gross_monthly_income: 'Gross monthly income (MUR)',
  dsr_current_pct: 'Debt service ratio now (%)',
  dsr_post_pct: 'Debt service ratio after (%)',
  has_existing_loans: 'Has existing loans',
  existing_monthly_repayment: 'Existing monthly repayment (MUR)',
  net_worth_band: 'Net worth band',
  affordability_score: 'Affordability score',
  age: 'Age',
  collateral_type: 'Collateral type',
  ltv_pct: 'Loan to value (%)',
  risk_appetite: 'Risk appetite',
  investment_horizon: 'Investment horizon',
  liquidity_pref: 'Liquidity preference',
  target_amount: 'Target amount (MUR)',
  monthly_contribution: 'Monthly contribution (MUR)',
}

export const OP_LABELS: Record<Op, string> = {
  eq: 'is', in: 'is one of', between: 'is between', lte: 'is at most', gte: 'is at least',
}
export const TIER_OP_LABELS: Partial<Record<Op, string>> = {
  lte: 'is this tier or better', gte: 'is this tier or weaker',
}

export const productLabel = (p: string) =>
  p.split('_').map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')

export const DECISION_MODES: { key: DecisionMode; label: string; hint: string }[] = [
  { key: 'rules', label: 'Ficium rules',
    hint: 'Your approved rules decide and price each bid. Nothing leaves Ficium.' },
  { key: 'external', label: 'Your decision engine',
    hint: 'Ficium sends each request to your own system over a signed HTTPS call; it answers bid or decline.' },
  { key: 'rules_then_external', label: 'Rules, then your engine',
    hint: 'Your rules pick which requests to consider; your engine then decides and prices them.' },
]

export const APPROVAL_MODES: { key: ApprovalMode; label: string; hint: string }[] = [
  { key: 'queue_for_approval', label: 'A person approves every auto-bid',
    hint: 'Auto-bids wait in your bid approvals; a checker sends or rejects each one.' },
  { key: 'pre_approved', label: 'Send at once',
    hint: 'The approved rule (or your engine) is the second pair of eyes; bids go to the borrower immediately, within your daily limits.' },
]

export const OUTCOMES: Record<Outcome, { label: string; tone: string }> = {
  bid_placed:           { label: 'Bid sent',               tone: 'success' },
  queued_for_approval:  { label: 'Waiting for approval',   tone: 'pending' },
  declined_by_engine:   { label: 'Your engine declined',   tone: 'inactive' },
  no_match:             { label: 'No rule matched',        tone: 'inactive' },
  suppressed_guardrail: { label: 'Rule limit reached',     tone: 'expired' },
  suppressed_exposure:  { label: 'Daily limit reached',    tone: 'expired' },
  skipped_compliance:   { label: 'Compliance documents',   tone: 'expired' },
  skipped_product:      { label: 'Product not enabled',    tone: 'inactive' },
  engine_unavailable:   { label: 'Engine did not answer',  tone: 'failed' },
  error:                { label: 'Error',                  tone: 'failed' },
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Waiting for approval', active: 'Active', paused: 'Paused',
  rejected: 'Rejected', retired: 'Retired',
}

export const RULE_TONE: Record<string, string> = {
  draft: 'draft', pending_approval: 'pending', active: 'active', paused: 'expired',
  rejected: 'rejected', retired: 'withdrawn',
}

export const mur = (n: number) => `MUR ${Math.round(n).toLocaleString('en-MU')}`
