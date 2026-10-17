/** Document checklist (portal-api db/027). */
export type DocStatus = 'required' | 'received' | 'verified' | 'rejected' | 'waived'
export type ProvidedBy = 'borrower' | 'bank' | 'third_party'

/** Contract 1.5: lets the borrower reuse a matching copy from their vault. */
export type DocumentType =
  | 'payslip' | 'employment_letter' | 'tax_return' | 'bank_statement' | 'loan_statement'
  | 'credit_card_statement' | 'title_deed' | 'valuation_report' | 'land_registry_extract'
  | 'brn_certificate' | 'audited_accounts' | 'insurance_policy' | 'nic' | 'passport'
  | 'birth_certificate' | 'driving_licence' | 'other'

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  payslip: 'Payslip', employment_letter: 'Employment letter', tax_return: 'Tax return',
  bank_statement: 'Bank statement', loan_statement: 'Loan statement',
  credit_card_statement: 'Credit card statement', title_deed: 'Title deed',
  valuation_report: 'Valuation report', land_registry_extract: 'Land registry extract',
  brn_certificate: 'BRN certificate', audited_accounts: 'Audited accounts',
  insurance_policy: 'Insurance policy', nic: 'National ID card', passport: 'Passport',
  birth_certificate: 'Birth certificate', driving_licence: 'Driving licence', other: 'Other',
}

export interface DealDocument {
  id: string
  status: DocStatus
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_at: string | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  reviewed_by_name: string | null
  review_note: string | null
  /** 'borrower' when the borrower answered the request through the app. */
  uploaded_via: 'bank' | 'borrower'
  /** Borrower uploads: reused from their vault, or uploaded new for this request. */
  source: 'vault' | 'new' | null
  /** The date the document covers, as the borrower side states it. */
  document_date: string | null
  requirement_id: string
  name: string
  description: string | null
  provided_by: ProvidedBy
  mandatory: boolean
  position: number
  stage_def_id: string | null
  document_type: DocumentType | null
  max_age_days: number | null
  stage_label: string | null
  stage_position: number | null
  stage_status: string | null
}

export interface DocRequirement {
  id: string
  template_id: string
  stage_def_id: string | null
  name: string
  description: string | null
  provided_by: ProvidedBy
  mandatory: boolean
  position: number
  is_active: boolean
  document_type: DocumentType | null
  /** Oldest acceptable document, in days, from the document's own date. */
  max_age_days: number | null
}

export const PROVIDED_BY_LABEL: Record<ProvidedBy, string> = {
  borrower: 'Borrower', bank: 'Bank', third_party: 'Third party',
}

/** A document is done when verified or waived. */
export const isDone = (s: DocStatus) => s === 'verified' || s === 'waived'
