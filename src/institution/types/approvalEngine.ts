// =============================================================
// Ficium Portal — Approval Engine types (inst:approvals)
// Backend: ficium-portal-api /approval-engine/*
// =============================================================

export type StageType = 'single' | 'dual' | 'committee' | 'checklist' | 'external_hold'
export type EntityType =
  | 'bid' | 'offer_letter' | 'countersign' | 'investment_mandate'
  | 'api_key' | 'webhook' | 'user_admin' | 'custom'
export type InstanceStatus =
  | 'in_progress' | 'approved' | 'rejected' | 'expired' | 'escalated' | 'withdrawn'
export type VoteAction = 'approve' | 'reject' | 'abstain' | 'recuse' | 'comment' | 'checklist_update'

export interface CommitteeMember {
  id: string
  member_id: string
  role: 'chair' | 'vice_chair' | 'member' | 'secretary' | 'observer'
  is_voting: boolean
  valid_from: string
  valid_to: string | null
}

export interface Committee {
  id: string
  name: string
  description: string | null
  quorum_type: 'count' | 'fraction' | 'unanimous'
  quorum_value: number | null
  tie_break: 'chair' | 'reject' | 'escalate'
  allow_abstain: boolean
  status: 'active' | 'retired'
  members: CommitteeMember[]
}

export interface StageDef {
  seq: number
  name: string
  stage_type: StageType
  committee_id: string | null
  approver_role: string | null
  sla_hours: number | null
  on_sla_breach: 'notify' | 'escalate' | 'auto_reject'
  escalate_to_template_id?: string | null
  checklist?: { key: string; label: string; required: boolean }[] | null
}

export interface ApprovalTemplate {
  id: string
  name: string
  entity_type: EntityType
  version: number
  status: 'draft' | 'pending_activation' | 'active' | 'retired'
  stages: StageDef[]
}

export interface DoaConditions {
  amount_min?: number
  amount_max?: number
  currency?: string
  risk_tiers?: string[]
  product_types?: string[]
  secured?: boolean
  tenor_months_max?: number
}

export interface DoaRule {
  id: string
  entity_type: EntityType
  priority: number
  conditions: DoaConditions
  template_id: string
  template_name: string
}

export interface ApprovalInboxItem {
  instance_id: string
  stage_instance_id: string
  entity_type: EntityType
  stage_name: string
  stage_type: StageType
  entity_snapshot: Record<string, unknown>
  started_at: string
  due_at: string | null
  approvals_in: number
  quorum_type: 'count' | 'fraction' | 'unanimous' | null
  quorum_value: number | null
  my_vote: string | null
}

export interface TimelineAction {
  actor_id: string
  acting_as: string | null
  action: VoteAction | 'withdraw' | 'escalate' | 'delegate'
  comment: string | null
  created_at: string
}

export interface TimelineStage {
  seq: number
  name: string
  stage_type: StageType
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'expired' | 'skipped'
  started_at: string | null
  due_at: string | null
  resolved_at: string | null
  actions: TimelineAction[]
}

export interface ApprovalInstanceDetail {
  instance: {
    id: string
    entity_type: EntityType
    entity_snapshot: Record<string, unknown>
    status: InstanceStatus
    template_name: string
    rule_priority: number
    conditions: DoaConditions
    started_at: string
    resolved_at: string | null
    withdraw_reason: string | null
  }
  stages: TimelineStage[]
}

export interface SimulateResult {
  rule_id: string
  rule_priority: number
  template: { id: string; name: string; version: number; stages: StageDef[] } | null
}

export interface EsignEnvelope {
  id: string
  title: string
  entity_type: string
  entity_id: string
  status: 'draft' | 'sent' | 'partially_signed' | 'completed' | 'declined' | 'expired' | 'voided'
  expires_at: string
  completed_at: string | null
  sealed_path: string | null
  sealed_sha256: string | null
  signers: { party: 'borrower' | 'institution'; display_name: string; status: string; signed_at: string | null }[]
}

export interface EsignEvent {
  event: string
  detail: Record<string, unknown> | null
  ip: string | null
  created_at: string
  prev_hash: string
  hash: string
}

export interface EsignEventTrail {
  chain_intact: boolean
  events: EsignEvent[]
}
