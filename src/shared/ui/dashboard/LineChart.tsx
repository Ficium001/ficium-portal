/**
 * @component LineChart
 * @description
 *   Dependency-free SVG line chart with the Ficium gradient stroke,
 *   smooth bezier interpolation, draw-in animation on first view, and
 *   hover tooltips. Used by both dashboards; pass any daily series.
 *
 *   <LineChart
 *     data={[{ label: 'Jun 6', value: 48 }, ...]}
 *     unit="transactions"
 *   />
 *
 * @owner Ficium Engineering
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useInView, usePrefersReducedMotion } from '../motion/Reveal'

export type ChartPoint = { label: string; value: number }

const W = 640
const H = 220
const PAD = { l: 36, r: 16, t: 18, b: 30 }

function niceMax(raw: number): number {
  if (raw <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

export default function LineChart({
  data,
  unit = '',
  ariaLabel = 'Chart',
}: {
  data: ChartPoint[]
  unit?: string
  ariaLabel?: string
}) {
  const uid = useId().replace(/[:]/g, '')
  const reduced = usePrefersReducedMotion()
  const { ref, inView } = useInView<HTMLDivElement>(0.3)
  const pathRef = useRef<SVGPathElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { pts, line, area, maxV, x, y } = useMemo(() => {
    const maxV = niceMax(Math.max(...data.map(d => d.value), 1))
    const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(data.length - 1, 1)
    const y = (v: number) => H - PAD.b - (v / maxV) * (H - PAD.t - PAD.b)
    const pts = data.map((p, i) => [x(i), y(p.value)] as const)
    let line = pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      const mx = (x0 + x1) / 2
      line += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`
    }
    const area = pts.length
      ? `${line} L${x(data.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`
      : ''
    return { pts, line, area, maxV, x, y }
  }, [data])

  // Draw-in on first view
  useEffect(() => {
    const el = pathRef.current
    if (!el || !inView) return
    if (reduced) return
    const len = el.getTotalLength()
    el.style.strokeDasharray = `${len}`
    el.style.strokeDashoffset = `${len}`
    // double rAF so the initial offset paints before transitioning
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)'
        el.style.strokeDashoffset = '0'
      }),
    )
  }, [inView, reduced, line])

  const gridSteps = 4
  const hovered = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className='relative mt-5'>
      <svg viewBox={`0 0 ${W} ${H}`} className='w-full' aria-label={ariaLabel} role='img'>
        <defs>
          <linearGradient id={`lcA-${uid}`} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#2A1FE6' stopOpacity='.22' />
            <stop offset='1' stopColor='#2A1FE6' stopOpacity='0' />
          </linearGradient>
          <linearGradient id={`lcS-${uid}`} x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0' stopColor='#1E6CF5' />
            <stop offset='1' stopColor='#7C3AED' />
          </linearGradient>
        </defs>

        {Array.from({ length: gridSteps + 1 }).map((_, s) => {
          const v = (maxV * s) / gridSteps
          return (
            <g key={s}>
              <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke='#EFEFF5' />
              <text
                x={PAD.l - 8} y={y(v) + 4}
                fontSize='10' fill='#9A9AB5' textAnchor='end'
                fontFamily='Inter Tight, sans-serif'
              >
                {v % 1 ? v.toFixed(1) : v}
              </text>
            </g>
          )
        })}

        {area && <path d={area} fill={`url(#lcA-${uid})`} />}
        {line && (
          <path
            ref={pathRef}
            d={line}
            fill='none'
            stroke={`url(#lcS-${uid})`}
            strokeWidth='2.5'
            strokeLinecap='round'
          />
        )}

        {data.map((p, i) => (
          <g key={i}>
            <text
              x={x(i)} y={H - 8}
              fontSize='10.5' fill='#9A9AB5' textAnchor='middle'
              fontFamily='Inter Tight, sans-serif'
            >
              {p.label}
            </text>
            <circle
              cx={pts[i][0]} cy={pts[i][1]}
              r={hover === i ? 6 : 4}
              fill='#fff'
              stroke={`url(#lcS-${uid})`}
              strokeWidth='2.5'
              style={{ transition: 'r .2s' }}
            />
            {/* generous invisible hit target */}
            <circle
              cx={pts[i][0]} cy={pts[i][1]} r={14}
              fill='transparent'
              className='cursor-pointer'
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && hover !== null && (
        <div
          className='absolute pointer-events-none bg-ink text-white text-[12px] font-semibold
                     px-2.5 py-1.5 rounded-[9px] whitespace-nowrap z-[3]'
          style={{
            left: `${(pts[hover][0] / W) * 100}%`,
            top: `${(pts[hover][1] / H) * 100}%`,
            transform: 'translate(-50%,-130%)',
          }}
        >
          {hovered.value} {unit}
          <small className='block font-medium text-[#A6A6C8] text-[10.5px]'>{hovered.label}</small>
        </div>
      )}
    </div>
  )
}
