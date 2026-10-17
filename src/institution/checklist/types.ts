/** Document checklist (portal-api db/027). */
export type DocStatus = 'required' | 'received' | 'verified' | 'rejected' | 'waived'
export type ProvidedBy = 'borrower' | 'bank' | 'third_party'

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
  requirement_id: string
  name: string
  description: string | null
  provided_by: ProvidedBy
  mandatory: boolean
  position: number
  stage_def_id: string | null
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
}

export const PROVIDED_BY_LABEL: Record<ProvidedBy, string> = {
  borrower: 'Borrower', bank: 'Bank', third_party: 'Third party',
}

/** A document is done when verified or waived. */
export const isDone = (s: DocStatus) => s === 'verified' || s === 'waived'
