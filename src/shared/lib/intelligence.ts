// =============================================================
// Ficium Intelligence — frontend hook + cache
// Fetches anonymous market aggregates from portal-api
// GET /marketplace/intelligence. (It used to fetch /api/intelligence
// from this site's own origin, which has no API, so it always 404'd
// and the Marketplace strip never rendered.)
// =============================================================
import { useState, useEffect, useRef } from "react";
import { portalApi } from "@/shared/lib/portalApi";
import type { FiciumIntelligence, MarketRate, RequestPattern, AcceptanceIntel, MarketCompetitiveness } from "@/shared/lib/intelligence-types";

export type { FiciumIntelligence, MarketRate, RequestPattern, AcceptanceIntel, MarketCompetitiveness };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// Module-level cache so we don't re-fetch on every component mount
let _cache: { data: FiciumIntelligence; ts: number } | null = null;

async function fetchIntelligence(): Promise<FiciumIntelligence> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.data;
  const data = await portalApi.get<FiciumIntelligence>("/marketplace/intelligence");
  _cache = { data, ts: Date.now() };
  return data;
}

// ── React hook ────────────────────────────────────────────────
export function useIntelligence() {
  const [intel, setIntel]     = useState<FiciumIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchIntelligence()
      .then((d) => { if (mounted.current) setIntel(d); })
      .catch(() => { /* degrade gracefully */ })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);

  // Convenience: get rate data for a specific product type
  const getRates = (productType: string) =>
    intel?.marketRates?.find((r) => r.product_type === productType) ?? null;

  const getPattern = (productType: string) =>
    intel?.requestPatterns?.find((p) => p.product_type === productType) ?? null;

  const getWinningBid = (productType: string) =>
    intel?.acceptanceIntel?.find((a) => a.product_type === productType) ?? null;

  // Top 3 most active product types by request volume
  const topProducts = [...(intel?.requestPatterns ?? [])]
    .sort((a, b) => b.total_requests - a.total_requests)
    .slice(0, 3);

  return { intel, loading, getRates, getPattern, getWinningBid, topProducts };
}

