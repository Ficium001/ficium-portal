// =============================================================
// Ficium Portal — shared entity taxonomy
//
// Four modules each grew their own answer to "what kind of thing is
// this?", and none of them line up:
//
//   approval-engine  EntityType   bid | offer_letter | countersign |
//                                 investment_mandate | api_key |
//                                 webhook | user_admin | custom
//   doc-templates    DocCategory  loan_agreement | facility_letter |
//                                 legal_agreement | terms_conditions | other
//   doc generation   entity_type  free-form string, in practice 'loan_pipeline'
//
// The practical consequence: a `loan_agreement` generated against a
// `loan_pipeline` deal has no representation in e-sign's vocabulary, so it
// gets flattened to `custom` and the categorisation is lost at exactly the
// point the audit trail needs it.
//
// These wire formats are API contracts — this module does NOT change what
// goes over the wire. It provides one place to name the subjects a document
// can be generated against, and to translate a document's category into the
// closest e-sign entity type, so the mapping lives in one reviewable spot
// instead of being re-derived (or guessed) at each call site.
// =============================================================
import type { DocCategory } from '@/institution/doc-templates/types/docTemplates'
import type { EntityType } from '@/institution/types/approvalEngine'

/**
 * Subjects a document can be generated against.
 *
 * Sent as `entity_type` on POST /institution/doc-templates/{id}/generate and
 * accepted by the backend's `_resolve_entity_snapshot`. Currently only deals
 * resolve to a snapshot; the union exists so adding another subject is a
 * compile-time change here rather than a new string literal at a call site.
 */
export type DocumentSubject = 'loan_pipeline'

export const DOCUMENT_SUBJECT_LABEL: Record<DocumentSubject, string> = {
  loan_pipeline: 'Deal',
}

/**
 * Best-fit e-sign entity type for a generated document's category.
 *
 * E-sign's vocabulary predates doc-templates and has no loan/facility members,
 * so several categories legitimately land on `custom`. Keeping that decision
 * here means the lossy step is visible and reviewable in one place — and when
 * the e-sign vocabulary is extended, only this map changes.
 */
export function esignEntityTypeForCategory(category: DocCategory): EntityType {
  switch (category) {
    case 'facility_letter':
      return 'offer_letter'
    case 'loan_agreement':
    case 'legal_agreement':
    case 'terms_conditions':
    case 'other':
    default:
      return 'custom'
  }
}
