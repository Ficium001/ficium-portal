import { useBadge } from '@/app/registry/useBadges'
/**
 * Internal authorisation — four-eyes on users, keys, webhooks and settings,
 * plus Setup › Controls: which actions need a second person.
 */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionDualControl = lazy(() => import('./pages/InstitutionDualControl'))
const ControlsSetup = lazy(() =>
  import('./components/ControlsSetup').then((m) => ({ default: m.ControlsSetup })))

function usePendingInternal(enabled: boolean): number {
  return useBadge('pending_internal', enabled)
}

export const dualControlModule: ModuleManifest = {
  id: 'dual-control',
  stage: 'authorisation',
  inboxQueues: [{
    key: 'internal', label: 'Team & setup', moduleKey: 'inst:dual_control', order: 30,
    element: <InstitutionDualControl />, useCount: usePendingInternal,
  }],
  setupSections: [{
    key: 'controls', label: 'Controls', moduleKey: 'inst:settings', order: 15,
    element: <ControlsSetup />,
  }],
}
