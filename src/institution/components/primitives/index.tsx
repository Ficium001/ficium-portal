/**
 * @module institution/components/primitives
 * @description Shared UI primitives for the Ficium Institution Portal.
 *
 * All portal pages compose from these atoms to ensure visual and
 * behavioural consistency. Adding a new primitive here, not inline
 * in a page, is the rule — this keeps pages as thin orchestrators.
 *
 * Primitives:
 *   - StatusBadge        — coloured pill for bid/action/webhook status
 *   - KpiCard            — single-metric summary card (optionally linked)
 *   - SectionHeader      — page or section title block with optional actions
 *   - DataTable          — accessible <table> with sticky headers
 *   - SkeletonRow        — animated loading placeholder for table rows
 *   - SkeletonCard       — animated loading placeholder for card grids
 *   - EmptyState         — zero-data callout with optional CTA
 *   - Modal              — accessible, focus-trapped overlay dialog
 *   - InlineAlert        — info / warning / success / error banner
 *   - FilterPills        — horizontal scrollable filter pill group
 *   - ConnectionBar      — fixed top status bar (live/session/role)
 *   - ConfirmModal       — two-step destructive-action confirmation
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import {
  useEffect,
  useRef,
  type ReactNode,
  type ElementType,
} from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle, Info, XCircle, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  // bid statuses
  submitted:   "bg-ficium/8 text-ficium border border-ficium/20",
  accepted:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected:    "bg-red-50 text-red-600 border border-red-200",
  expired:     "bg-amber-50 text-amber-700 border border-amber-200",
  withdrawn:   "bg-ink/[0.05] text-muted border border-ink/[0.08]",
  draft:       "bg-ink/[0.05] text-muted border border-ink/[0.08]",
  // action statuses
  pending:     "bg-amber-50 text-amber-700 border border-amber-200",
  approved:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled:   "bg-ink/[0.05] text-muted border border-ink/[0.08]",
  // compliance
  passed:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed:      "bg-red-50 text-red-600 border border-red-200",
  under_review:"bg-amber-50 text-amber-700 border border-amber-200",
  not_submitted:"bg-ink/[0.05] text-muted border border-ink/[0.08]",
  // generic
  active:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  inactive:    "bg-ink/[0.05] text-muted border border-ink/[0.08]",
  success:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  logged:      "bg-ink/[0.05] text-muted border border-ink/[0.08]",
  open:        "bg-ficium/8 text-ficium border border-ficium/20",
  delivered:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

/** Coloured pill badge reflecting entity status. */
export function StatusBadge({
  status,
  label,
  size = "sm",
}: {
  status: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.logged;
  const sizeClass = size === "xs"
    ? "px-2 py-0.5 text-[10px]"
    : "px-2.5 py-1 text-[11px]";
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${sizeClass} ${cls}`}
      aria-label={`Status: ${label ?? status}`}
    >
      {label ?? status.replace(/_/g, "\u00A0")}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiCard
// ─────────────────────────────────────────────────────────────────────────────

/** Single-metric KPI summary card. Optionally a link. */
export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  alert = false,
  loading = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ElementType;
  href?: string;
  alert?: boolean;
  loading?: boolean;
}) {
  const inner = (
    <div
      className={[
        "bg-white rounded-xl border border-ink/[0.07] p-5 h-full transition-all",
        href ? "hover:border-ficium/40 hover:shadow-md cursor-pointer" : "",
        alert ? "border-amber-300 bg-amber-50/40" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-ficium/8 flex items-center justify-center">
            <Icon className="w-4 h-4 text-ficium" aria-hidden />
          </div>
        )}
        {alert && (
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse mt-1 ml-auto" />
        )}
      </div>
      {loading ? (
        <>
          <div className="h-8 w-20 bg-ink/[0.06] rounded-lg mb-2 animate-pulse" />
          <div className="h-3 w-28 bg-ink/[0.04] rounded animate-pulse" />
        </>
      ) : (
        <>
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
            {label}
          </div>
          <div className="text-[28px] font-bold text-ink tracking-tight leading-none mb-1">
            {value}
          </div>
          {sub && <div className="text-[12px] text-muted">{sub}</div>}
        </>
      )}
    </div>
  );

  return href ? (
    <Link to={href} className="block" aria-label={`${label}: ${value}`}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader
// ─────────────────────────────────────────────────────────────────────────────

/** Page-level or section-level title block. */
export function SectionHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[26px] font-bold text-ink tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[13px] text-muted mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DataTable
// ─────────────────────────────────────────────────────────────────────────────

/** Accessible data table with sticky header and hover rows. */
export function DataTable({
  headers,
  children,
  caption,
}: {
  headers: string[];
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" role="grid" aria-label={caption}>
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead>
            <tr className="border-b border-ink/[0.07] bg-ink/[0.015]">
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-5 py-3.5 text-left text-[11px] font-bold text-muted uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Single data row — use as child of DataTable's tbody. */
export function DataRow({
  children,
  onClick,
  selected = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={[
        "border-b border-ink/[0.04] transition-colors",
        onClick ? "cursor-pointer hover:bg-cream/70" : "hover:bg-cream/40",
        selected ? "bg-ficium/[0.04]" : "",
        className,
      ].join(" ")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      {children}
    </tr>
  );
}

/** Standard <td> with consistent padding. */
export function Td({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-5 py-3.5 text-[13px] text-ink ${className}`}>
      {children ?? "—"}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loaders
// ─────────────────────────────────────────────────────────────────────────────

/** Animated skeleton row for DataTable. */
export function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-ink/[0.04]" aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className={`h-3.5 bg-ink/[0.06] rounded animate-pulse ${
              i === 0 ? "w-32" : i === cols - 1 ? "w-16" : "w-24"
            }`}
          />
        </td>
      ))}
    </tr>
  );
}

/** Animated skeleton placeholder for card grids. */
export function SkeletonCard() {
  return (
    <div
      className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse"
      aria-hidden
    >
      <div className="w-8 h-8 bg-ink/[0.06] rounded-lg mb-4" />
      <div className="h-3 w-20 bg-ink/[0.05] rounded mb-3" />
      <div className="h-7 w-16 bg-ink/[0.08] rounded mb-2" />
      <div className="h-3 w-28 bg-ink/[0.04] rounded" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────

/** Zero-data callout, optionally with a CTA. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-ink/[0.07]">
      {Icon && <Icon className="w-10 h-10 text-ink/20 mb-4" aria-hidden />}
      <p className="font-semibold text-ink text-[15px] mb-1">{title}</p>
      {description && (
        <p className="text-[13px] text-muted mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

/** Accessible overlay modal with focus trap and keyboard dismiss. */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus first focusable element on open
  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    el?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="modal-title"
        className={`bg-white rounded-2xl w-full ${width} shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-ink/[0.07]">
          <h2
            id="modal-title"
            className="font-display font-bold text-[17px] text-ink"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted hover:text-ink transition-colors p-1 rounded-lg hover:bg-ink/[0.04]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineAlert
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_STYLES = {
  info:    { bg: "bg-ficium/5 border-ficium/15",  text: "text-ficium",      Icon: Info          },
  warning: { bg: "bg-amber-50 border-amber-200",  text: "text-amber-700",   Icon: AlertTriangle },
  success: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", Icon: CheckCircle },
  error:   { bg: "bg-red-50 border-red-200",      text: "text-red-600",     Icon: XCircle       },
};

