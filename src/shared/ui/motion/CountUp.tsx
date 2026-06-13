/**
 * @component CountUp
 * @description
 *   Animates a number from 0 to `value` when it scrolls into view.
 *   Cubic ease-out, 1.4s. Respects prefers-reduced-motion (renders the
 *   final value immediately). Re-animates if `value` changes after load
 *   (e.g. react-query refetch) by snapping — no distracting re-runs.
 *
 *   <CountUp value={8448} format="comma" />
 *   <CountUp value={99.98} decimals={2} suffix="%" />
 *
 * @owner Ficium Engineering
 */

import { useEffect, useRef, useState } from 'react'
import { useInView, usePrefersReducedMotion } from './Reveal'

const DURATION_MS = 1400

export default function CountUp({
  value,
  decimals = 0,
  format,
  prefix = '',
  suffix = '',
  className = '',
}: {
  value: number
  decimals?: number
  format?: 'comma'
  prefix?: string
  suffix?: string
  className?: string
}) {
  const reduced = usePrefersReducedMotion()
  const { ref, inView } = useInView<HTMLSpanElement>(0.4)
  const [display, setDisplay] = useState(0)
  const animated = useRef(false)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!inView && !reduced) return
    if (reduced) { setDisplay(value); return }

    // First sight: animate. Subsequent data refreshes: snap.
    if (animated.current) { setDisplay(value); return }
    animated.current = true

    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / DURATION_MS, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(value * ease)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [inView, value, reduced])

  let text = display.toFixed(decimals)
  if (format === 'comma') text = Number(text).toLocaleString('en-MU')

  return (
    <span ref={ref} className={className}>
      {prefix}{text}{suffix}
    </span>
  )
}
