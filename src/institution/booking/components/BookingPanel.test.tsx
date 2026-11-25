/**
 * BookingPanel: gated on processing being complete; records via POST,
 * corrects via PUT; shows server rule messages.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})

import { BookingPanel } from './BookingPanel'
import { PortalApiError } from '@/shared/lib/portalApi'

const deal = (over: Partial<PipelineDetail> = {}) => ({
  id: 'd1', status: 'completed', deal_amount: 1_000_000, started_at: '2026-08-03T00:00:00Z', ...over,
}) as unknown as PipelineDetail

const BOOKED = {
  pipeline_id: 'd1', core_reference: 'LN-77', booked_on: '2026-10-10', disbursed_amount: 900000,
  disbursed_on: null, notes: null, source: 'api', corrected_count: 0,
  created_at: '', updated_at: '', recorded_by_name: null,
}

let root: Root
let host: HTMLDivElement
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await flush()
  expect(check()).toBe(true)
}

async function render(d: PipelineDetail) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => { root.render(<QueryClientProvider client={qc}><BookingPanel deal={d} /></QueryClientProvider>) })
  await flush()
}
const input = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement
function type(label: string, value: string) {
  const el = input(label)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.put.mockReset() })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('BookingPanel', () => {
  it('explains that booking waits for processing', async () => {
    await render(deal({ status: 'active' }))
    expect(host.textContent).toContain('Booking opens once every processing stage is complete')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('offers the form when not booked, prefilled with the deal amount', async () => {
    api.get.mockRejectedValue(new PortalApiError(404, 'No booking recorded yet.'))
    await render(deal())
    await until(() => !!input('Disbursed amount'))
    expect(input('Disbursed amount').value).toBe('1000000')
    expect(button('Record booking').disabled).toBe(true) // no reference yet
  })

  it('records the booking with POST', async () => {
    api.get.mockRejectedValue(new PortalApiError(404, 'x'))
    api.post.mockResolvedValue(BOOKED)
    await render(deal())
    await until(() => !!input('Core banking reference'))
    type('Core banking reference', ' LN-77 ')
    act(() => button('Record booking').click())
    await until(() => (host.textContent ?? '').includes('Booked in core banking'))
    expect(api.post).toHaveBeenCalledWith('/pipelines/d1/booking', expect.objectContaining({
      core_reference: 'LN-77', disbursed_amount: 1000000, disbursed_on: null,
    }))
    expect(host.textContent).toContain('Booked in core banking')
  })

  it("shows the server's rule message", async () => {
    api.get.mockRejectedValue(new PortalApiError(404, 'x'))
    api.post.mockRejectedValue(new PortalApiError(409, 'That core banking reference is already used by another deal.'))
    await render(deal())
    await until(() => !!input('Core banking reference'))
    type('Core banking reference', 'LN-1')
    act(() => button('Record booking').click())
    await until(() => (host.textContent ?? '').includes('already used'))
    expect(host.textContent).toContain('already used by another deal')
  })

  it('shows the record and corrects it with PUT', async () => {
    api.get.mockResolvedValue(BOOKED)
    api.put.mockResolvedValue({ ...BOOKED, core_reference: 'LN-78', corrected_count: 1 })
    await render(deal())
    await until(() => (host.textContent ?? '').includes('LN-77'))
    expect(host.textContent).toContain('Core banking API')
    act(() => button('Correct').click())
    type('Core banking reference', 'LN-78')
    act(() => button('Save correction').click())
    await until(() => api.put.mock.calls.length > 0)
    expect(api.put).toHaveBeenCalledWith('/pipelines/d1/booking', expect.objectContaining({ core_reference: 'LN-78' }))
  })

  it('asks for the monthly amount when the commission needs it, and sends it', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/requirements')) return { pipeline_id: 'd1', requires: { monthly_amount: true, term_months: false } }
      throw new PortalApiError(404, 'x')
    })
    api.post.mockResolvedValue({ ...BOOKED, monthly_amount: 500 })
    await render(deal({ deal_amount: 1000 }))
    await until(() => !!input('Monthly amount'))
    expect(host.textContent).toContain('First amount paid in')
    type('Core banking reference', 'SP-1')
    expect(button('Record booking').disabled).toBe(true) // monthly amount still empty
    type('Monthly amount', '500')
    act(() => button('Record booking').click())
    await until(() => api.post.mock.calls.length > 0)
    expect(api.post).toHaveBeenCalledWith('/pipelines/d1/booking', expect.objectContaining({
      disbursed_amount: 1000, monthly_amount: 500, term_months: null,
    }))
  })

  it('asks for the term on a term product, prefilled from the deal', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/requirements')) return { pipeline_id: 'd1', requires: { monthly_amount: false, term_months: true } }
      throw new PortalApiError(404, 'x')
    })
    await render(deal({ deal_term_months: 36 } as Partial<PipelineDetail>))
    await until(() => !!input('Term in months'))
    expect(input('Term in months').value).toBe('36')
    expect(input('Monthly amount')).toBeNull()
  })

  it('records a closure, after which the booking cannot be corrected', async () => {
    api.get.mockResolvedValue(BOOKED)
    api.post.mockResolvedValue({ ...BOOKED, closed_on: '2026-11-20', closure_reason: 'client stopped the plan', closed_source: 'portal' })
    await render(deal())
    await until(() => (host.textContent ?? '').includes('LN-77'))
    act(() => button('Record closure').click())
    await until(() => !!host.querySelector('[aria-label="Closure reason"]'))
    expect(host.textContent).toContain("It can't be undone")
    const reason = host.querySelector('[aria-label="Closure reason"]') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => { setter.call(reason, 'client stopped the plan'); reason.dispatchEvent(new Event('input', { bubbles: true })) })
    const buttons = [...host.querySelectorAll('button')].filter((b) => b.textContent?.includes('Record closure'))
    act(() => buttons[buttons.length - 1]!.click())
    await until(() => (host.textContent ?? '').includes('Booked, now closed'))
    expect(api.post).toHaveBeenCalledWith('/pipelines/d1/booking/closure', { closed_on: expect.any(String), reason: 'client stopped the plan' })
    expect(button('Correct')).toBeUndefined()
    expect(host.textContent).toContain('client stopped the plan')
  })
})
