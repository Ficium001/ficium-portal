/**
 * Autobid — automatic bidding, run each bank's own way: Ficium-hosted rules, the bank's
 * own decision engine (signed HTTPS, open-banking style), or rules then engine; each
 * auto-bid either approved by a person or sent at once. Four eyes on every rule and
 * every setting; stopping is instant. Licensed per bank (AUTOBID).
 */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { useAutobidPendingCount } from './hooks/useAutobid'
import { AutobidInbox } from './components/AutobidInbox'

const AutobidPage = lazy(() => import('./pages/AutobidPage'))

export const autobidModule: ModuleManifest = {
  id: 'autobid',
  stage: 'origination',
  routes: [{ path: '/autobid', moduleKey: 'inst:autobid', element: <AutobidPage /> }],
  nav: [{ label: 'Autobid', path: '/autobid', iconKey: 'Zap', moduleKeys: ['inst:autobid'], order: 30 }],
  inboxQueues: [{
    key: 'autobid', label: 'Autobid', moduleKey: 'inst:autobid', order: 40,
    element: <AutobidInbox />, useCount: useAutobidPendingCount,
  }],
}
