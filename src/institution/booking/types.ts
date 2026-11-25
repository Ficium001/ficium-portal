/** A deal's booking in the bank's core banking system (portal-api db/025). */
export interface Booking {
  pipeline_id:      string
  core_reference:   string
  booked_on:        string
  disbursed_amount: number
  disbursed_on:     string | null
  monthly_amount?:  number | null
  term_months?:     number | null
  notes:            string | null
  source:           'portal' | 'api'
  corrected_count:  number
  closed_on?:       string | null
  closure_reason?:  string | null
  closed_source?:   'portal' | 'api' | null
  created_at:       string
  updated_at:       string
  recorded_by_name: string | null
}

export interface BookingInput {
  core_reference:   string
  booked_on:        string
  disbursed_amount: number
  disbursed_on:     string | null
  monthly_amount?:  number | null
  term_months?:     number | null
  notes:            string | null
}

/** Which optional fields this deal's booking must carry (portal-api db/072). */
export interface BookingRequirements {
  pipeline_id: string
  requires:    { monthly_amount: boolean; term_months: boolean }
}

/** The booked account ended: plan stopped, deposit closed, loan cancelled or repaid early. */
export interface ClosureInput {
  closed_on: string
  reason:    string
}
