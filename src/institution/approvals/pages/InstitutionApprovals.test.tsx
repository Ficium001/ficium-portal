/**
 * Approvals queue: four lifecycle tabs; expired is never pending; your own
 * submissions wait on others and offer no Approve/Reject; counts are the server's.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import type { PendingAction, ApprovalQueueState } from '@/institution/types/institution'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})

import InstitutionApprovals from './InstitutionApprovals'

const HOUR = 3_600_000
const action = (over: Partial<PendingAction>): PendingAction => ({
  id: 'a1b2c3d4-0000-0000-0000-000000000000', action_category: 'bid.submit',
  action_status: 'pending', maker_id: 'm-other', maker_role: 'maker',
  initiated_at: new Date(Date.now() - 24 * HOUR).toISOString(),
  created_at: new Date(Date.now() - 24 * HOUR).toISOString(),
  expires_at: new Date(Date.now() + 48 * HOUR).toISOString(),
  resource_type: 'institution_bids', payload: {}, is_mine: false, ...over,
})

let root: Root
let host: HTMLDivElement
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function render(byState: Partial<Record<ApprovalQueueState, PendingAction[]>>,
  counts = { pending: 0, expired: 0, approved: 0, rejected: 0, needs_me: 0 }) {
  api.get.mockImplementation(async (url: string) => {
    if (url.includes('/queue/counts')) return counts
    const state = /state=(\w+)/.exec(url)![1] as ApprovalQueueState
    const items = byState[state] ?? []
    return { items, total: items.length }
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => { root.render(<QueryClientProvider client={qc}><InstitutionApprovals /></QueryClientProvider>) })
  for (let i = 0; i < 10; i++) await flush()
}
const tab = (name: string) =>
  [...host.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith(name)) as HTMLButtonElement
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
async function open(name: string) {
  act(() => { tab(name).click() })
  for (let i = 0; i < 10; i++) await flush()
}

afterEach(() => { act(() => root.unmount()); host.remove(); api.get.mockReset() })

describe('Approvals queue', () => {
  it('shows the four lifecycle tabs with the server counts; Pending counts what you can decide', async () => {
    await render({}, { pending: 3, expired: 4, approved: 9, rejected: 1, needs_me: 2 })
    // label and count render as adjacent spans, so textContent has no separator
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim()))
      .toEqual(['Pending2', 'Expired4', 'Authorised9', 'Rejected1'])
    expect(host.textContent).toContain('2 need your decision')
  })

  it('pending: Approve and Reject only on items you did not initiate', async () => {
    await render({ pending: [
      action({ id: 'theirs-0000', is_mine: false }),
      action({ id: 'mine-00000', is_mine: true }),
    ] })
    expect(host.textContent).toContain('Needs your decision')
    expect(host.textContent).toContain('Waiting on others')
    expect(host.textContent).toContain("You can't approve your own action")
    expect([...host.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Approve')).toHaveLength(1)
  })

  it('expired items are read-only and say when they expired', async () => {
    await render({ expired: [action({
      action_status: 'expired', expires_at: new Date(Date.now() - 100 * 24 * HOUR).toISOString(),
    })] })
    await open('Expired')
    expect(host.textContent).toMatch(/Expired .* ago/)
    expect(button('Approve')).toBeUndefined()
    expect(button('Reject')).toBeUndefined()
  })

  it('does not raise the "expiring within 4 hours" banner for an expired item', async () => {
    await render({ pending: [], expired: [action({
      action_status: 'expired', expires_at: new Date(Date.now() - HOUR).toISOString(),
    })] })
    expect(host.textContent).not.toContain('expiring within 4 hours')
  })

  it('authorised and rejected show the decision and are read-only', async () => {
    await render({
      approved: [action({ action_status: 'approved', checker_role: 'checker', checked_at: new Date().toISOString() })],
      rejected: [action({ action_status: 'rejected', checker_note: 'Rate too low' })],
    })
    await open('Authorised')
    expect(host.textContent).toContain('Authorised')
    expect(button('Approve')).toBeUndefined()
    await open('Rejected')
    expect(host.textContent).toContain('Rejected')
    expect(button('Reject')).toBeUndefined()
  })

  it('asks the server for the tab you open, scoped to bids', async () => {
    await render({})
    await open('Expired')
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/approvals/queue?scope=bids&state=expired'))
  })
})
