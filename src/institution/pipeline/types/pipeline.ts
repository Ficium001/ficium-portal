/**
 * institution/pipeline/types/pipeline.ts
 * All TypeScript types for the pipeline module.
 * Self-contained — no imports from other institution modules.
 *
 * Run-time types  → marketplace.loan_pipeline + marketplace.pipeline_stage_instance
 * Config-time types → institution.pipeline_template + institution.pipeline_stage_def
 */

// ── Run-time ──────────────────────────────────────────────────────────────────

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

// ── Config-time (template management) ────────────────────────────────────────
// Maps to institution.pipeline_template + institution.pipeline_stage_def
// product_code = null means "default — applies to all products"

export interface PipelineStageDef {
  id:                     string;
  position:               number;
  stage_key:              StageKey;
  label:                  string;           // display name shown to bank officers
  description:            string | null;
  sla_hours:              number;           // default 48
  requires_maker_checker: boolean;          // stage needs checker sign-off
  requires_documents:     boolean;          // stage is gated on documents
  borrower_label:         string | null;    // what borrower sees in loan tracker
  borrower_visible:       boolean;          // show this stage to borrower?
  is_active:              boolean;
  created_at:             string;
}

export interface PipelineTemplate {
  id:            string;
  name:          string;
  description:   string | null;
  product_code:  string | null;   // null = default for all products
  product_label: string | null;   // from catalog.product.label
  is_default:    boolean;
  is_active:     boolean;
  stage_count:   number;
  created_at:    string;
  updated_at:    string;
}

export interface PipelineTemplateDetail extends PipelineTemplate {
  stages: PipelineStageDef[];
}

export interface CreateTemplatePayload {
  name:          string;
  product_code?: string | null;
  description?:  string;
  is_default?:   boolean;
  stages?:       CreateStageDefPayload[];
}

export interface CreateStageDefPayload {
  label:                   string;
  stage_key:               StageKey;
  description?:            string;
  sla_hours?:              number;
  requires_maker_checker?: boolean;
  requires_documents?:     boolean;
  borrower_label?:         string;
  borrower_visible?:       boolean;
}

export interface UpdateStageDefPayload {
  label?:                  string;
  stage_key?:              StageKey;
  description?:            string;
  sla_hours?:              number;
  requires_maker_checker?: boolean;
  requires_documents?:     boolean;
  borrower_label?:         string;
  borrower_visible?:       boolean;
}
