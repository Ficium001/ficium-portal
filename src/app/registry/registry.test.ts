/**
 * Registry integrity: what makes "add a module by writing a manifest" safe.
 * If a manifest references a permission that doesn't exist, collides with
 * another module, or a catalogue module ends up with no surface, this fails.
 */
import { describe, it, expect } from 'vitest'
import { MODULE_CATALOGUE } from '@/shared/lib/modules'
import { MODULES, ROUTES, FLOW_STEPS, NAV_BY_STAGE, USED_MODULE_KEYS } from '.'
import { DEAL_STEPS, DEAL_TABS, INBOX_QUEUES, SETUP_SECTIONS } from './select'
import { STAGES } from './stages'

const INSTITUTION_KEYS = new Set(
  MODULE_CATALOGUE.filter((m) => m.category === 'institution').map((m) => m.key),
)

const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i)

describe('module registry', () => {
  it('module ids are unique', () => {
    expect(dupes(MODULES.map((m) => m.id))).toEqual([])
  })

  it('every permission key a module uses exists in the catalogue', () => {
    expect([...USED_MODULE_KEYS].filter((k) => !INSTITUTION_KEYS.has(k))).toEqual([])
  })

  it('every institution permission has a surface (nothing orphaned)', () => {
    // inst:dashboard is the shell's Home, not a module contribution.
    const orphans = [...INSTITUTION_KEYS].filter((k) => k !== 'inst:dashboard' && !USED_MODULE_KEYS.has(k))
    expect(orphans).toEqual([])
  })

  it('route paths are unique', () => {
    expect(dupes(ROUTES.map((r) => r.path))).toEqual([])
  })

  it('contribution keys are unique within each extension point', () => {
    expect(dupes(INBOX_QUEUES.map((q) => q.key))).toEqual([])
    expect(dupes(SETUP_SECTIONS.map((s) => s.key))).toEqual([])
    expect(dupes(DEAL_TABS.map((t) => t.key))).toEqual([])
    expect(dupes(DEAL_STEPS.map((s) => s.key))).toEqual([])
    expect(dupes(FLOW_STEPS.map((s) => s.key))).toEqual([])
  })

  it('every nav item and flow step points at a registered route', () => {
    const paths = new Set(ROUTES.map((r) => r.path))
    for (const s of NAV_BY_STAGE) for (const i of s.items) expect(paths.has(i.path)).toBe(true)
    for (const f of FLOW_STEPS) expect(paths.has(f.path)).toBe(true)
  })

  it('deal steps only open tabs that exist', () => {
    const tabs = new Set(DEAL_TABS.map((t) => t.key))
    for (const s of DEAL_STEPS) if (s.tab) expect(tabs.has(s.tab)).toBe(true)
  })

  it('catalogue hub paths (used by shortcuts) match a real tab for the same key', () => {
    for (const m of MODULE_CATALOGUE.filter((x) => x.path.includes('?section='))) {
      const [base, query] = m.path.split('?')
      const section = new URLSearchParams(query).get('section')
      const host = base === '/inbox' ? INBOX_QUEUES : base === '/setup' ? SETUP_SECTIONS : []
      expect(host.find((x) => x.key === section)?.moduleKey).toBe(m.key)
    }
  })

  it('stages render in lifecycle order', () => {
    const order = STAGES.map((s) => s.id)
    const seen = NAV_BY_STAGE.map((s) => order.indexOf(s.stage))
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })
})
