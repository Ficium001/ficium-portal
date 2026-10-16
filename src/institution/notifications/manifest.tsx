/** Notifications — opened from the header bell, so no drawer item. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionNotifications = lazy(() => import('./pages/InstitutionNotifications'))

export const notificationsModule: ModuleManifest = {
  id: 'notifications',
  stage: 'home',
  routes: [{ path: '/notifications', moduleKey: 'inst:notifications', element: <InstitutionNotifications /> }],
}
