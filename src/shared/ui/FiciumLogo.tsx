/**
 * @component FiciumLogo
 * @description
 *   The official Ficium mark: two offset blades — blue (insight) above,
 *   violet (value) below — with a tapered negative-space gap that reads
 *   as forward progression. Exact paths/gradients from brand source.
 *
 *   useId keeps gradient ids unique when the logo appears more than once
 *   on a page.
 *
 *   <FiciumLogo size={30} />                    — mark only
 *   <FiciumLogo size={30} withWordmark />       — mark + "Ficium"
 *   <FiciumLogo mono className="text-white" />  — single-colour (currentColor)
 *
 *   `size` is the rendered width in px; height scales to the 310:153 ratio.
 *
 * @owner Ficium Engineering
 */

import { useId } from 'react'

// Brand source aspect ratio
const VB_W = 310
const VB_H = 153
const RATIO = VB_H / VB_W

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
  const blue = `fblue-${uid}`
  const purple = `fpurple-${uid}`

  const mark = (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={size}
      height={Math.round(size * RATIO)}
      role='img'
      aria-hidden
      className={className}
    >
      {!mono && (
        <defs>
          <linearGradient id={blue} x1='85' y1='79' x2='266' y2='20' gradientUnits='userSpaceOnUse'>
            <stop offset='0' stopColor='#3536DC' />
            <stop offset='0.5' stopColor='#356EF4' />
            <stop offset='1' stopColor='#4C90F6' />
          </linearGradient>
          <linearGradient id={purple} x1='85' y1='141' x2='238' y2='91' gradientUnits='userSpaceOnUse'>
            <stop offset='0' stopColor='#3A148F' />
            <stop offset='1' stopColor='#8231EC' />
          </linearGradient>
        </defs>
      )}

      {/* top (blue) blade */}
      <path
        d='M 121.78,31.83 Q 131.00,20.00 146.00,20.00 L 251.00,20.00 Q 266.00,20.00 257.28,32.21 L 244.72,49.79 Q 236.00,62.00 221.09,63.68 L 99.91,77.32 Q 85.00,79.00 94.22,67.17 Z'
        fill={mono ? 'currentColor' : `url(#${blue})`}
      />

      {/* bottom (purple) blade */}
      <path
        d='M 108.10,103.75 Q 116.00,91.00 131.00,91.00 L 223.00,91.00 Q 238.00,91.00 230.12,103.77 L 216.88,125.23 Q 209.00,138.00 194.00,138.36 L 100.00,140.64 Q 85.00,141.00 92.90,128.25 Z'
        fill={mono ? 'currentColor' : `url(#${purple})`}
        opacity={mono ? 0.65 : 1}
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
