/**
 * institution/pipeline/types/pipeline.ts
 * All TypeScript types for the pipeline module.
 * No imports from other institution modules — self-contained.
 */

export type StageKey =
  | "credit_docs"
  | "offer_letter"
  | "legal_review"
  | "board_approval"
  | "disbursement"
  | "custom";

export type StageStatus =
  | "pending"
  | "active"
  | "awaiting_approval"
  | "completed"
  | "skipped"
  | "blocked";

export type PipelineStatus = "active" | "completed" | "withdrawn" | "declined";

export interface StageInstance {
  id:                     string;
  pipeline_id:            string;
  position:               number;
  status:                 StageStatus;
  stage_key:              StageKey;
  label:                  string;
  description:            string;
  borrower_label:         string;
  borrower_visible:       boolean;
  requires_maker_checker: boolean;
  requires_documents:     boolean;
  sla_hours:              number;
  sla_due_at:             string | null;
  sla_breached:           boolean;
  notes:                  string | null;
  documents:              unknown[];
  submitted_by:           string | null;
  submitted_at:           string | null;
  approved_by:            string | null;
  approved_at:            string | null;
  started_at:             string | null;
  completed_at:           string | null;
  updated_at:             string;
}

export interface PipelineSummary {
  id:                        string;
  request_id:                string;
  status:                    PipelineStatus;
  consumer_ref:              string;
  product_label:             string;
  deal_amount:               number;
  deal_rate:                 number;
  deal_term_months:          number;
  current_stage_label:       string;
  current_stage_key:         StageKey;
  current_stage_status:      StageStatus;
  current_stage_instance_id: string;
  current_sla_due_at:        string | null;
  stages_completed:          number;
  stages_total:              number;
  sla_breached:              boolean;
  started_at:                string;
}

export interface PipelineDetail {
  id:               string;
  request_id:       string;
  bid_id:           string;
  status:           PipelineStatus;
  deal_amount:      number;
  deal_rate:        number;
  deal_term_months: number;
  product_label:    string;
  consumer_ref:     string;
  // Phase 2 reveal
  borrower_name:    string | null;
  borrower_email:   string | null;
  borrower_phone:   string | null;
  borrower_address: string | null;
  started_at:       string;
  completed_at:     string | null;
  stages:           StageInstance[];
}

export interface AdvanceStageResult {
  status:          "advanced" | "awaiting_approval" | "completed";
  next_stage_id?:  string;
  pipeline_id?:    string;
  stage_id?:       string;
}
