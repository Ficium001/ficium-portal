/**
 * Credit approval on a deal: a credit-routed stage is submitted, never
 * clicked through; its outcome shows on the stage; a deal can be closed
 * with a reason.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { StageCard } from './StageCard'
import { CloseDealModal } from './CloseDealModal'
import type { StageInstance } from '@/institution/pipeline/types/pipeline'

const post = vi.fn()
vi.mock('@/shared/lib/portalApi', () => ({
  portalApi: { get: () => new Promise(() => {}), post: (...a: unknown[]) => post(...a) },
  PortalApiError: class extends Error {},
}))

const stage = (over: Partial<StageInstance> = {}): StageInstance => ({
  id: 's4', pipeline_id: 'd1', position: 4, status: 'active', stage_key: 'board_approval',
  label: 'Board / Management Approval', description: '', borrower_label: '', borrower_visible: true,
  requires_maker_checker: true, requires_documents: false, approval_route: true,
  approval_instance_id: null, approval_status: null, rejection_reason: null,
  sla_hours: 48, sla_due_at: null, sla_breached: false, notes: null, documents: [],
  submitted_by: null, submitted_at: null, approved_by: null, approved_at: null,
  started_at: null, completed_at: null, updated_at: '', ...over,
}) as StageInstance

let root: Root
let host: HTMLDivElement
function render(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>,
    )
  })
}
afterEach(() => { act(() => root.unmount()); host.remove(); post.mockReset() })

const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())

describe('credit-routed stage', () => {
  it('is submitted for credit approval, not marked complete', () => {
    render(<StageCard stage={stage()} pipelineId="d1" isActive />)
    expect(buttons()).toContain('Submit for credit approval')
    expect(buttons()).not.toContain('Mark complete')
  })

  it('while in approval: no approve button here, points to the Inbox', () => {
    render(<StageCard stage={stage({ status: 'awaiting_approval', approval_instance_id: 'i1', approval_status: 'in_progress' })} pipelineId="d1" isActive />)
    expect(buttons().some((b) => b?.startsWith('Approve'))).toBe(false)
    expect(host.querySelector('a[href="/inbox?section=credit"]')).not.toBeNull()
  })

  it('shows why it was rejected', () => {
    render(<StageCard stage={stage({ status: 'blocked', rejection_reason: 'DSR above 45%' })} pipelineId="d1" isActive />)
    expect(host.textContent).toContain('DSR above 45%')
  })

  it('an ordinary maker-checker stage keeps its checker button', () => {
    render(<StageCard stage={stage({ approval_route: false, status: 'awaiting_approval' })} pipelineId="d1" isActive />)
    expect(buttons().some((b) => b?.startsWith('Approve'))).toBe(true)
  })
})

describe('close deal', () => {
  const setReason = (v: string) => {
    const ta = host.querySelector('textarea')!
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => { setter.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  const click = (label: string) => {
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.trim() === label)!
    act(() => { b.click() })
  }

  it('requires a reason', () => {
    render(<CloseDealModal pipelineId="d1" onClose={() => {}} />)
    click('Decline deal')
    expect(post).not.toHaveBeenCalled()
    expect(host.ownerDocument.body.textContent).toContain('Give a reason')
  })

  it('sends outcome and reason', async () => {
    post.mockResolvedValue({ pipeline_id: 'd1', status: 'withdrawn', reason: 'x' })
    render(<CloseDealModal pipelineId="d1" onClose={() => {}} />)
    const radio = host.ownerDocument.querySelector<HTMLInputElement>('input[value="withdrawn"]')!
    act(() => { radio.click() })
    setReason('Borrower accepted another offer')
    await act(async () => { click('Mark withdrawn') })
    expect(post).toHaveBeenCalledWith('/pipelines/d1/close', { outcome: 'withdrawn', reason: 'Borrower accepted another offer' })
  })
})
