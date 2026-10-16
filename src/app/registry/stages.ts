/**
 * Lifecycle stages, in the order a deal moves through them — the same shape
 * as a core banking origination flow. Labels are what bank staff see as nav
 * section headers. A stage with no contributing module simply doesn't render,
 * so a future module (e.g. loan servicing) appears by declaring its stage.
 */
import type { Stage } from './types'

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'home',          label: 'Home' },
  { id: 'origination',   label: 'Origination' },
  { id: 'authorisation', label: 'Authorisation' },
  { id: 'fulfilment',    label: 'Fulfilment' },
  { id: 'servicing',     label: 'Servicing' },
  { id: 'reporting',     label: 'Reports' },
  { id: 'configuration', label: 'Configuration' },
]
