import { forwardRef } from "react";
import type { SelectHTMLAttributes, ReactNode } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  children: ReactNode;
};

const chevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6B85' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { invalid, className = "", style, children, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        "w-full pl-4 pr-10 py-3 sm:py-3.5",
        "text-[15px] font-body text-ink",
        "bg-white border-[1.5px] rounded-xl outline-hidden",
        "appearance-none transition-colors",
        invalid
          ? "border-red-600 focus:ring-2 focus:ring-red-600/20"
          : "border-ink/12 focus:border-ficium focus:ring-2 focus:ring-ficium/15",
        "disabled:bg-ink/5 disabled:cursor-not-allowed",
        className,
      ].join(" ")}
      style={{
        backgroundImage: chevron,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
});