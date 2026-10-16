/**
 * Booking — fulfilment's last step: the loan is booked in the bank's core
 * banking system. Adds a Booking tab and a "Booked" step to every deal, and an
 * "Awaiting booking" step to the flow bar.
 */
import type { ModuleManifest } from '@/app/registry/types'
import type { PipelineDetail } from '@/institution/pipeline/types/pipeline'
import { usePipelines } from '@/institution/pipeline/hooks/usePipeline'
import { BookingPanel } from './components/BookingPanel'
import { useBooking } from './hooks/useBooking'

function useAwaitingBooking(enabled: boolean): number {
  const { data } = usePipelines('completed', { enabled })
  return (data ?? []).filter((d) => !d.booked).length
}

function useBookedStep(deal: PipelineDetail, enabled: boolean) {
  const { data } = useBooking(deal.id, enabled && deal.status === 'completed')
  if (data) return { state: 'done' as const, detail: data.core_reference }
  if (deal.status === 'completed') return { state: 'current' as const, detail: 'Record reference' }
  return { state: 'todo' as const }
}

export const bookingModule: ModuleManifest = {
  id: 'booking',
  stage: 'fulfilment',
  flowSteps: [{
    key: 'booking', label: 'Awaiting booking', path: '/deals',
    moduleKeys: ['inst:booking'], order: 60, useCount: useAwaitingBooking,
  }],
  dealSteps: [{
    key: 'booked', label: 'Booked', moduleKey: 'inst:booking', order: 95, tab: 'booking',
    useStep: useBookedStep,
  }],
  dealTabs: [{
    key: 'booking', label: 'Booking', moduleKey: 'inst:booking', order: 50,
    render: (deal) => <BookingPanel deal={deal} />,
  }],
}
