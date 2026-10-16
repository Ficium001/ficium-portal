/**
 * Run each contribution's count hook, gated by module access.
 *
 * `items` must come from a module-level registry constant: the list and its
 * order never change between renders, so calling one hook per item in a loop
 * keeps a stable hook order. Never pass a list that can change length.
 */
import { useModulesAccess } from '@/shared/hooks/useModuleAccess'

export interface Countable {
  key:        string
  /** Counted if the user holds ANY of these keys. */
  moduleKeys: readonly string[]
  useCount:   (enabled: boolean) => number
}

export function useCounts(items: readonly Countable[]): Record<string, number> {
  const access = useModulesAccess([...new Set(items.flatMap((i) => i.moduleKeys))])
  const out: Record<string, number> = {}
  for (const item of items) {
    const allowed = item.moduleKeys.some((k) => access.allowed[k])
    const n = item.useCount(allowed)
    out[item.key] = allowed ? n : 0
  }
  return out
}
