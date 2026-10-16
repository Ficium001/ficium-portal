/** Team — configuration. Users and their groups (roles). */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionUsers = lazy(() => import('./pages/InstitutionUsers'))

export const teamModule: ModuleManifest = {
  id: 'team',
  stage: 'configuration',
  setupSections: [{ key: 'team', label: 'Team', moduleKey: 'inst:team', order: 50, element: <InstitutionUsers /> }],
}
