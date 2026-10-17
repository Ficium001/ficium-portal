// =============================================================
// Ficium — Institution Portal Notifications API
// Through ficium-portal-api. Portal users sign in with ficium-auth, so a
// direct Supabase read had no session and returned 401 (every 30 s).
// =============================================================
import { portalApi } from '@/shared/lib/portalApi'
import type { PortalNotification } from '../types/notifications'

export const getPortalNotifications = (limit = 50) =>
  portalApi.get<PortalNotification[]>(`/notifications?limit=${limit}`)

export const getPortalUnreadCount = async (): Promise<number> =>
  (await portalApi.get<{ unread: number }>('/notifications/unread-count')).unread

export const markPortalNotificationRead = (id: string) =>
  portalApi.post<{ ok: boolean }>(`/notifications/${id}/mark-read`, {})

export const markAllPortalNotificationsRead = () =>
  portalApi.post<{ ok: boolean }>('/notifications/mark-all-read', {})

export function portalTimeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })
}
