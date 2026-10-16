/**
 * HubPage — one page that gathers several module pages under tabs.
 *
 * Each section is an existing module page rendered in embedded mode (no
 * own <main> or title; see shared/lib/embedded). A section shows only if
 * the user's group and the institution's plan include its module key,
 * using the same rule as RequireModule. The active section is ?section=,
 * so old routes can redirect straight to the right tab.
 */
import { Suspense, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SectionTabs, type SectionTab } from '@/shared/components/SectionTabs'
import { EmbeddedContext } from '@/shared/lib/embedded'
import { useModulesAccess } from '@/shared/hooks/useModuleAccess'

export interface HubSection<K extends string> {
  key:       K
  label:     string
  moduleKey: string
  badge?:    string
  element:   ReactNode
}

function PanelFallback() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-20 rounded-card bg-ink/4 animate-pulse" />
      <div className="h-20 rounded-card bg-ink/4 animate-pulse" />
    </div>
  )
}

export function HubPage<K extends string>({
  title, subtitle, idPrefix, sections, emptyText,
}: {
  title:     string
  subtitle:  string
  idPrefix:  string
  sections:  HubSection<K>[]
  emptyText: string
}) {
  const [params, setParams] = useSearchParams()
  const access  = useModulesAccess(sections.map((s) => s.moduleKey))
  const visible = sections.filter((s) => access.allowed[s.moduleKey])

  const requested = params.get('section')
  const active    = visible.find((s) => s.key === requested) ?? visible[0]

  const setSection = (key: K) => {
    const next = new URLSearchParams()
    if (key !== visible[0]?.key) next.set('section', key)
    setParams(next, { replace: true })
  }

  const tabs: SectionTab<K>[] = visible.map(({ key, label, badge }) => ({ key, label, badge }))

  return (
    <main className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-bold text-ink tracking-tight">{title}</h1>
        <p className="text-[13px] text-muted mt-1">{subtitle}</p>
      </div>

      {access.isLoading ? (
        <PanelFallback />
      ) : !active ? (
        <p className="text-[13px] text-muted py-10 text-center">{emptyText}</p>
      ) : (
        <>
          {tabs.length > 1 && (
            <SectionTabs tabs={tabs} active={active.key} onChange={setSection}
                         idPrefix={idPrefix} label={`${title} sections`} />
          )}
          <div role={tabs.length > 1 ? 'tabpanel' : undefined}
               id={`${idPrefix}-panel-${active.key}`}
               aria-labelledby={tabs.length > 1 ? `${idPrefix}-tab-${active.key}` : undefined}>
            <EmbeddedContext.Provider value={true}>
              <Suspense fallback={<PanelFallback />}>{active.element}</Suspense>
            </EmbeddedContext.Provider>
          </div>
        </>
      )}
    </main>
  )
}
