// =============================================================
// Ficium Intelligence — frontend hook + cache
// Fetches market intelligence from /api/intelligence and makes
// it available to Claude prompts across the app.
// =============================================================
import { useState, useEffect, useRef } from "react";
import type { FiciumIntelligence, MarketRate, RequestPattern, AcceptanceIntel, MarketCompetitiveness } from "@/shared/lib/intelligence-types";

export type { FiciumIntelligence, MarketRate, RequestPattern, AcceptanceIntel, MarketCompetitiveness };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// Module-level cache so we don't re-fetch on every component mount
let _cache: { data: FiciumIntelligence; ts: number } | null = null;

async function fetchIntelligence(): Promise<FiciumIntelligence> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.data;
  const res  = await fetch("/api/intelligence");
  const data = (await res.json()) as FiciumIntelligence;
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

// ── Inject intelligence into a system prompt ─────────────────
export function injectIntelligence(
  basePrompt: string,
  intel: FiciumIntelligence | null,
): string {
  if (!intel?.summary) return basePrompt;
  return `${basePrompt}\n\n${intel.summary}`;
}

// ── Get intelligence summary for server-side injection ────────
// Used by API routes that can't use hooks
export async function getIntelligenceSummary(): Promise<string> {
  try {
    const data = await fetchIntelligence();
    return data.summary;
  } catch {
    return "";
  }
}
