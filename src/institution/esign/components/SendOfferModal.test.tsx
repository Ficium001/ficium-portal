/**
 * Send offer: blockers are shown instead of a form that fails on submit; when
 * ready, the template is pre-selected and one click sends template + signer +
 * window to the server (borrower identity is never sent from the client).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import type { OfferReadiness } from '@/institution/esign/hooks/useEsign'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/shared/lib/portalApi', () => {
  class PortalApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { portalApi: api, PortalApiError }
})

import { SendOfferModal } from './SendOfferModal'

const READY: OfferReadiness = {
  ready: true,
  blockers: [],
  approval: { state: 'approved', message: 'Credit approval granted.' },
  borrower: { name: 'Jane Doe', email: 'jane@x.mu' },
  templates: [
    { id: 't1', name: 'Standard facility letter', doc_category: 'facility_letter', envelope_type: 'offer_letter' },
    { id: 't2', name: 'Loan agreement', doc_category: 'loan_agreement', envelope_type: 'offer_letter' },
  ],
  default_template_id: 't1',
  already_sent: 0,
  deal_label: 'Home Loan — ref 8F2A1C3D',
}

const MEMBERS = [
  { id: 'm1', full_name: 'Asha R', email: 'asha@bank.mu', active: true },
  { id: 'm2', full_name: 'No Email', email: undefined, active: true },
]

let root: Root
let host: HTMLDivElement
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function render(readiness: OfferReadiness) {
  api.get.mockImplementation(async (url: string) => {
    if (url.includes('/offer-readiness')) return readiness
    if (url === '/members') return MEMBERS
    throw new Error(`unexpected GET ${url}`)
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <SendOfferModal dealId="deal-1" onClose={() => {}} />
      </QueryClientProvider>,
    )
  })
  await flush()
  await flush()
}

const text = () => document.body.textContent ?? ''
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label) as HTMLButtonElement

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('SendOfferModal', () => {
  it('lists every blocker and offers no send button', async () => {
    await render({
      ...READY, ready: false, templates: [], default_template_id: null,
      blockers: ['Waiting for credit approval: step 1 "Credit approval" is with Asha R.',
                 'There is no approved offer template.'],
    })
    expect(text()).toContain("can't be sent yet")
    expect(text()).toContain('step 1 "Credit approval" is with Asha R')
    expect(text()).toContain('no approved offer template')
    expect(button('Send offer')).toBeUndefined()
  })

  it('pre-selects the template and sends template, signer and window only', async () => {
    api.post.mockResolvedValue({ envelope_id: 'e1', generation_id: 'g1' })
    await render(READY)

    expect(text()).toContain('Jane Doe')
    const [templateSelect, signerSelect] = [...document.querySelectorAll('select')] as [HTMLSelectElement, HTMLSelectElement]
    expect(templateSelect.value).toBe('t1')
    // members without an email can't countersign and aren't offered
    expect(signerSelect.textContent).not.toContain('No Email')
    expect(button('Send offer').disabled).toBe(true)

    choose(signerSelect, 'm1')
    await act(async () => { button('Send offer').click() })
    await flush()

    expect(api.post).toHaveBeenCalledWith('/institution/deals/deal-1/send-offer', {
      template_id: 't1', countersigner_member_id: 'm1', expires_hours: 72,
    })
    expect(text()).toContain('Sent to Jane Doe')
  })

  it('shows the server reason when sending is refused', async () => {
    const { PortalApiError } = await import('@/shared/lib/portalApi')
    api.post.mockRejectedValue(new PortalApiError(409, 'Credit approval was rejected.'))
    await render(READY)
    choose(document.querySelectorAll('select')[1] as HTMLSelectElement, 'm1')
    await act(async () => { button('Send offer').click() })
    await flush()
    expect(text()).toContain('Credit approval was rejected.')
  })
})
