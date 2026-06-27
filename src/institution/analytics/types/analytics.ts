// =============================================================
// Ficium — Institution Analytics Types
// Module: inst:analytics
// Self-contained — never import from other modules except shared/
// =============================================================

export interface BidSummaryPoint {
  date:       string   // ISO date label (e.g. "Jun 27")
  bids:       number
  accepted:   number
  rejected:   number
}

export interface ProductPerformance {
  product_type:   string
  product_label:  string
  total_bids:     number
  accepted:       number
  win_rate_pct:   number
  avg_rate_pct:   number
  total_value_mur:number
}

export interface CompetitivenessPoint {
  product_type:      string
  avg_bids_per_req:  number
  my_win_rate_pct:   number
  market_win_rate_pct: number
}

export interface AnalyticsSummary {
  period_days:          number
  total_bids:           number
  accepted_bids:        number
  rejected_bids:        number
  expired_bids:         number
  win_rate_pct:         number
  avg_rate_offered_pct: number
  total_deal_value_mur: number
  avg_response_time_ms: number | null
}

export interface InstitutionAnalytics {
  summary:         AnalyticsSummary
  bid_trend:       BidSummaryPoint[]
  by_product:      ProductPerformance[]
  competitiveness: CompetitivenessPoint[]
}
