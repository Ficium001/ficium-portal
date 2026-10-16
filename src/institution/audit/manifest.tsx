/** Audit log — configuration. Who did what, when. */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const InstitutionAudit = lazy(() => import('./pages/InstitutionAudit'))

export const auditModule: ModuleManifest = {
  id: 'audit',
  stage: 'configuration',
  setupSections: [{ key: 'audit', label: 'Audit log', moduleKey: 'inst:audit', order: 60, element: <InstitutionAudit /> }],
}
