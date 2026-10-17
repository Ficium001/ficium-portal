/** Badges come from one request; notifications go through the portal API. */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const get = vi.fn()
const post = vi.fn()
vi.mock('@/shared/lib/portalApi', () => ({
  portalApi: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}))
vi.mock('@/shared/lib/supabase', () => {
  throw new Error('notifications must not use the Supabase client')
})

import { useBadge } from './useBadges'
import {
  getPortalNotifications, getPortalUnreadCount, markAllPortalNotificationsRead,
} from '@/institution/notifications/api/notificationsApi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => { get.mockReset(); post.mockReset() })

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

function Probe({ k, enabled, out }: { k: 'active_deals' | 'live_bids'; enabled: boolean; out: number[] }) {
  out.push(useBadge(k, enabled))
  return null
}

describe('nav badges', () => {
  it('several badges share ONE request', async () => {
    get.mockResolvedValue({ active_deals: 3, live_bids: 2 })
    const qc = new QueryClient()
    const a: number[] = [], b: number[] = []
    const host = document.createElement('div')
    await act(async () => {
      createRoot(host).render(
        <QueryClientProvider client={qc}>
          <Probe k="active_deals" enabled out={a} />
          <Probe k="live_bids" enabled out={b} />
        </QueryClientProvider>)
    })
    await settle()
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/portal/badges')
    expect(a.at(-1)).toBe(3)
    expect(b.at(-1)).toBe(2)
  })

  it('a badge the user may not see is 0, and a null count is 0', async () => {
    get.mockResolvedValue({ active_deals: null, live_bids: 5 })
    const qc = new QueryClient()
    const a: number[] = [], b: number[] = []
    await act(async () => {
      createRoot(document.createElement('div')).render(
        <QueryClientProvider client={qc}>
          <Probe k="active_deals" enabled out={a} />
          <Probe k="live_bids" enabled={false} out={b} />
        </QueryClientProvider>)
    })
    await settle()
    expect(get).toHaveBeenCalledTimes(1)
    expect(a.at(-1)).toBe(0)
    expect(b.at(-1)).toBe(0)
  })
})

describe('notifications', () => {
  it('read and mark through the portal API', async () => {
    get.mockResolvedValueOnce([{ id: 'n1' }]).mockResolvedValueOnce({ unread: 4 })
    post.mockResolvedValue({ ok: true })
    expect(await getPortalNotifications(20)).toEqual([{ id: 'n1' }])
    expect(get).toHaveBeenNthCalledWith(1, '/notifications?limit=20')
    expect(await getPortalUnreadCount()).toBe(4)
    await markAllPortalNotificationsRead()
    expect(post).toHaveBeenCalledWith('/notifications/mark-all-read', {})
  })
})
