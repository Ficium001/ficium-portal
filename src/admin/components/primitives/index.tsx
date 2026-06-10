/**
 * @module admin/components/primitives
 * @description
 *   Admin portal UI primitives. Intentionally darker, denser than the
 *   institution primitives — visual separation from the analyst portal
 *   signals elevated privilege context to the user.
 *
 *   Colour system:
 *     --admin-bg:      #0a0d14   dark navy base
 *     --admin-surface: #111827   card surface
 *     --admin-border:  #1f2937   subtle border
 *     --admin-accent:  #6366f1   indigo
 *     --admin-danger:  #ef4444
 *     --admin-warn:    #f59e0b
 *     --admin-ok:      #10b981
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import {
  useEffect, useRef,
  type ReactNode, type ElementType,
} from 'react'
import {
  AlertTriangle, CheckCircle, Info, XCircle, X,
  ShieldAlert,
} from 'lucide-react'
import type { ActionRisk } from '../../types/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Tokens — keeps Tailwind classes in one place
// ─────────────────────────────────────────────────────────────────────────────

export const A = {
  bg:      'bg-ink',
  surface: 'bg-ink/80',
  surface2:'bg-ficium/[0.06]',
  border:  'border-ficium/[0.12]',
  border2: 'border-ficium/[0.20]',
  accent:  'text-ficium',
  accentBg:'bg-ficium',
  muted:   'text-ink/45',
  text:    'text-ink/90',
  heading: 'text-white',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// RiskBadge
// ─────────────────────────────────────────────────────────────────────────────

const RISK_STYLE: Record<ActionRisk, string> = {
  low:      'bg-emerald-900/40 text-emerald-400 border border-emerald-800',
  medium:   'bg-amber-900/40  text-amber-400  border border-amber-800',
  high:     'bg-orange-900/40 text-orange-400 border border-orange-800',
  critical: 'bg-red-900/40   text-red-400   border border-red-800',
}

export function RiskBadge({ risk }: { risk: ActionRisk }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${RISK_STYLE[risk]}`}
      aria-label={`Risk: ${risk}`}
    >
      {risk === 'critical' && <ShieldAlert className='w-2.5 h-2.5' aria-hidden />}
      {risk}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge — user status / dc status / audit outcome
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  // user
  active:       'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  locked:       'bg-amber-900/40   text-amber-400   border-amber-800',
  suspended:    'bg-red-900/40     text-red-400     border-red-800',
  pending_mfa:  'bg-ficium/[0.15]  text-ficium  border-ficium/30',
  deactivated:  'bg-ink/60      text-ink/45   border-ink/[0.25]',
  // dc
  pending:      'bg-ficium/[0.15]  text-ficium  border-ficium/30',
  approved:     'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  rejected:     'bg-red-900/40     text-red-400     border-red-800',
  expired:      'bg-ink/60      text-ink/45   border-ink/[0.25]',
  cancelled:    'bg-ink/60      text-ink/45   border-ink/[0.25]',
  executed:     'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  // audit
  success:      'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  failed:       'bg-red-900/40     text-red-400     border-red-800',
  blocked:      'bg-orange-900/40  text-orange-400  border-orange-800',
  logged:       'bg-ink/60      text-ink/45   border-ink/[0.25]',
}

export function AStatusBadge({
  status,
  label,
}: {
  status: string
  label?: string
}) {
  const cls = STATUS_STYLE[status] ?? STATUS_STYLE.logged
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${cls}`}
      aria-label={`Status: ${label ?? status}`}
    >
      {label ?? status.replace(/_/g, '\u00A0')}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AKpiCard
// ─────────────────────────────────────────────────────────────────────────────

export function AKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  status = 'ok',
  loading = false,
}: {
  label:   string
  value:   string | number
  sub?:    string
  icon?:   ElementType
  status?: 'ok' | 'warn' | 'critical'
  loading?: boolean
}) {
  const borderCls = status === 'critical' ? 'border-red-800'
                  : status === 'warn'     ? 'border-amber-800'
                  :                         'border-ficium/[0.12]'
  const valCls    = status === 'critical' ? 'text-red-400'
                  : status === 'warn'     ? 'text-amber-400'
                  :                         'text-white'
  return (
    <div className={`bg-ink/80 rounded-xl border ${borderCls} p-5`}>
      {Icon && (
        <div className='w-8 h-8 rounded-lg bg-ficium/10 flex items-center justify-center mb-3'>
          <Icon className='w-4 h-4 text-ficium' aria-hidden />
        </div>
      )}
      {loading ? (
        <>
          <div className='h-7 w-16 bg-ink/40 rounded-lg mb-2 animate-pulse' />
          <div className='h-3 w-24 bg-ink/60 rounded animate-pulse' />
        </>
      ) : (
        <>
          <div className='text-[10px] font-bold text-ink/45 uppercase tracking-widest mb-1'>{label}</div>
          <div className={`text-[28px] font-black tracking-tight leading-none mb-1 ${valCls}`}>{value}</div>
          {sub && <div className='text-[11px] text-ink/45'>{sub}</div>}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ASectionHeader
// ─────────────────────────────────────────────────────────────────────────────

export function ASectionHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title:     string
  subtitle?: string
  badge?:    ReactNode
  actions?:  ReactNode
}) {
  return (
    <div className='flex items-start justify-between mb-7'>
      <div>
        <div className='flex items-center gap-3'>
          <h1 className='text-[24px] font-black text-white tracking-tight'>{title}</h1>
          {badge}
        </div>
        {subtitle && <p className='text-[12px] text-ink/45 mt-1 font-mono'>{subtitle}</p>}
      </div>
      {actions && <div className='flex items-center gap-2 flex-shrink-0'>{actions}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ADataTable
// ─────────────────────────────────────────────────────────────────────────────

export function ADataTable({
  headers,
  children,
  caption,
}: {
  headers:  string[]
  children: ReactNode
  caption?: string
}) {
  return (
    <div className='bg-ink/80 rounded-xl border border-ficium/[0.12] overflow-hidden'>
      <div className='overflow-x-auto'>
        <table className='w-full' role='grid' aria-label={caption}>
          {caption && <caption className='sr-only'>{caption}</caption>}
          <thead>
            <tr className='border-b border-ficium/[0.12] bg-ink/95'>
              {headers.map(h => (
                <th
                  key={h}
                  scope='col'
                  className='px-5 py-3.5 text-left text-[10px] font-bold text-ink/45 uppercase tracking-widest whitespace-nowrap'
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y divide-ficium/[0.12]'>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function ATr({
  children,
  onClick,
  selected = false,
}: {
  children:  ReactNode
  onClick?:  () => void
  selected?: boolean
}) {
  return (
    <tr
      className={[
        'transition-colors',
        onClick    ? 'cursor-pointer hover:bg-ficium/[0.06]' : 'hover:bg-[#131920]',
        selected   ? 'bg-ficium/[0.08]' : '',
      ].join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
    >
      {children}
    </tr>
  )
}

export function ATd({
  children,
  className = '',
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <td className={`px-5 py-3.5 text-[13px] text-ink/75 ${className}`}>
      {children ?? <span className='text-ink/30'>—</span>}
    </td>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loaders
// ─────────────────────────────────────────────────────────────────────────────

export function ASkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className='border-b border-ficium/[0.12]' aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className='px-5 py-4'>
          <div className={`h-3 bg-ink/60 rounded animate-pulse ${i === 0 ? 'w-32' : i === cols - 1 ? 'w-16' : 'w-24'}`} />
        </td>
      ))}
    </tr>
  )
}

export function ASkeletonCard() {
  return (
    <div className='bg-ink/80 rounded-xl border border-ficium/[0.12] p-5 animate-pulse' aria-hidden>
      <div className='w-8 h-8 bg-ink/60 rounded-lg mb-4' />
      <div className='h-3 w-16 bg-ink/40 rounded mb-2' />
      <div className='h-7 w-12 bg-slate-600 rounded mb-2' />
      <div className='h-3 w-24 bg-ink/60 rounded' />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AEmptyState
// ─────────────────────────────────────────────────────────────────────────────

export function AEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?:        ElementType
  title:        string
  description?: string
  action?:      ReactNode
}) {
  return (
    <div className='flex flex-col items-center justify-center py-20 bg-ink/80 rounded-xl border border-ficium/[0.12]'>
      {Icon && <Icon className='w-10 h-10 text-ink/20 mb-4' aria-hidden />}
      <p className='font-semibold text-ink/75 text-[14px] mb-1'>{title}</p>
      {description && <p className='text-[12px] text-ink/45 mb-4'>{description}</p>}
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AModal
// ─────────────────────────────────────────────────────────────────────────────

export function AModal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  danger = false,
}: {
  open:     boolean
  onClose:  () => void
  title:    string
  children: ReactNode
  width?:   string
  danger?:  boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const el = dialogRef.current?.querySelector<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    )
    el?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4'
      role='presentation'
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal
        aria-labelledby='admin-modal-title'
        className={`bg-ink/80 rounded-2xl border ${danger ? 'border-red-800' : 'border-ficium/[0.12]'} w-full ${width} shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-6 pt-5 pb-4 border-b ${danger ? 'border-red-900' : 'border-ficium/[0.12]'}`}>
          <h2 id='admin-modal-title' className='font-bold text-[16px] text-white'>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label='Close dialog'
            className='text-ink/45 hover:text-ink/90 transition-colors p-1 rounded-lg hover:bg-ficium/[0.04]'
          >
            <X className='w-4 h-4' />
          </button>
        </div>
        <div className='px-6 py-5'>{children}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AAlert
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_STYLES = {
  info:    { bg: 'bg-ficium/[0.12] border-ficium/30',   text: 'text-ficium-bright',  Icon: Info          },
  warning: { bg: 'bg-amber-900/30  border-amber-800',    text: 'text-amber-300',   Icon: AlertTriangle },
  success: { bg: 'bg-emerald-900/30 border-emerald-800', text: 'text-emerald-300', Icon: CheckCircle   },
  error:   { bg: 'bg-red-900/30    border-red-800',      text: 'text-red-300',     Icon: XCircle       },
}

export function AAlert({
  variant = 'info',
  children,
  onDismiss,
}: {
  variant?:  keyof typeof ALERT_STYLES
  children:  ReactNode
  onDismiss?: () => void
}) {
  const { bg, text, Icon } = ALERT_STYLES[variant]
  return (
    <div role='alert' className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${bg}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${text}`} aria-hidden />
      <div className={`text-[12px] flex-1 ${text}`}>{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label='Dismiss' className={`flex-shrink-0 hover:opacity-70 ${text}`}>
          <X className='w-3.5 h-3.5' />
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AFilterPills
// ─────────────────────────────────────────────────────────────────────────────

export function AFilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value:   T
  onChange:(v: T) => void
}) {
  return (
    <div role='tablist' className='flex items-center gap-1.5 flex-wrap'>
      {options.map(opt => (
        <button
          key={opt.key}
          role='tab'
          aria-selected={value === opt.key}
          onClick={() => onChange(opt.key)}
          className={[
            'text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all uppercase tracking-wide',
            value === opt.key
              ? 'bg-ficium text-white border-ficium'
              : 'bg-transparent border-ficium/[0.20] text-ink/45 hover:border-ficium/50 hover:text-ficium',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ABtn
// ─────────────────────────────────────────────────────────────────────────────

export function ABtn({
  children,
  onClick,
  disabled = false,
  loading  = false,
  variant  = 'primary',
  size     = 'md',
  icon: Icon,
  type     = 'button',
}: {
  children:  ReactNode
  onClick?:  () => void
  disabled?: boolean
  loading?:  boolean
  variant?:  'primary' | 'secondary' | 'ghost' | 'danger' | 'warn'
  size?:     'sm' | 'md'
  icon?:     ElementType
  type?:     'button' | 'submit'
}) {
  const base  = 'inline-flex items-center gap-2 font-bold rounded-xl transition-all disabled:opacity-40'
  const sizes = { sm: 'px-3.5 py-2 text-[11px]', md: 'px-5 py-2.5 text-[13px]' }
  const vars  = {
    primary:   'bg-ficium hover:bg-ficium-deep text-white',
    secondary: 'bg-[#1f2937] border border-ficium/[0.25] text-ink/75 hover:border-ficium-deep',
    ghost:     'bg-transparent text-ink/45 hover:text-ink/90 hover:bg-ficium/[0.04]',
    danger:    'bg-red-500 hover:bg-red-600 text-white',
    warn:      'bg-amber-500 hover:bg-amber-600 text-white',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${vars[variant]}`}
    >
      {loading
        ? <span className='w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' />
        : Icon && <Icon className='w-3.5 h-3.5' aria-hidden />
      }
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AFormField + inputCls
// ─────────────────────────────────────────────────────────────────────────────

export const aInputCls =
  'w-full bg-ink/95 border border-ficium/[0.20] rounded-xl px-4 py-2.5 text-[13px] text-ink/90 outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 transition-all placeholder:text-ink/30 font-mono'

export function AFormField({
  label,
  hint,
  error,
  children,
}: {
  label:    string
  hint?:    string
  error?:   string
  children: ReactNode
}) {
  return (
    <div>
      <label className='block text-[11px] font-bold text-ink/60 uppercase tracking-widest mb-1.5'>{label}</label>
      {children}
      {hint  && <p className='text-[11px] text-ink/30 mt-1'>{hint}</p>}
      {error && <p className='text-[11px] text-red-400 mt-1 font-semibold'>{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AMonoRef
// ─────────────────────────────────────────────────────────────────────────────

export function AMonoRef({ value, short = true }: { value: string; short?: boolean }) {
  const display = short ? `${value.slice(0, 8)}…` : value
  return (
    <code title={value} className='text-[11px] font-mono bg-ink/60 px-2 py-0.5 rounded-lg text-ink/60'>
      {display}
    </code>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AConfirmModal — two-step destructive action
// ─────────────────────────────────────────────────────────────────────────────

export function AConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  risk         = 'high',
  notePlaceholder,
  noteRequired = false,
  isPending    = false,
  note,
  onNoteChange,
}: {
  open:             boolean
  onClose:          () => void
  onConfirm:        () => void
  title:            string
  description?:     string
  confirmLabel?:    string
  risk?:            ActionRisk
  notePlaceholder?: string
  noteRequired?:    boolean
  isPending?:       boolean
  note?:            string
  onNoteChange?:    (v: string) => void
}) {
  const btnCls = risk === 'critical' || risk === 'high'
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-amber-500 hover:bg-amber-600 text-white'

  return (
    <AModal open={open} onClose={onClose} title={title} danger={risk === 'critical' || risk === 'high'}>
      {description && <p className='text-[13px] text-ink/60 mb-4'>{description}</p>}
      <div className='mb-4'>
        <RiskBadge risk={risk} />
        <p className='text-[11px] text-ink/45 mt-2'>
          This action enters the dual-control queue. A second admin must approve before execution.
        </p>
      </div>
      {notePlaceholder !== undefined && (
        <textarea
          value={note ?? ''}
          onChange={e => onNoteChange?.(e.target.value)}
          rows={3}
          placeholder={notePlaceholder}
          aria-label='Reason'
          className={`${aInputCls} resize-none mb-4`}
        />
      )}
      <div className='flex gap-3 pt-1'>
        <button
          onClick={onConfirm}
          disabled={(noteRequired && !note?.trim()) || isPending}
          className={`flex-1 font-bold py-2.5 rounded-xl text-[13px] transition-colors disabled:opacity-40 ${btnCls}`}
        >
          {isPending
            ? <span className='flex items-center justify-center gap-2'>
                <span className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                Submitting…
              </span>
            : confirmLabel
          }
        </button>
        <button
          onClick={onClose}
          className='px-5 text-[13px] font-semibold text-ink/60 border border-ficium/[0.20] rounded-xl hover:bg-ficium/[0.04] transition-colors'
        >
          Cancel
        </button>
      </div>
    </AModal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveBadge (admin variant)
// ─────────────────────────────────────────────────────────────────────────────

export function ALiveBadge({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className='inline-flex items-center gap-1.5 bg-emerald-900/40 border border-emerald-800 text-emerald-400 font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest'>
      <span className='w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse' aria-hidden />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionTag
// ─────────────────────────────────────────────────────────────────────────────

export function PermissionTag({ perm }: { perm: string }) {
  return (
    <span className='inline-block bg-ink/60 text-ink/60 text-[10px] font-mono px-2 py-0.5 rounded border border-ink/[0.25]'>
      {perm}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────────────

export function ADivider() {
  return <div className='border-t border-ficium/[0.12] my-5' aria-hidden />
}

// ─────────────────────────────────────────────────────────────────────────────
// Spinner
// ─────────────────────────────────────────────────────────────────────────────

export function ASpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size]
  return (
    <div className={`${s} border-2 border-ficium border-t-transparent rounded-full animate-spin`} aria-label='Loading' />
  )
}
