// =============================================================
// Ficium — Institution Portal Notifications Hooks
// Module: inst:notifications — self-contained
// =============================================================
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPortalNotifications,
  getPortalUnreadCount,
  markPortalNotificationRead,
  markAllPortalNotificationsRead,
} from '../api/notificationsApi'
import type { PortalNotification } from '../types/notifications'

export const NOTIF_QK = {
  list:   ['portal-notifications', 'list']       as const,
  unread: ['portal-notifications', 'unread']     as const,
}

function getPollInterval(): number {
  if (typeof document === 'undefined') return 30_000
  return document.visibilityState === 'visible' ? 30_000 : 5 * 60_000
}

// ── Unread count — visibility-aware polling ───────────────────
export function usePortalUnreadCount() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: NOTIF_QK.unread })
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [queryClient])

  return useQuery({
    queryKey:             NOTIF_QK.unread,
    queryFn:              getPortalUnreadCount,
    refetchInterval:      getPollInterval,
    refetchOnWindowFocus: true,
    staleTime:            25_000,
  })
}

// ── Full list ────────────────────────────────────────────────
export function usePortalNotifications() {
  return useQuery<PortalNotification[]>({
    queryKey: NOTIF_QK.list,
    queryFn:  () => getPortalNotifications(),
    staleTime: 30_000,
  })
}

// ── Mark one read ────────────────────────────────────────────
export function useMarkPortalNotifRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => markPortalNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NOTIF_QK.list })
      const previous = queryClient.getQueryData<PortalNotification[]>(NOTIF_QK.list)
      const now = new Date().toISOString()
      queryClient.setQueryData<PortalNotification[]>(
        NOTIF_QK.list,
        old => old?.map(n => n.id === id ? { ...n, read_at: now } : n) ?? [],
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(NOTIF_QK.list, ctx?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIF_QK.unread })
    },
  })
}

// ── Mark all read ────────────────────────────────────────────
export function useMarkAllPortalNotifsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAllPortalNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIF_QK.list })
      const previous = queryClient.getQueryData<PortalNotification[]>(NOTIF_QK.list)
      const now = new Date().toISOString()
      queryClient.setQueryData<PortalNotification[]>(
        NOTIF_QK.list,
        old => old?.map(n => n.read_at ? n : { ...n, read_at: now }) ?? [],
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(NOTIF_QK.list, ctx?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIF_QK.unread })
    },
  })
}
