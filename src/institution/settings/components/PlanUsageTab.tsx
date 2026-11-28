/**
 * Settings › Plan & usage — which Ficium modules this bank is licensed for, until
 * when, and how much it used them in the last 30 days. Read-only: Ficium grants
 * modules (Portal Admin); banks see them here. GET /v1/entitlements/me + /usage.
 */
import { useQuery } from '@tanstack/react-query'
import { DataRow, DataTable, EmptyState, InlineAlert, SkeletonCard, StatusBadge, Td } from '@/institution/components/primitives'
import { portalApi } from '@/shared/lib/portalApi'

export interface Entitlement {
  module_code:   string
  module_name:   string
  billing_model: string
  metered_unit:  string | null
  entitled:      boolean
  status:        string | null
  plan_tier:     string | null
  valid_from:    string | null
  valid_to:      string | null
  limits:        Record<string, unknown>
}
interface UsageLine { module_code: string; unit: string; quantity: number }

const UNIT_LABELS: Record<string, string> = {
  executed_bid: 'auto-bids', active_loan: 'active loans', score_request: 'score requests',
}
const BILLING_LABELS: Record<string, string> = {
  flat: 'Flat fee', metered: 'Pay per use', flat_plus_metered: 'Flat fee + per use',
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export function statusOf(e: Entitlement): { tone: string; label: string } {
  if (e.status === 'active') return { tone: 'active', label: 'Included' }
  if (e.status === 'trial') return { tone: 'pending', label: 'Trial' }
  if (e.status === 'suspended') return { tone: 'rejected', label: 'Suspended' }
  if (e.status === 'expired' || e.status === 'cancelled') return { tone: 'withdrawn', label: 'Ended' }
  return { tone: 'inactive', label: 'Not in your plan' }
}

export function PlanUsageTab() {
  const ents = useQuery<Entitlement[]>({
    queryKey: ['entitlements', 'me'], queryFn: () => portalApi.get<Entitlement[]>('/v1/entitlements/me'),
    staleTime: 60_000,
  })
  const usage = useQuery<UsageLine[]>({
    queryKey: ['entitlements', 'usage', 30], queryFn: () => portalApi.get<UsageLine[]>('/v1/entitlements/usage?days=30'),
    staleTime: 60_000,
  })

  if (ents.isLoading) return <SkeletonCard />
  if (ents.error) return <InlineAlert variant="error">Your plan could not be loaded. Please retry.</InlineAlert>
  if (!ents.data?.length) return <EmptyState title="No modules listed" description="Ficium has not published any modules yet." />

  const used = new Map<string, UsageLine[]>()
  for (const u of usage.data ?? []) used.set(u.module_code, [...(used.get(u.module_code) ?? []), u])

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Modules are added to your plan by Ficium. Usage covers the last 30 days. To change your plan, contact Ficium.
      </p>
      <DataTable headers={['Module', 'Status', 'Billing', 'Valid', 'Used (30 days)']}>
        {ents.data.map((e) => {
          const s = statusOf(e)
          const lines = used.get(e.module_code) ?? []
          return (
            <DataRow key={e.module_code}>
              <Td>
                <div className="font-semibold text-ink">{e.module_name}</div>
                {e.plan_tier && <div className="text-[11px] text-muted">{e.plan_tier} plan</div>}
              </Td>
              <Td><StatusBadge status={s.tone} label={s.label} /></Td>
              <Td>{BILLING_LABELS[e.billing_model] ?? e.billing_model}</Td>
              <Td>{e.entitled ? `${fmtDate(e.valid_from)} – ${e.valid_to ? fmtDate(e.valid_to) : 'open-ended'}` : '—'}</Td>
              <Td>
                {lines.length
                  ? lines.map((l) => `${Number(l.quantity).toLocaleString('en-MU')} ${UNIT_LABELS[l.unit] ?? l.unit}`).join(', ')
                  : e.entitled ? 'None' : '—'}
              </Td>
            </DataRow>
          )
        })}
      </DataTable>
    </div>
  )
}
