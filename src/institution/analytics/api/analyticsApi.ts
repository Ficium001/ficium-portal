// =============================================================
// Ficium — Institution Analytics API
// Computes analytics client-side from existing /marketplace/my-bids
// endpoint — zero new serverless functions.
// =============================================================
import { portalApi } from '@/shared/lib/portalApi'
import type { InstitutionBid } from '@/institution/types/institution'
import type {
  InstitutionAnalytics, BidSummaryPoint, ProductPerformance, CompetitivenessPoint, AnalyticsSummary,
} from '../types/analytics'

function isoDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-MU', { month: 'short', day: 'numeric' })
}

function ratePct(bid: InstitutionBid): number {
  // Portal bids store rate as decimal (0.085) → multiply by 100
  return bid.rate > 1 ? bid.rate : bid.rate * 100
}

export async function fetchInstitutionAnalytics(days = 30): Promise<InstitutionAnalytics> {
  const bids = await portalApi.get<InstitutionBid[]>('/marketplace/my-bids')

  const cutoff = Date.now() - days * 86_400_000
  const recent = bids.filter(b => new Date(b.submitted_at).getTime() >= cutoff)

  // ── Summary ────────────────────────────────────────────────
  const accepted = recent.filter(b => b.status === 'accepted')
  const rejected = recent.filter(b => b.status === 'rejected')
  const expired  = recent.filter(b => b.status === 'expired')
  const winRate  = recent.length > 0 ? Math.round((accepted.length / recent.length) * 100) : 0
  const avgRate  = recent.length > 0
    ? parseFloat((recent.reduce((s, b) => s + ratePct(b), 0) / recent.length).toFixed(2))
    : 0
  const totalDealValue = accepted.reduce((s, b) => s + (b.amount_offered ?? 0), 0)
  const responseTimes  = recent.filter(b => b.response_time_ms != null).map(b => b.response_time_ms!)
  const avgResponseMs  = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length)
    : null

  const summary: AnalyticsSummary = {
    period_days:          days,
    total_bids:           recent.length,
    accepted_bids:        accepted.length,
    rejected_bids:        rejected.length,
    expired_bids:         expired.length,
    win_rate_pct:         winRate,
    avg_rate_offered_pct: avgRate,
    total_deal_value_mur: totalDealValue,
    avg_response_time_ms: avgResponseMs,
  }

  // ── Bid trend (last N days) ────────────────────────────────
  const trendMap: Record<string, { bids: number; accepted: number; rejected: number }> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    trendMap[d.toLocaleDateString('en-MU', { month: 'short', day: 'numeric' })] = { bids: 0, accepted: 0, rejected: 0 }
  }
  recent.forEach(b => {
    const label = isoDateLabel(b.submitted_at)
    if (!trendMap[label]) return
    trendMap[label].bids++
    if (b.status === 'accepted') trendMap[label].accepted++
    if (b.status === 'rejected') trendMap[label].rejected++
  })
  const bid_trend: BidSummaryPoint[] = Object.entries(trendMap).map(([date, v]) => ({ date, ...v }))

  // ── By product ────────────────────────────────────────────
  const productMap: Record<string, InstitutionBid[]> = {}
  recent.forEach(b => {
    const key = b.product_type ?? 'unknown'
    if (!productMap[key]) productMap[key] = []
    productMap[key].push(b)
  })
  const by_product: ProductPerformance[] = Object.entries(productMap).map(([type, items]) => {
    const acc   = items.filter(b => b.status === 'accepted')
    const label = items[0]?.product_label ?? type.replace(/_/g, ' ')
    return {
      product_type:    type,
      product_label:   label,
      total_bids:      items.length,
      accepted:        acc.length,
      win_rate_pct:    items.length > 0 ? Math.round((acc.length / items.length) * 100) : 0,
      avg_rate_pct:    items.length > 0
        ? parseFloat((items.reduce((s, b) => s + ratePct(b), 0) / items.length).toFixed(2))
        : 0,
      total_value_mur: acc.reduce((s, b) => s + (b.amount_offered ?? 0), 0),
    }
  }).sort((a, b) => b.total_bids - a.total_bids)

  // ── Competitiveness (requires market intel endpoint) ──────
  // Falls back gracefully if intel not available
  let competitiveness: CompetitivenessPoint[] = []
  try {
    const intel = await portalApi.get<{
      competitiveness?: Array<{ product_type: string; avg_bids_per_request: number }>
      acceptanceIntel?: Array<{ product_type: string; avg_winning_rate_pct: number }>
    }>('/marketplace/intelligence')
    if (intel?.competitiveness) {
      competitiveness = intel.competitiveness.map(c => {
        const myProduct = by_product.find(p => p.product_type === c.product_type)
        return {
          product_type:         c.product_type,
          avg_bids_per_req:     c.avg_bids_per_request,
          my_win_rate_pct:      myProduct?.win_rate_pct ?? 0,
          market_win_rate_pct:  myProduct ? Math.round(100 / Math.max(c.avg_bids_per_request, 1)) : 0,
        }
      })
    }
  } catch { /* intel endpoint optional */ }

  return { summary, bid_trend, by_product, competitiveness }
}
