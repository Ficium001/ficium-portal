// =============================================================
// Ficium Portal — inst:doctemplates types
// Mirrors ficium-portal-api app/api/doc_templates/schemas.py
// =============================================================

export type DocCategory =
  | 'loan_agreement' | 'facility_letter' | 'legal_agreement'
  | 'terms_conditions' | 'other'

export type TemplateStatus  = 'draft' | 'pending_approval' | 'active' | 'retired'
export type VersionStatus   = 'draft' | 'pending_approval' | 'published' | 'retired' | 'rejected'
export type GenerationStatus = 'pending' | 'generating' | 'generated' | 'failed'

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  loan_agreement:   'Loan agreement',
  facility_letter:  'Facility letter',
  legal_agreement:  'Legal agreement',
  terms_conditions: 'Terms & conditions',
  other:            'Other',
}

export interface DocTemplate {
  id:              string
  institution_id:  string
  code:            string
  name:            string
  description:     string | null
  doc_category:    DocCategory
  product_id:      string | null
  product_code:    string | null
  status:          TemplateStatus
  current_version: number
  created_by:      string | null
  created_at:      string
  updated_at:      string
}

export interface DocTemplateVersion {
  id:               string
  template_id:      string
  version_no:       number
  file_name:        string
  file_size_bytes:  number | null
  checksum_sha256:  string | null
  merge_field_map:  Record<string, unknown>
  change_note:      string | null
  status:           VersionStatus
  created_by:       string | null
  approved_by:      string | null
  approved_at:      string | null
  rejection_note:   string | null
  created_at:       string
}

export interface DocGeneration {
  id:                  string
  template_id:         string
  template_version_id: string
  entity_type:         string
  entity_id:           string
  stage_instance_id:   string | null
  status:              GenerationStatus
  error:               string | null
  output_docx_path:    string | null
  output_pdf_path:     string | null
  esign_envelope_id:   string | null
  generated_by:        string | null
  generated_at:        string | null
  created_at:          string
}

export interface MergeField {
  key:     string
  label:   string
  example: string
}
