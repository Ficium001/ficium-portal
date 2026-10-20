/**
 * Setup › Controls: locked rows can't be switched, switching off asks for a
 * second admin, switching on is immediate, waiting rows offer "Keep on",
 * non-admins see the switches read-only.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import type { FourEyesControl } from '../types'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})

import { ControlsSetup } from './ControlsSetup'

const row = (over: Partial<FourEyesControl>): FourEyesControl => ({
  category: 'benefit.create', label: 'Add a benefit', screen: 'Setup › Products',
  locked: false, locked_reason: null, enabled: true, can_change: true,
  changed_at: null, pending_disable_action_id: null, ...over,
})

let root: Root
let host: HTMLDivElement
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function render(rows: FourEyesControl[]) {
  api.get.mockResolvedValue(rows)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => { root.render(<QueryClientProvider client={qc}><ControlsSetup /></QueryClientProvider>) })
  for (let i = 0; i < 10; i++) await flush()
}
const sw = (label: string) =>
  host.querySelector(`[role="switch"][aria-label="Four-eyes for ${label}"]`) as HTMLButtonElement
const button = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => { api.get.mockReset(); api.post.mockReset() })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('ControlsSetup', () => {
  it('shows locked controls as on, disabled, with the reason', async () => {
    await render([row({ category: 'user.create', label: 'Add a user', locked: true,
      locked_reason: 'Who can access the bank’s portal always needs a second person.' })])
    expect(sw('Add a user').getAttribute('aria-checked')).toBe('true')
    expect(sw('Add a user').disabled).toBe(true)
    expect(host.textContent).toContain('always needs a second person')
  })

  it('switching off asks for confirmation, then sends it to a second admin', async () => {
    api.post.mockResolvedValue({ status: 'pending_approval' })
    await render([row({})])
    act(() => { sw('Add a benefit').click() })
    expect(api.post).not.toHaveBeenCalled()
    act(() => { button('Send for approval')!.click() })
    await flush()
    expect(api.post).toHaveBeenCalledWith('/controls/four-eyes/benefit.create/disable', {})
  })

  it('switching on applies immediately', async () => {
    api.post.mockResolvedValue({ enabled: true })
    await render([row({ enabled: false })])
    act(() => { sw('Add a benefit').click() })
    await flush()
    expect(api.post).toHaveBeenCalledWith('/controls/four-eyes/benefit.create/enable', {})
  })

  it('a waiting switch-off can be withdrawn with "Keep on"', async () => {
    api.post.mockResolvedValue({ enabled: true })
    await render([row({ pending_disable_action_id: 'a1' })])
    expect(sw('Add a benefit').disabled).toBe(true)
    expect(host.textContent).toContain('waiting for a second admin')
    act(() => { button('Keep on')!.click() })
    await flush()
    expect(api.post).toHaveBeenCalledWith('/controls/four-eyes/benefit.create/enable', {})
  })

  it('non-admins see the switches read-only', async () => {
    await render([row({ can_change: false })])
    expect(sw('Add a benefit').disabled).toBe(true)
    expect(host.textContent).toContain('Only institution admins can change controls')
  })
})
