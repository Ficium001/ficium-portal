/**
 * @page InstitutionSetup
 * @route /setup
 * @description
 *   Configuration (core banking "maintenance"): products, templates, team,
 *   integrations, audit. Sections are contributed by modules
 *   (manifest.setupSections); this page only lays them out.
 */
import { HubPage, type HubSection } from '@/shared/components/HubPage'
import { SETUP_SECTIONS } from '@/app/registry/select'

const SECTIONS: HubSection<string>[] = SETUP_SECTIONS.map(({ key, label, moduleKey, element }) => ({
  key, label, moduleKey, element,
}))

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
