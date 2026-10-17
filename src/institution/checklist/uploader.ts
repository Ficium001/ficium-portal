import type { DealDocument } from './types'

const day = (s: string) =>
  new Date(s).toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Who supplied a deal document's file. For borrower uploads, also where it came
 * from and the date it covers: the reviewing officer checks that date.
 */
export function uploaderLabel(doc: DealDocument): string {
  if (doc.uploaded_via !== 'borrower') return doc.uploaded_by_name ?? 'uploaded'
  const from = doc.source === 'vault' ? 'borrower, from their vault' : 'borrower'
  return doc.document_date ? `${from}, dated ${day(doc.document_date)}` : from
}
