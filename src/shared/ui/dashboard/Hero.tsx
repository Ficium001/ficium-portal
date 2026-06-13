/**
 * @component Hero
 * @description
 *   The portal's signature element: a dark ink band that opens every
 *   dashboard with one sentence, drifting logo blades in the background,
 *   primary CTAs, and a row of count-up stats.
 *
 *   Fully content-driven — both dashboards (admin & institution) and any
 *   future role render the exact same component with different props.
 *
 *   <Hero
 *     eyebrow="ALL SYSTEMS OPERATIONAL"
 *     live
 *     headline={<>Good morning, Kishan.<br/>Your platform is <GradText>moving.</GradText></>}
 *     subline="Three approvals are waiting on you."
 *     actions={<>...buttons...</>}
 *     stats={[{ label: 'Total users', value: 24, trend: '↑ 8%' }, ...]}
 *   />
 *
 * @owner Ficium Engineering
 */

import { useId, type ReactNode } from 'react'
import CountUp from '../motion/CountUp'

// ─── Gradient text helper ─────────────────────────────────────
export function GradText({ children }: { children: ReactNode }) {
  return (
    <span
      className='bg-clip-text text-transparent'
      style={{
        backgroundImage:
          'linear-gradient(92deg,#62A8FF 0%,#22D3EE 40%,#A78BFA 75%,#E879F9 100%)',
      }}
    >
      {children}
    </span>
  )
}

// ─── Stat ticker entry ────────────────────────────────────────
export type HeroStat = {
  label:     string
  value:     number
  decimals?: number
  format?:   'comma'
  prefix?:   string
  suffix?:   string
  /** small green/red annotation e.g. "↑ 8%" */
  trend?:    string
  trendTone?: 'good' | 'bad'
}

// ─── Background blade ─────────────────────────────────────────
function Blade({ className, both = true }: { className: string; both?: boolean }) {
  const uid = useId().replace(/[:]/g, '')
  return (
    <svg
      viewBox='0 0 100 100'
      className={`absolute opacity-50 blur-[2px] motion-safe:animate-drift will-change-transform pointer-events-none ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={`hb-${uid}`} x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0' stopColor='#1E6CF5' />
          <stop offset='1' stopColor='#0B3FD6' />
        </linearGradient>
        <linearGradient id={`hp-${uid}`} x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0' stopColor='#7C3AED' />
          <stop offset='1' stopColor='#C026D3' />
        </linearGradient>
      </defs>
      {both && (
        <path d='M14 42 C20 18, 62 8, 90 14 C84 34, 44 48, 14 42 Z' fill={`url(#hb-${uid})`} />
      )}
      <path d='M86 58 C80 82, 38 92, 10 86 C16 66, 56 52, 86 58 Z' fill={`url(#hp-${uid})`} />
    </svg>
  )
}

// ─── Hero ─────────────────────────────────────────────────────
export default function Hero({
  eyebrow,
  live = false,
  headline,
  subline,
  actions,
  stats = [],
}: {
  eyebrow?:  string
  live?:     boolean
  headline:  ReactNode
  subline?:  ReactNode
  actions?:  ReactNode
  stats?:    HeroStat[]
}) {
  return (
    <section
      className='relative overflow-hidden rounded-hero text-white
                 px-7 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14'
      style={{
        background:
          'radial-gradient(120% 160% at 8% 0%, #181842 0%, #0B0B1E 55%)',
      }}
    >
      <Blade className='w-[380px] -top-16 right-[6%] [animation-delay:-2s]' />
      <Blade className='w-[300px] -bottom-20 right-[24%] [animation-duration:18s]' both={false} />

      {eyebrow && (
        <div className='relative z-[1] inline-flex items-center gap-2 text-[12.5px] font-semibold tracking-[.06em] text-[#B9B9D9] mb-3.5'>
          {live && (
            <span className='w-[7px] h-[7px] rounded-full bg-emerald-400 animate-pulse-ring-green' aria-hidden />
          )}
          {eyebrow}
        </div>
      )}

      <h1 className='relative z-[1] font-display font-bold tracking-display leading-[1.06]
                     text-[30px] sm:text-[40px] lg:text-[48px] max-w-[18ch]'>
        {headline}
      </h1>

      {subline && (
        <p className='relative z-[1] text-[#A6A6C8] mt-3.5 text-[15px] sm:text-[15.5px] max-w-[48ch]'>
          {subline}
        </p>
      )}

      {actions && (
        <div className='relative z-[2] flex flex-wrap gap-3 mt-7'>{actions}</div>
      )}

      {stats.length > 0 && (
        <div className='relative z-[1] flex flex-wrap gap-x-10 gap-y-6 lg:gap-x-16 mt-10'>
          {stats.map(s => (
            <div key={s.label}>
              <div className='font-display font-bold tracking-display text-[26px] lg:text-[34px]'>
                <CountUp
                  value={s.value}
                  decimals={s.decimals}
                  format={s.format}
                  prefix={s.prefix}
                  suffix={s.suffix}
                />
                {s.trend && (
                  <span
                    className={`text-[12px] font-semibold ml-1.5 font-body tracking-normal ${
                      s.trendTone === 'bad' ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {s.trend}
                  </span>
                )}
              </div>
              <div className='text-[12.5px] text-[#8E8EB4] font-medium mt-0.5'>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Hero buttons ─────────────────────────────────────────────
export function HeroButton({
  children, onClick, variant = 'grad',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'grad' | 'ghost'
}) {
  const base =
    'font-semibold text-[14.5px] px-6 py-3 rounded-[14px] transition-all duration-300 ease-swift active:scale-[.97]'
  const styles =
    variant === 'grad'
      ? 'text-white shadow-ficium hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(124,58,237,.45)]'
      : 'bg-white/[0.08] text-white border border-white/[0.16] hover:bg-white/[0.14]'
  return (
    <button
      type='button'
      onClick={onClick}
      className={`${base} ${styles}`}
      style={
        variant === 'grad'
          ? { background: 'linear-gradient(92deg,#1E6CF5,#7C3AED 90%)' }
          : undefined
      }
    >
      {children}
    </button>
  )
}
