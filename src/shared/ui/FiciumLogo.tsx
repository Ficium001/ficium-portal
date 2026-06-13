/**
 * @component FiciumLogo
 * @description
 *   The 2026 Ficium mark: two interlocking blades, blue → deep-blue on
 *   top, violet → magenta below. Renders crisp at any size.
 *
 *   Uses useId so multiple instances on one page never collide on
 *   gradient defs.
 *
 *   <FiciumLogo size={30} />               — mark only
 *   <FiciumLogo size={30} withWordmark />  — mark + "Ficium"
 *   <FiciumLogo mono className="text-white" /> — single-colour (currentColor)
 *
 * @owner Ficium Engineering
 */

import { useId } from 'react'

export function FiciumLogo({
  size = 28,
  withWordmark = false,
  wordmarkClassName = '',
  mono = false,
  className = '',
}: {
  size?: number
  withWordmark?: boolean
  wordmarkClassName?: string
  mono?: boolean
  className?: string
}) {
  const uid = useId().replace(/[:]/g, '')
  const blue = `lgB-${uid}`
  const pur  = `lgP-${uid}`

  const mark = (
    <svg
      width={size}
      height={size}
      viewBox='0 0 100 100'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      aria-hidden
    >
      {!mono && (
        <defs>
          <linearGradient id={blue} x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0' stopColor='#1E6CF5' />
            <stop offset='1' stopColor='#0B3FD6' />
          </linearGradient>
          <linearGradient id={pur} x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0' stopColor='#7C3AED' />
            <stop offset='1' stopColor='#C026D3' />
          </linearGradient>
        </defs>
      )}
      <path
        d='M14 42 C20 18, 62 8, 90 14 C84 34, 44 48, 14 42 Z'
        fill={mono ? 'currentColor' : `url(#${blue})`}
      />
      <path
        d='M86 58 C80 82, 38 92, 10 86 C16 66, 56 52, 86 58 Z'
        fill={mono ? 'currentColor' : `url(#${pur})`}
        opacity={mono ? 0.6 : 1}
      />
    </svg>
  )

  if (!withWordmark) return mark

  return (
    <span className='inline-flex items-center gap-2.5'>
      {mark}
      <span className={`font-display font-bold tracking-display leading-none ${wordmarkClassName}`}>
        Ficium
      </span>
    </span>
  )
}

export default FiciumLogo
