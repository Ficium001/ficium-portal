/**
 * Platform hubs: pages that host contributions from feature modules.
 *   Inbox — every queue pending authorisation (inboxQueues)
 *   Setup — every configuration section        (setupSections)
 * The deal page is the third hub (dealTabs) and belongs to the deals module.
 */
import { lazy } from 'react'
import type { ModuleManifest } from './types'
import { INBOX_QUEUES, SETUP_SECTIONS } from './select'
import { useInboxTotal } from './hooks'

const InstitutionInbox = lazy(() => import('@/institution/inbox/pages/InstitutionInbox'))
const InstitutionSetup = lazy(() => import('@/institution/setup/pages/InstitutionSetup'))

const INBOX_KEYS = INBOX_QUEUES.map((q) => q.moduleKey)
const SETUP_KEYS = SETUP_SECTIONS.map((s) => s.moduleKey)

export const inboxHub: ModuleManifest = {
  id: 'inbox',
  stage: 'authorisation',
  routes: [{ path: '/inbox', element: <InstitutionInbox /> }],
  nav: [{
    label: 'Inbox', path: '/inbox', iconKey: 'Inbox', moduleKeys: INBOX_KEYS, order: 10,
    useBadge: useInboxTotal,
  }],
  flowSteps: [{
    key: 'authorise', label: 'To authorise', path: '/inbox',
    moduleKeys: INBOX_KEYS, order: 10, useCount: useInboxTotal,
  }],
}

export const setupHub: ModuleManifest = {
  id: 'setup',
  stage: 'configuration',
  routes: [{ path: '/setup', element: <InstitutionSetup /> }],
  nav: [{ label: 'Setup', path: '/setup', iconKey: 'Settings', moduleKeys: SETUP_KEYS, order: 10 }],
}
