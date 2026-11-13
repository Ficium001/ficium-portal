/**
 * Offer setup checklist: hidden once complete; shows each item's state; only
 * an admin gets the install button, and installing shows the new state
 * (items waiting on a second admin, not "done").
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import type { OfferSetupStatus } from '../hooks/useDocTemplates'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const role = vi.hoisted(() => ({ value: 'admin' }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})
vi.mock('@/shared/lib/ficiumAuth', () => ({
  getTokenPayload: () => ({ user_role: role.value, sub: 'u1' }),
}))

import { OfferSetupChecklist } from './OfferSetupChecklist'

const item = (key: OfferSetupStatus['items'][number]['key'], state: 'done' | 'waiting' | 'todo',
  action: string | null = null, path: string | null = null) =>
  ({ key, label: key, state, detail: `${key} detail`, action, path })

const FRESH: OfferSetupStatus = {
  complete: false, can_install: true,
  items: [item('second_person', 'done'), item('checker', 'done'),
          item('credit_chain', 'todo', 'install'), item('offer_template', 'todo', 'install')],
}
const INSTALLED: OfferSetupStatus = {
  complete: false, can_install: false,
  items: [item('second_person', 'done'), item('checker', 'done'),
          item('credit_chain', 'waiting', 'Review and activate', '/setup?section=credit-approval'),
          item('offer_template', 'waiting', 'Review template', '/setup?section=documents')],
}

let root: Root
let host: HTMLDivElement
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const text = () => host.textContent ?? ''
const button = (label: string) =>
  [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)

async function render(status: OfferSetupStatus) {
  api.get.mockResolvedValue(status)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><OfferSetupChecklist /></MemoryRouter>
      </QueryClientProvider>,
    )
  })
  await flush()
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
  role.value = 'admin'
})

describe('OfferSetupChecklist', () => {
  it('renders nothing once setup is complete', async () => {
    await render({ ...FRESH, complete: true, can_install: false })
    expect(text()).toBe('')
  })

  it('admin installs; items then wait on a second admin with a link', async () => {
    api.post.mockResolvedValue(INSTALLED)
    await render(FRESH)
    expect(text()).toContain('Get ready to send offers')

    await act(async () => { button('Install standard setup')!.click() })
    await flush()

    expect(api.post).toHaveBeenCalledWith('/institution/offer-setup/install', {})
    expect(button('Install standard setup')).toBeUndefined()
    const links = [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(links).toEqual(['/setup?section=credit-approval', '/setup?section=documents'])
  })

  it('non-admins see who can install instead of the button', async () => {
    role.value = 'analyst'
    await render(FRESH)
    expect(button('Install standard setup')).toBeUndefined()
    expect(text()).toContain('An institution admin can install this.')
  })
})
