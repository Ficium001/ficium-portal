/**
 * PageFrame — a module page's outer element.
 *
 * Standalone: the page's <main> with its own padding and width.
 * Inside a hub: a plain <div>; the hub's <main> provides layout.
 */
import type { ReactNode } from 'react'
import { useEmbedded } from '@/shared/lib/embedded'

export function PageFrame({ className, children }: { className: string; children: ReactNode }) {
  const embedded = useEmbedded()
  if (embedded) {
    // Keep vertical rhythm utilities (space-y-*), drop padding and width.
    const rhythm = className.split(/\s+/).filter((c) => c.startsWith('space-y-')).join(' ')
    return <div className={rhythm || undefined}>{children}</div>
  }
  return <main className={className}>{children}</main>
}
