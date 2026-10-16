/** Benefits — configuration. Perks attached to this institution's bids. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionBenefits = lazy(() => import('./pages/InstitutionBenefits'))

export const benefitsModule: ModuleManifest = {
  id: 'benefits',
  stage: 'configuration',
  setupSections: [{ key: 'benefits', label: 'Benefits', moduleKey: 'inst:benefits', order: 30, element: <InstitutionBenefits /> }],
}
