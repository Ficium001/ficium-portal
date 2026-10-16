/** Products — configuration. Product factory: the lending products this institution offers. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionProducts = lazy(() => import('./pages/InstitutionProducts'))

export const productsModule: ModuleManifest = {
  id: 'products',
  stage: 'configuration',
  setupSections: [{ key: 'products', label: 'Products', moduleKey: 'inst:products', order: 20, element: <InstitutionProducts /> }],
}
