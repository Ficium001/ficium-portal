/**
 * FlowBar — the lending lifecycle as a strip under the top bar, with how much
 * work waits at each step:
 *
 *   Open requests 12 › Live bids 4 › To authorise 2 › Deals in progress 3 › Awaiting signature 1
 *
 * Steps come from the module registry (manifest.flowSteps), in lifecycle
 * order, and show only if the user holds the step's module key. The step for
 * the current page is highlighted, so users always see where they are in the
 * flow and where work is piling up.
 */
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { FLOW_STEPS, FLOW_COUNTABLES } from '@/app/registry'
import { useCounts } from '@/app/registry/useCounts'
import { useModulesAccess } from '@/shared/hooks/useModuleAccess'

const FLOW_KEYS = [...new Set(FLOW_STEPS.flatMap((s) => s.moduleKeys))]

export function FlowBar() {
  const { pathname } = useLocation()
  const access = useModulesAccess(FLOW_KEYS)
  const counts = useCounts(FLOW_COUNTABLES)

  const steps = FLOW_STEPS.filter((s) => s.moduleKeys.some((k) => access.allowed[k]))
  if (access.isLoading || steps.length < 2) return null

  // Several steps can share a page (deals, signatures); highlight the first match.
  const current = steps.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))?.key

  return (
    <nav aria-label="Lending flow" className="border-b border-line bg-white/70 backdrop-blur-sm">
      <ol className="flex items-center gap-1 overflow-x-auto px-4 lg:px-8 py-2 max-w-[1440px] mx-auto">
        {steps.map((s, i) => {
          const n = counts[s.key] ?? 0
          const isCurrent = s.key === current
          return (
            <li key={s.key} className="flex items-center shrink-0">
              <NavLink
                to={s.path}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ficium/40',
                  isCurrent ? 'bg-ficium/8 text-ficium font-semibold' : 'text-muted hover:text-ink hover:bg-ink/4',
                ].join(' ')}
              >
                <span>{s.label}</span>
                <span
                  className={[
                    'min-w-[20px] text-center text-[11px] font-bold rounded-full px-1.5 py-0.5 tabular-nums',
                    n > 0 ? 'bg-ficium text-white' : 'bg-ink/6 text-muted',
                  ].join(' ')}
                >
                  {n}
                </span>
              </NavLink>
              {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-line shrink-0" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
