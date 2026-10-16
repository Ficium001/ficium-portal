/**
 * Module registry — contribution types.
 *
 * The portal follows a core banking lifecycle (origination → authorisation →
 * fulfilment → servicing → reporting → configuration). Each feature declares
 * what it adds to that lifecycle in ONE manifest; the shell, router, Inbox,
 * Setup, deal page and flow bar all read the registry instead of hardcoding
 * features. Adding a module = write a manifest + list it in registry/index.ts.
 *
 * Permissions are separate on purpose: module keys are a contract with the
 * database (catalog.module / user_groups.module_permissions) and live in
 * shared/lib/modules.ts. A manifest only references keys; the registry test
 * fails if it references one the catalogue doesn't define.
 */
import type { ComponentType, ReactNode } from 'react'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'

/** Lifecycle stages, in order. Drives nav sections and the flow bar. */
export type Stage =
  | 'home'
  | 'origination'
  | 'authorisation'
  | 'fulfilment'
  | 'servicing'
  | 'reporting'
  | 'configuration'

/** A page. Wrapped in RequireModule when moduleKey is set. */
export interface RouteContribution {
  path:       string
  moduleKey?: string
  element:    ReactNode
}

/** A drawer item. Shown if the user holds ANY of moduleKeys. */
export interface NavContribution {
  label:      string
  path:       string
  iconKey:    string
  moduleKeys: string[]
  order:      number
  /** Count shown as a badge; called with whether the user can see the item. */
  useBadge?:  (enabled: boolean) => number
}

/** A step in the flow bar: where work is waiting in the lifecycle. */
export interface FlowStepContribution {
  key:        string
  label:      string
  path:       string
  /** Shown if the user holds ANY of these keys. */
  moduleKeys: string[]
  order:      number
  /** How many items wait at this step. Called with whether the user may see it. */
  useCount:   (enabled: boolean) => number
}

/** A tab on the deal page (/deals/:id). */
export interface DealTabContribution {
  key:       string
  label:     string
  moduleKey: string
  order:     number
  render:    (deal: PipelineDetail) => ReactNode
  /** Optional status next to the label, e.g. "2 waiting". */
  Badge?:    ComponentType<{ deal: PipelineDetail }>
}

export type StepState = 'done' | 'current' | 'todo'

/**
 * A step in a deal's lifecycle strip (accepted → processing → documents →
 * signature → complete). A future module (e.g. disbursement) adds its step
 * here and it appears on every deal.
 */
export interface DealStepContribution {
  key:       string
  label:     string
  moduleKey: string
  order:     number
  /** Deal tab this step opens when clicked, if any. */
  tab?:      string
  /** Where the deal is at this step. Called with whether the user may see it. */
  useStep:   (deal: PipelineDetail, enabled: boolean) => { state: StepState; detail?: string }
}

/** A queue in the Inbox (pending authorisation). */
export interface InboxQueueContribution {
  key:       string
  label:     string
  moduleKey: string
  order:     number
  element:   ReactNode
  /** Items pending in this queue. Called with whether the user may see it. */
  useCount:  (enabled: boolean) => number
}

/** A section in Setup (configuration / maintenance). */
export interface SetupSectionContribution {
  key:       string
  label:     string
  moduleKey: string
  order:     number
  element:   ReactNode
}

export interface ModuleManifest {
  /** Stable id, e.g. 'marketplace'. */
  id:             string
  stage:          Stage
  routes?:        RouteContribution[]
  nav?:           NavContribution[]
  flowSteps?:     FlowStepContribution[]
  dealTabs?:      DealTabContribution[]
  dealSteps?:     DealStepContribution[]
  inboxQueues?:   InboxQueueContribution[]
  setupSections?: SetupSectionContribution[]
}
