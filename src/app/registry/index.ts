/**
 * The module registry: every installed module, and the views the shell and
 * router need of it. See types.ts for the model.
 */
import { FEATURE_MODULES } from './features'
import { inboxHub, setupHub } from './platform'
import { STAGES } from './stages'
import type { FlowStepContribution, ModuleManifest, NavContribution, RouteContribution, Stage } from './types'
import type { Countable } from './useCounts'

export const MODULES: readonly ModuleManifest[] = [...FEATURE_MODULES, inboxHub, setupHub]

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

export const ROUTES: readonly RouteContribution[] = MODULES.flatMap((m) => m.routes ?? [])

/** Drawer items grouped by lifecycle stage, stages in lifecycle order. */
export const NAV_BY_STAGE: readonly { stage: Stage; label: string; items: NavContribution[] }[] =
  STAGES.map(({ id, label }) => ({
    stage: id,
    label,
    items: MODULES.filter((m) => m.stage === id).flatMap((m) => m.nav ?? []).sort(byOrder),
  })).filter((s) => s.items.length > 0)

/**
 * The flow bar: where work waits, in lifecycle order. The inbox step is the
 * platform's (sum of queues); the others come from features.
 */
export const FLOW_STEPS: readonly (FlowStepContribution & { stage: Stage })[] =
  MODULES.flatMap((m) => (m.flowSteps ?? []).map((s) => ({ ...s, stage: m.stage })))
    .sort((a, b) => STAGES.findIndex((s) => s.id === a.stage) - STAGES.findIndex((s) => s.id === b.stage) || a.order - b.order)

/** Every permission key some module uses — anything else would be orphaned. */
export const USED_MODULE_KEYS: ReadonlySet<string> = new Set(
  MODULES.flatMap((m) => [
    ...(m.routes ?? []).flatMap((r) => (r.moduleKey ? [r.moduleKey] : [])),
    ...(m.nav ?? []).flatMap((n) => n.moduleKeys),
    ...(m.flowSteps ?? []).flatMap((s) => s.moduleKeys),
    ...(m.dealTabs ?? []).map((t) => t.moduleKey),
    ...(m.dealSteps ?? []).map((t) => t.moduleKey),
    ...(m.inboxQueues ?? []).map((q) => q.moduleKey),
    ...(m.setupSections ?? []).map((s) => s.moduleKey),
  ]),
)

/** Nav items that carry a count badge, keyed by path. */
export const NAV_BADGES: readonly Countable[] = NAV_BY_STAGE
  .flatMap((s) => s.items)
  .filter((i): i is NavContribution & { useBadge: (enabled: boolean) => number } => !!i.useBadge)
  .map((i) => ({ key: i.path, moduleKeys: i.moduleKeys, useCount: i.useBadge }))

/** Flow steps as countables, for the flow bar. */
export const FLOW_COUNTABLES: readonly Countable[] = FLOW_STEPS.map((s) => ({
  key: s.key, moduleKeys: s.moduleKeys, useCount: s.useCount,
}))
