import type { ReactNode } from "react";

type Props = {
  label?: string;
  htmlFor?: string;
  hint?: string;
  optional?: boolean;
  error?: string;
  rightLabel?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Field wraps a form input with its label, optional hint, and error message.
 * Use it around <Input>, <Select>, etc. to keep all forms visually consistent.
 */
export function Field({
  label,
  htmlFor,
  hint,
  optional,
  error,
  rightLabel,
  children,
  className = "",
}: Props) {
  return (
    <div className={className}>
      {(label || rightLabel) && (
        <div className="flex items-baseline justify-between mb-1.5">
          {label && (
            <label htmlFor={htmlFor} className="block text-xs sm:text-[13px] font-semibold text-ink">
              {label}
              {optional && (
                <span className="ml-1.5 text-muted font-medium">optional</span>
              )}
            </label>
          )}
          {rightLabel}
        </div>
      )}
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}