/**
 * FlowBar renders the registry's steps in lifecycle order, only for modules
 * the user holds, and highlights the step for the current page.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { FlowBar } from './FlowBar'

const allowed = new Set<string>()
vi.mock('@/shared/hooks/useModuleAccess', () => ({
  useModulesAccess: (keys: readonly string[]) => ({
    isLoading: false,
    allowed: Object.fromEntries(keys.map((k) => [k, allowed.has(k)])),
  }),
}))
// Queries never resolve in tests; counts render as 0.
vi.mock('@/shared/lib/portalApi', () => ({
  portalApi: { get: () => new Promise(() => {}) },
  PortalApiError: class extends Error {},
}))

let root: Root
let host: HTMLDivElement

function render(path: string) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}><FlowBar /></MemoryRouter>
      </QueryClientProvider>,
    )
  })
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  allowed.clear()
})

const labels = () => [...host.querySelectorAll('li a span:first-child')].map((s) => s.textContent)

describe('FlowBar', () => {
  it('shows the full lending flow, in lifecycle order, for a full-access user', () => {
    for (const k of ['inst:marketplace', 'inst:bids', 'inst:bid_approval', 'inst:pipeline', 'inst:esign']) allowed.add(k)
    render('/dashboard')
    expect(labels()).toEqual(['Open requests', 'Live bids', 'To authorise', 'Deals in progress', 'Awaiting signature'])
  })

  it('hides steps for modules the user does not hold', () => {
    for (const k of ['inst:pipeline', 'inst:esign']) allowed.add(k)
    render('/dashboard')
    expect(labels()).toEqual(['Deals in progress', 'Awaiting signature'])
  })

  it('highlights the step for the current page, including deal detail pages', () => {
    for (const k of ['inst:marketplace', 'inst:pipeline']) allowed.add(k)
    render('/deals/123')
    expect(host.querySelector('[aria-current=step]')?.textContent).toContain('Deals in progress')
  })

  it('renders nothing when fewer than two steps apply', () => {
    allowed.add('inst:analytics')
    render('/analytics')
    expect(host.querySelector('nav')).toBeNull()
  })
})
