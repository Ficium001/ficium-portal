/** Vault reuse rule on borrower checklist items: type saves on change, max age on blur. */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { RequirementsEditor } from './RequirementsEditor'

const get = vi.fn()
const put = vi.fn()
vi.mock('@/shared/lib/portalApi', () => ({
  portalApi: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a), post: vi.fn() },
  PortalApiError: class extends Error {},
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const req = (over = {}) => ({
  id: 'r1', template_id: 't1', stage_def_id: null, name: 'Proof of income', description: null,
  provided_by: 'borrower', mandatory: true, position: 1, is_active: true,
  document_type: 'payslip', max_age_days: 90, ...over,
})
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function render(rows: unknown[]) {
  get.mockResolvedValue(rows)
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <QueryClientProvider client={new QueryClient()}>
        <RequirementsEditor templateId="t1" stages={[]} />
      </QueryClientProvider>)
  })
  await settle()
  return host
}

function type(el: HTMLInputElement | HTMLSelectElement, v: string, event = 'input') {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
  act(() => { el.dispatchEvent(new Event(event, { bubbles: true })) })
}

beforeEach(() => { get.mockReset(); put.mockReset(); put.mockResolvedValue({}) })

describe('vault reuse rule', () => {
  it('shows only for borrower documents', async () => {
    const host = await render([req(), req({ id: 'r2', provided_by: 'bank', name: 'Valuation' })])
    expect(host.querySelectorAll('select[id$="-type"]').length).toBe(1)
  })

  it('saves the type on change', async () => {
    const host = await render([req()])
    type(host.querySelector<HTMLSelectElement>('#r1-type')!, 'bank_statement', 'change')
    await settle()
    expect(put).toHaveBeenCalledWith('/pipelines/templates/t1/documents/r1', { document_type: 'bank_statement' })
  })

  it('saves max age once, on blur, never mid-typing, and never when invalid', async () => {
    const host = await render([req()])
    const age = host.querySelector<HTMLInputElement>('#r1-age')!
    type(age, '6'); type(age, '60')
    expect(put).not.toHaveBeenCalled()
    act(() => { age.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    await settle()
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('/pipelines/templates/t1/documents/r1', { max_age_days: 60 })
    put.mockClear()
    type(age, '0')
    act(() => { age.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    await settle()
    expect(put).not.toHaveBeenCalled()
    expect(age.getAttribute('aria-invalid')).toBe('true')
  })
})
