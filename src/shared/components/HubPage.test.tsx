/**
 * HubPage: tab visibility follows module access, ?section= picks the tab,
 * and embedded pages lose their own title but keep their actions.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { HubPage } from './HubPage'
import { SectionHeader } from '@/institution/components/primitives'
import { PageFrame } from './PageFrame'

const allowed: Record<string, boolean> = {}
vi.mock('@/shared/hooks/useModuleAccess', () => ({
  useModulesAccess: (keys: readonly string[]) => ({
    isLoading: false,
    allowed: Object.fromEntries(keys.map((k) => [k, !!allowed[k]])),
  }),
}))

function Page({ name }: { name: string }) {
  return (
    <PageFrame className="p-6 max-w-3xl">
      <SectionHeader title={`${name} title`} subtitle={`${name} subtitle`} actions={<button>{name} action</button>} />
      <p>{name} body</p>
    </PageFrame>
  )
}

const sections = [
  { key: 'a' as const, label: 'Alpha', moduleKey: 'inst:a', element: <Page name="A" /> },
  { key: 'b' as const, label: 'Beta',  moduleKey: 'inst:b', element: <Page name="B" />, badge: '2' },
  { key: 'c' as const, label: 'Gamma', moduleKey: 'inst:c', element: <Page name="C" /> },
]

let root: Root
let host: HTMLDivElement

function render(url: string) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <HubPage title="Hub" subtitle="sub" idPrefix="hub" sections={sections} emptyText="Nothing for you" />
      </MemoryRouter>,
    )
  })
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  for (const k of Object.keys(allowed)) delete allowed[k]
})

describe('HubPage', () => {
  it('shows only sections the user can open', () => {
    Object.assign(allowed, { 'inst:a': true, 'inst:c': true })
    render('/hub')
    const tabs = [...host.querySelectorAll('[role=tab]')].map((t) => t.textContent)
    expect(tabs).toEqual(['Alpha', 'Gamma'])
  })

  it('opens the section named in ?section=', () => {
    Object.assign(allowed, { 'inst:a': true, 'inst:b': true })
    render('/hub?section=b')
    expect(host.textContent).toContain('B body')
    expect(host.querySelector('[aria-selected=true]')?.textContent).toBe('Beta2')
  })

  it('falls back to the first visible section for an unknown or forbidden ?section=', () => {
    Object.assign(allowed, { 'inst:c': true })
    render('/hub?section=b')
    expect(host.textContent).toContain('C body')
  })

  it('embedded pages keep subtitle and actions but not their own title or <main>', () => {
    Object.assign(allowed, { 'inst:a': true })
    render('/hub')
    expect(host.querySelectorAll('main')).toHaveLength(1)
    expect([...host.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Hub'])
    expect(host.textContent).toContain('A subtitle')
    expect(host.textContent).toContain('A action')
  })

  it('hides the tab bar when only one section is visible', () => {
    Object.assign(allowed, { 'inst:b': true })
    render('/hub')
    expect(host.querySelector('[role=tablist]')).toBeNull()
  })

  it('explains an empty hub instead of rendering nothing', () => {
    render('/hub')
    expect(host.textContent).toContain('Nothing for you')
  })
})
