/** Deal checklist: status, actions by status, notes required, closed deals read-only. */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { DealChecklist } from './DealChecklist'
import type { DealDocument } from '../types'

const get = vi.fn()
const post = vi.fn()
vi.mock('@/shared/lib/portalApi', () => ({
  portalApi: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  PortalApiError: class extends Error {},
}))

const doc = (over: Partial<DealDocument>): DealDocument => ({
  id: 'd1', status: 'required', file_name: null, mime_type: null, file_size: null,
  uploaded_at: null, uploaded_by: null, uploaded_by_name: null, reviewed_at: null, reviewed_by: null,
  reviewed_by_name: null, review_note: null, requirement_id: 'r1', name: 'Proof of income',
  description: null, provided_by: 'borrower', mandatory: true, position: 1, stage_def_id: 's1',
  stage_label: 'Credit Documentation', stage_position: 1, stage_status: 'active', ...over,
})

let root: Root
let host: HTMLDivElement
async function render(docs: DealDocument[], readOnly = false) {
  get.mockResolvedValue(docs)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(<QueryClientProvider client={new QueryClient()}><DealChecklist pipelineId="p1" readOnly={readOnly} /></QueryClientProvider>)
  })
  // let the query resolve and React commit
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
afterEach(() => { act(() => root.unmount()); host.remove(); get.mockReset(); post.mockReset() })
const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())

describe('DealChecklist', () => {
  it('summarises progress and groups by stage', async () => {
    await render([doc({}), doc({ id: 'd2', name: 'Bank statements', status: 'verified' })])
    expect(host.textContent).toContain('1 of 2 required documents')
    expect(host.querySelector('section[aria-label="Credit Documentation"]')).not.toBeNull()
  })

  it('a required document can be uploaded or waived, not verified', async () => {
    await render([doc({})])
    expect(buttons()).toEqual(expect.arrayContaining(['Upload', 'Waive']))
    expect(buttons()).not.toContain('Verify')
  })

  it('a received document can be verified or rejected', async () => {
    await render([doc({ status: 'received', file_name: 'payslips.pdf' })])
    expect(buttons()).toEqual(expect.arrayContaining(['Verify', 'Reject', 'Replace file']))
  })

  it('waiving needs a reason', async () => {
    await render([doc({})])
    const waive = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Waive')!
    act(() => { waive.click() })
    const confirm = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Waive document')!
    act(() => { confirm.click() })
    expect(post).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Add a note')
  })

  it('shows why a document was rejected', async () => {
    await render([doc({ status: 'rejected', review_note: 'Only 2 payslips', file_name: 'p.pdf' })])
    expect(host.textContent).toContain('Only 2 payslips')
  })

  it('is read-only on a closed deal', async () => {
    await render([doc({ status: 'received', file_name: 'p.pdf' })], true)
    expect(buttons().filter((b) => ['Upload', 'Verify', 'Waive', 'Reject'].includes(b ?? ''))).toEqual([])
  })
})
