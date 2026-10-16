/**
 * Embedded-page context.
 *
 * Hub pages (Inbox, Setup) render existing module pages inside their own
 * frame. A page inside a hub must not draw its own <main> or page title —
 * the hub owns both. PageFrame and SectionHeader read this flag, so the
 * module pages themselves need no hub-specific props.
 */
import { createContext, useContext } from 'react'

export const EmbeddedContext = createContext(false)

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext)
}
