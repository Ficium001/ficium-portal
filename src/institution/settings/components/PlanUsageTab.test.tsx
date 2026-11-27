/** Plan & usage: licensed modules show status, validity and 30-day usage; others say "Not in your plan". */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => ({ portalApi: api, PortalApiError: class extends Error {} }))

import { PlanUsageTab, statusOf, type Entitlement } from './PlanUsageTab'

const base: Entitlement = { module_code: 'AUTOBID', module_name: 'Autobid', billing_model: 'metered',
  metered_unit: 'executed_bid', entitled: true, status: 'active', plan_tier: 'Pro',
  valid_from: '2026-11-01', valid_to: null, limits: {} }

let root: Root; let el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove(); vi.resetAllMocks() })

async function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => { root.render(<QueryClientProvider client={qc}><PlanUsageTab /></QueryClientProvider>) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('PlanUsageTab', () => {
  it('shows each module with its status and usage', async () => {
    api.get.mockImplementation((p: string) => Promise.resolve(p.includes('usage')
      ? [{ module_code: 'AUTOBID', unit: 'executed_bid', quantity: 42 }]
      : [base, { ...base, module_code: 'ESIGN', module_name: 'E-signature', entitled: false, status: null, plan_tier: null }]))
    await render()
    const text = el.textContent ?? ''
    expect(text).toContain('Autobid')
    expect(text).toContain('42 auto-bids')
    expect(text).toContain('open-ended')
    expect(text).toContain('Not in your plan')
    expect(text).toContain('Pay per use')
  })

  it('says so when the plan cannot load', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    await render()
    expect(el.textContent).toContain('could not be loaded')
  })

  it('maps statuses to plain words', () => {
    expect(statusOf({ ...base, status: 'trial' }).label).toBe('Trial')
    expect(statusOf({ ...base, status: 'suspended' }).label).toBe('Suspended')
    expect(statusOf({ ...base, status: 'expired' }).label).toBe('Ended')
  })
})
