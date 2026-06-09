import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 font-semibold font-body " +
  "transition-colors rounded-pill " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3 text-sm sm:text-base",
  lg: "px-7 py-4 text-base sm:text-lg",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-ficium text-white shadow-ficium hover:bg-ficium-deep " +
    "focus-visible:ring-ficium active:bg-ficium-deep",
  secondary:
    "bg-white text-ink border border-ink/15 hover:border-ink/30 " +
    "focus-visible:ring-ficium",
  ghost:
    "bg-transparent text-ink hover:bg-ink/5 " +
    "focus-visible:ring-ficium",
  danger:
    "bg-red-600 text-white hover:bg-red-700 " +
    "focus-visible:ring-red-600",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  disabled,
  children,
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={[
        base,
        sizes[size],
        variants[variant],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 size={size === "sm" ? 14 : 18} className="animate-spin" />
          <span>Loading…</span>
        </>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
}