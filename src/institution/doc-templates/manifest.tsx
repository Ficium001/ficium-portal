/**
 * Document templates — the designer for offer letters and agreements.
 * Generated documents appear on the deal's Documents tab (deals module).
 */
import { lazy } from 'react'
import type { ModuleManifest } from '@/app/registry/types'

const DocTemplates = lazy(() => import('./pages/DocTemplates'))

export const docTemplatesModule: ModuleManifest = {
  id: 'doc-templates',
  stage: 'configuration',
  setupSections: [{
    key: 'documents', label: 'Document templates', moduleKey: 'inst:doctemplates', order: 40,
    element: <DocTemplates />,
  }],
}
