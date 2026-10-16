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
})
