// Shared types for the Ficium Intelligence system.
// Imported by both src/lib/intelligence.ts (frontend) and api/intelligence.ts (backend).
// No node dependencies — safe for both environments.

export type MarketRate = {
  product_type: string;
  bid_count: number;
  request_count: number;
  min_rate_pct: number;
  max_rate_pct: number;
  avg_rate_pct: number;
  p25_rate_pct: number;
  p75_rate_pct: number;
};

export type RequestPattern = {
  product_type: string;
  total_requests: number;
  open_requests: number;
  avg_amount: number;
  median_amount: number;
  avg_term_months: number;
  close_rate_pct: number;
};

export type AcceptanceIntel = {
  product_type: string;
  total_acceptances: number;
  avg_winning_rate_pct: number;
  min_winning_rate_pct: number;
  avg_winning_amount: number;
  avg_winning_term_months: number;
  rate_vs_market_avg_pct: number;
};

export type MarketCompetitiveness = {
  product_type: string;
  active_institutions: number;
  avg_bids_per_request: number;
};

export type FiciumIntelligence = {
  generatedAt:     string;
  marketRates:     MarketRate[];
  requestPatterns: RequestPattern[];
  acceptanceIntel: AcceptanceIntel[];
  competitiveness: MarketCompetitiveness[];
  summary:         string;
};
