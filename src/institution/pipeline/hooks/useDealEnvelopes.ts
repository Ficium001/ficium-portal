/**
 * useDealEnvelopes — the e-sign envelopes raised against one deal.
 *
 * Envelopes opened from a deal carry entity_id = pipeline id, so this is the
 * institution's envelope list filtered to that id. Client-side because
 * GET /esign/envelopes has no entity filter yet; add one server-side before
 * volume makes this wasteful. Shares the list's query cache.
 */
import { useEsignEnvelopes } from '@/institution/esign/hooks/useEsign'

export function useDealEnvelopes(pipelineId: string, enabled = true) {
  const query = useEsignEnvelopes(enabled)
  return { ...query, data: query.data?.filter(e => e.entity_id === pipelineId) }
}