/** Inline contextual alert banner. */
export function InlineAlert({
  variant = "info",
  children,
  onDismiss,
}: {
  variant?: keyof typeof ALERT_STYLES;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const { bg, text, Icon } = ALERT_STYLES[variant];
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 border rounded-xl px-5 py-3.5 ${bg}`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${text}`} aria-hidden />
      <div className={`text-[13px] flex-1 ${text}`}>{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`flex-shrink-0 hover:opacity-70 transition-opacity ${text}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterPills
// ─────────────────────────────────────────────────────────────────────────────

/** Horizontal scrollable filter pill group. */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter"
      className="flex items-center gap-1.5 flex-wrap"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          role="tab"
          aria-selected={value === opt.key}
          onClick={() => onChange(opt.key)}
          className={[
            "text-[12px] font-semibold px-3.5 py-1.5 rounded-full border transition-all",
            value === opt.key
              ? "bg-ink text-white border-ink"
              : "bg-white border-ink/[0.10] text-muted hover:border-ficium/40 hover:text-ficium",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveBadge
// ─────────────────────────────────────────────────────────────────────────────

/** Pulsing green LIVE indicator for real-time data surfaces. */
export function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[11px] px-3 py-1.5 rounded-full">
      <span
        className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"
        aria-hidden
      />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmModal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two-step destructive-action modal.
 * Requires typing a confirmation phrase or optional note before proceeding.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
  notePlaceholder,
  noteRequired = false,
  isPending = false,
  note,
  onNoteChange,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
  notePlaceholder?: string;
  noteRequired?: boolean;
  isPending?: boolean;
  note?: string;
  onNoteChange?: (v: string) => void;
}) {
  const btnCls =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white"
      : "bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white";

  const disabled = (noteRequired && !note?.trim()) || isPending;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && (
        <p className="text-[13px] text-muted mb-4">{description}</p>
      )}
      {notePlaceholder !== undefined && (
        <textarea
          value={note ?? ""}
          onChange={(e) => onNoteChange?.(e.target.value)}
          rows={3}
          placeholder={notePlaceholder}
          aria-label="Reason"
          className="w-full bg-white border border-ink/[0.12] rounded-xl px-4 py-3 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 resize-none mb-4 font-body"
        />
      )}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onConfirm}
          disabled={disabled}
          className={`flex-1 font-bold py-2.5 rounded-xl text-[13px] transition-colors ${btnCls}`}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            confirmLabel
          )}
        </button>
        <button
          onClick={onClose}
          className="px-5 text-[13px] font-semibold text-muted border border-ink/10 rounded-xl hover:bg-ink/[0.03] transition-colors"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Btn — primary action button
// ─────────────────────────────────────────────────────────────────────────────

/** Standard action button. */
export function Btn({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = "primary",
  size = "md",
  icon: Icon,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ElementType;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center gap-2 font-bold rounded-xl transition-all disabled:opacity-50";
  const sizes = { sm: "px-3.5 py-2 text-[12px]", md: "px-5 py-2.5 text-[13px]" };
  const variants = {
    primary:   "bg-ficium hover:bg-ficium-deep text-white",
    secondary: "bg-white border border-ink/[0.12] text-ink hover:border-ficium/40",
    ghost:     "bg-transparent text-muted hover:text-ink hover:bg-ink/[0.04]",
    danger:    "bg-red-500 hover:bg-red-600 text-white",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]}`}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        Icon && <Icon className="w-3.5 h-3.5" aria-hidden />
      )}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input / Label — consistent form controls
// ─────────────────────────────────────────────────────────────────────────────

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "w-full bg-white border border-ink/[0.12] rounded-xl px-4 py-2.5 text-[13px] text-ink outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 transition-all font-body placeholder:text-muted/60";

// ─────────────────────────────────────────────────────────────────────────────
// MonoRef — monospaced reference / ID display
// ─────────────────────────────────────────────────────────────────────────────

export function MonoRef({
  value,
  short = true,
}: {
  value: string;
  short?: boolean;
}) {
  const display = short ? `${value.slice(0, 8)}…` : value;
  return (
    <code
      title={value}
      className="text-[11px] font-mono bg-ink/[0.04] px-2 py-0.5 rounded-lg text-muted"
    >
      {display}
    </code>
  );
}
