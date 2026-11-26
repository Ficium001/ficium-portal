/**
 * Autobid page: unlicensed banks see a plain message; licensed banks see their
 * setting, can stop autobid at once, and a setting change shows what it changes.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})

import AutobidPage from './AutobidPage'
import { changeRows } from '../components/SetupPanel'
import { PortalApiError } from '@/shared/lib/portalApi'
import type { AutobidOverview, ConfigFields } from '../types'

const CFG: ConfigFields = {
  enabled: true, decision_mode: 'rules', approval_mode: 'queue_for_approval', engine_url: null,
  engine_timeout_ms: 5000, engine_failure_mode: 'skip', max_bids_per_day: 20, max_amount_per_day: 10_000_000,
  product_codes: null,
}
const OVERVIEW: AutobidOverview = {
  config: { ...CFG, engine_secret_set_at: null, version: 3, updated_at: null },
  pending_change: null, active_rules: 2,
  me: { member_id: 'm1', may_approve: true, is_admin: true },
  vocabulary: { fields: [{ field: 'product', kind: 'str', ops: ['eq', 'in'] },
                         { field: 'risk_tier', kind: 'tier', ops: ['eq', 'gte', 'in', 'lte'] }],
                products: ['personal_loan', 'mortgage'], risk_tiers: ['A', 'B', 'C', 'D'] },
  decision_contract: 'autobid.decision.v1',
}
const SUMMARY = { today: { bid_placed: 3 }, bids_today: 3, amount_today: 900000, max_bids_per_day: 20,
                  max_amount_per_day: 10_000_000, enabled: true }

let root: Root
let host: HTMLDivElement
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await flush()
  expect(check()).toBe(true)
}
async function render() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => {
    root.render(<QueryClientProvider client={qc}><MemoryRouter><AutobidPage /></MemoryRouter></QueryClientProvider>)
  })
  await flush()
}
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

beforeEach(() => { api.get.mockReset(); api.post.mockReset() })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('AutobidPage', () => {
  it('says plainly when the bank is not licensed', async () => {
    api.get.mockRejectedValue(new PortalApiError(403, 'Module is not licensed for this institution.'))
    await render()
    await until(() => !!host.textContent?.includes('not part of your plan'))
  })

  it('shows the live setting and today against the limits', async () => {
    api.get.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/summary') ? SUMMARY : OVERVIEW))
    await render()
    await until(() => !!host.textContent?.includes('Autobid is on'))
    expect(host.textContent).toContain('Ficium rules')
    expect(host.textContent).toContain('2 active rules')
    await until(() => !!host.textContent?.includes('3 / 20'))
  })

  it('stops autobid at once from the overview', async () => {
    api.get.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/summary') ? SUMMARY : OVERVIEW))
    api.post.mockResolvedValue({ enabled: false })
    await render()
    await until(() => !!button('Stop autobid now'))
    act(() => { button('Stop autobid now')!.click() })
    await until(() => !!button('Stop now'))
    await act(async () => { button('Stop now')!.click() })
    await flush()
    expect(api.post).toHaveBeenCalledWith('/v1/autobid/config/pause', {})
  })
})

describe('changeRows', () => {
  it('lists only what changes, in plain words', () => {
    const rows = changeRows(CFG, { ...CFG, approval_mode: 'pre_approved', product_codes: ['mortgage'] })
    expect(rows).toEqual([
      { field: 'Approval', before: 'A person approves every auto-bid', after: 'Send at once' },
      { field: 'Products', before: 'Every product you have enabled', after: 'Mortgage' },
    ])
  })
})
