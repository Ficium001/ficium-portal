/** Analytics — reporting on bidding and deal performance. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionAnalytics = lazy(() => import('./pages/InstitutionAnalytics'))

export const analyticsModule: ModuleManifest = {
  id: 'analytics',
  stage: 'reporting',
  routes: [{ path: '/analytics', moduleKey: 'inst:analytics', element: <InstitutionAnalytics /> }],
  nav: [{ label: 'Analytics', path: '/analytics', iconKey: 'BarChart2', moduleKeys: ['inst:analytics'], order: 10 }],
}
