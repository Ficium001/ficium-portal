/** Internal authorisation — four-eyes on users, keys, webhooks and settings. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'
import { usePendingActions } from '@/institution/hooks/useInstitution'

const InstitutionDualControl = lazy(() => import('./pages/InstitutionDualControl'))

function usePendingInternal(enabled: boolean): number {
  const { data } = usePendingActions('internal', { enabled })
  return (data ?? []).filter((a) => a.action_status === 'pending').length
}

export const dualControlModule: ModuleManifest = {
  id: 'dual-control',
  stage: 'authorisation',
  inboxQueues: [{
    key: 'internal', label: 'Team & setup', moduleKey: 'inst:dual_control', order: 30,
    element: <InstitutionDualControl />, useCount: usePendingInternal,
  }],
}
