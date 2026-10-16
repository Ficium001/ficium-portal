/**
 * @page InstitutionSetup
 * @route /setup
 * @description
 *   How the institution is configured, in one place. Each tab is the existing
 *   screen, unchanged:
 *     Institution         — profile, SLAs, compliance docs, API keys, webhooks,
 *                           approval chains, pipeline templates   (inst:settings)
 *     Products            — product catalogue                      (inst:products)
 *     Benefits            — perks shown on your bids               (inst:benefits)
 *     Document templates  — offer letter / agreement templates     (inst:doctemplates)
 *     Team                — users and groups                       (inst:team)
 *     Audit log           — who did what                           (inst:audit)
 *   Old routes redirect here with ?section=.
 */
import { lazy } from 'react'
import { HubPage, type HubSection } from '@/shared/components/HubPage'

const InstitutionSettings = lazy(() => import('@/institution/settings/pages/InstitutionSettings'))
const InstitutionProducts = lazy(() => import('@/institution/products/pages/InstitutionProducts'))
const InstitutionBenefits = lazy(() => import('@/institution/benefits/pages/InstitutionBenefits'))
const DocTemplates        = lazy(() => import('@/institution/doc-templates/pages/DocTemplates'))
const InstitutionUsers    = lazy(() => import('@/institution/team/pages/InstitutionUsers'))
const InstitutionAudit    = lazy(() => import('@/institution/audit/pages/InstitutionAudit'))

type Section = 'institution' | 'products' | 'benefits' | 'documents' | 'team' | 'audit'

const SECTIONS: HubSection<Section>[] = [
  { key: 'institution', label: 'Institution',        moduleKey: 'inst:settings',     element: <InstitutionSettings /> },
  { key: 'products',    label: 'Products',           moduleKey: 'inst:products',     element: <InstitutionProducts /> },
  { key: 'benefits',    label: 'Benefits',           moduleKey: 'inst:benefits',     element: <InstitutionBenefits /> },
  { key: 'documents',   label: 'Document templates', moduleKey: 'inst:doctemplates', element: <DocTemplates /> },
  { key: 'team',        label: 'Team',               moduleKey: 'inst:team',         element: <InstitutionUsers /> },
  { key: 'audit',       label: 'Audit log',          moduleKey: 'inst:audit',        element: <InstitutionAudit /> },
]

export default function InstitutionSetup() {
  return (
    <HubPage
      title="Setup"
      subtitle="How your institution works on Ficium: products, templates, team and integrations."
      idPrefix="setup"
      sections={SECTIONS}
      emptyText="Your role has no setup access. Ask your institution admin for changes."
    />
  )
}
