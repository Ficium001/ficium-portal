/** Approval performance: KPIs and per-stage table; hidden for members without access. */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})

import { ApprovalPerformance, hours } from './ApprovalPerformance'
import { PortalApiError } from '@/shared/lib/portalApi'

let root: Root; let el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove(); vi.resetAllMocks() })

async function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => { root.render(<QueryClientProvider client={qc}><ApprovalPerformance /></QueryClientProvider>) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('ApprovalPerformance', () => {
  it('shows the slowest stage, missed deadlines and lost deals', async () => {
    api.get.mockResolvedValue({
      stage_cycle_times: [
        { template: 'Retail', stage: 'Credit committee', median_hours: 30, sla_breaches: 2, total: 10 },
        { template: 'Retail', stage: 'Analyst', median_hours: 0.5, sla_breaches: 0, total: 12 },
      ],
      lost_in_committee: { deals_lost: 1, amount_lost: '2500000' },
    })
    await render()
    const t = el.textContent ?? ''
    expect(t).toContain('30.0 h')
    expect(t).toContain('Credit committee')
    expect(t).toContain('of 22 stage decisions')
    expect(t).toContain('MUR 2,500,000')
    expect(t).toContain('30 min')
  })

  it('renders nothing for members without approval access', async () => {
    api.get.mockRejectedValue(new PortalApiError(403, 'forbidden'))
    await render()
    expect(el.textContent).toBe('')
  })

  it('formats durations', () => {
    expect(hours(null)).toBe('—')
    expect(hours(72)).toBe('3.0 days')
  })
})
