/** Institution — configuration: profile, compliance documents, API keys, webhooks. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionSettings = lazy(() => import('./pages/InstitutionSettings'))

export const settingsModule: ModuleManifest = {
  id: 'settings',
  stage: 'configuration',
  setupSections: [{ key: 'institution', label: 'Institution', moduleKey: 'inst:settings', order: 10, element: <InstitutionSettings /> }],
}
