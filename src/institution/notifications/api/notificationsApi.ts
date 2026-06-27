// =============================================================
// Ficium — Institution Portal Notifications API
// Reads from portal_notifications table in Portal DB.
// Falls back gracefully if table doesn't exist yet.
// =============================================================
import { db } from '@/shared/lib/supabase'
import type { PortalNotification } from '../types/notifications'

const notifDb = db('public')

export async function getPortalNotifications(limit = 50): Promise<PortalNotification[]> {
  try {
    const { data, error } = await notifDb
      .from('portal_notifications')
      .select('id, kind, title, body, link, read_at, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []
    return data as PortalNotification[]
  } catch {
    return []
  }
}

export async function getPortalUnreadCount(): Promise<number> {
  try {
    const { count, error } = await notifDb
      .from('portal_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function markPortalNotificationRead(id: string): Promise<void> {
  try {
    await notifDb
      .from('portal_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null)
  } catch { /* silent */ }
}

export async function markAllPortalNotificationsRead(): Promise<void> {
  try {
    await notifDb
      .from('portal_notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
  } catch { /* silent */ }
}

export function portalTimeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })
}
