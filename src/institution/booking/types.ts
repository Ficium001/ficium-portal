/** A deal's booking in the bank's core banking system (portal-api db/025). */
export interface Booking {
  pipeline_id:      string
  core_reference:   string
  booked_on:        string
  disbursed_amount: number
  disbursed_on:     string | null
  notes:            string | null
  source:           'portal' | 'api'
  corrected_count:  number
  created_at:       string
  updated_at:       string
  recorded_by_name: string | null
}

export interface BookingInput {
  core_reference:   string
  booked_on:        string
  disbursed_amount: number
  disbursed_on:     string | null
  notes:            string | null
}
