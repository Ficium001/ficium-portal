/** One four-eyes switch, as GET /controls/four-eyes returns it. */
export interface FourEyesControl {
  category:      string
  label:         string
  screen:        string
  locked:        boolean
  locked_reason: string | null
  enabled:       boolean
  can_change:    boolean
  changed_at:    string | null
  /** Set while a request to switch this off waits for a second admin. */
  pending_disable_action_id: string | null
}

/** What the server did with a submitted action. */
export type SubmitOutcome = 'executed' | 'pending_approval'
