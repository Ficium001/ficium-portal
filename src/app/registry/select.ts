/**
 * Contributions from feature modules, collected and ordered.
 * Hub pages (Inbox, Setup, deal page) read these; they never name features.
 */
import { FEATURE_MODULES } from './features'
import type {
  DealStepContribution, DealTabContribution, InboxQueueContribution, SetupSectionContribution,
} from './types'

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

export const INBOX_QUEUES: readonly InboxQueueContribution[] =
  FEATURE_MODULES.flatMap((m) => m.inboxQueues ?? []).sort(byOrder)

export const SETUP_SECTIONS: readonly SetupSectionContribution[] =
  FEATURE_MODULES.flatMap((m) => m.setupSections ?? []).sort(byOrder)

export const DEAL_TABS: readonly DealTabContribution[] =
  FEATURE_MODULES.flatMap((m) => m.dealTabs ?? []).sort(byOrder)

export const DEAL_STEPS: readonly DealStepContribution[] =
  FEATURE_MODULES.flatMap((m) => m.dealSteps ?? []).sort(byOrder)
