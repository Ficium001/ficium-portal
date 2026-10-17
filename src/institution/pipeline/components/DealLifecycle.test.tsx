/**
 * DealLifecycle: steps from the registry, gated by access, state from the deal.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { DealLifecycle } from './DealLifecycle'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'

const allowed = new Set<string>()
vi.mock('@/shared/hooks/useModuleAccess', () => ({
  useModulesAccess: (keys: readonly string[]) => ({
    isLoading: false,
    allowed: Object.fromEntries(keys.map((k) => [k, allowed.has(k)])),
  }),
}))
vi.mock('@/shared/lib/portalApi', () => ({
  portalApi: { get: () => new Promise(() => {}) },
  PortalApiError: class extends Error {},
}))

const deal = (over: Partial<PipelineDetail> = {}) => ({
  id: 'd1', status: 'active', started_at: '2026-10-01T00:00:00Z', completed_at: null,
  stages: [{ id: 's1', status: 'completed' }, { id: 's2', status: 'active' }],
  ...over,
}) as unknown as PipelineDetail

let root: Root
let host: HTMLDivElement
function render(d: PipelineDetail, tabs: string[] = []) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <DealLifecycle deal={d} onOpenTab={() => {}} availableTabs={tabs} />
      </QueryClientProvider>,
    )
  })
}
afterEach(() => { act(() => root.unmount()); host.remove(); allowed.clear() })

const steps = () => [...host.querySelectorAll('li')].map((li) => li.textContent ?? '')

describe('DealLifecycle', () => {
  it('shows every step the user can see, in order', () => {
    for (const k of ['inst:pipeline', 'inst:doctemplates', 'inst:esign', 'inst:booking']) allowed.add(k)
    render(deal())
    const labels = ['Bid accepted', 'Processing', 'Documents', 'Signature', 'Booked']
    expect(steps()).toHaveLength(labels.length)
    labels.forEach((l, i) => expect(steps()[i]).toContain(l))
  })

  it('omits steps for modules the user does not hold', () => {
    allowed.add('inst:pipeline')
    render(deal())
    expect(steps().some((s) => s.includes('Signature'))).toBe(false)
    // The document checklist is part of every deal (inst:pipeline), not a licensed extra.
    expect(steps().some((s) => s.includes('Documents'))).toBe(true)
  })

  it('reports processing progress and marks the current step', () => {
    allowed.add('inst:pipeline')
    render(deal())
    expect(host.textContent).toContain('1/2 stages')
    expect(host.querySelector('[aria-current=step]')?.textContent).toContain('Processing')
  })

  it('a fully processed deal waits on booking', () => {
    for (const k of ['inst:pipeline', 'inst:booking']) allowed.add(k)
    render(deal({ status: 'completed', completed_at: '2026-10-10T00:00:00Z',
      stages: [{ id: 's1', status: 'completed' }] as PipelineDetail['stages'] }))
    expect(host.querySelector('[aria-current=step]')?.textContent).toContain('Booked')
    expect(host.textContent).toContain('Record reference')
  })

  it('without the booking module, processing is the last step and is done', () => {
    allowed.add('inst:pipeline')
    render(deal({ status: 'completed', completed_at: '2026-10-10T00:00:00Z',
      stages: [{ id: 's1', status: 'completed' }] as PipelineDetail['stages'] }))
    expect(host.querySelector('[aria-current=step]')).toBeNull()
    expect(host.textContent).not.toContain('Booked')
  })

  it('makes a step clickable only when its tab is available', () => {
    allowed.add('inst:pipeline')
    render(deal(), ['overview'])
    expect(host.querySelectorAll('li button').length).toBe(2) // accepted + processing open overview
  })
})
