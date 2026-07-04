import { useEffect, useState } from 'react'

/** Live SLA countdown: green → amber (<25% remaining) → red (overdue). */
export function SlaChip({ startedAt, dueAt }: { startedAt: string; dueAt: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  if (!dueAt) return null
  const start = new Date(startedAt).getTime()
  const due = new Date(dueAt).getTime()
  const total = Math.max(due - start, 1)
  const left = due - now
  const frac = left / total

  const tone =
    left <= 0 ? 'bg-red-50 text-red-600 border-red-200'
      : frac < 0.25 ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  const label =
    left <= 0 ? 'Overdue'
      : left < 3_600_000 ? `${Math.max(1, Math.round(left / 60_000))}m left`
        : left < 86_400_000 ? `${Math.round(left / 3_600_000)}h left`
          : `${Math.round(left / 86_400_000)}d left`

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  )
}
