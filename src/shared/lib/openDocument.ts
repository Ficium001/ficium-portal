/**
 * Open a private document through a short-lived signed link from portal-api.
 * The tab is opened synchronously (so popup blockers allow it), then pointed
 * at the signed URL once the API answers. The institution-docs bucket is
 * private: never link to its storage URL directly.
 */
import { portalApi } from './portalApi'

export async function openSignedDocument(apiPath: string): Promise<void> {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  try {
    const { url } = await portalApi.get<{ url: string }>(apiPath)
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch {
    tab?.close()
    window.alert('This document could not be opened. Please try again.')
  }
}
