import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { invalid, className = "", ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        "w-full px-4 py-3 sm:py-3.5",
        "text-[15px] font-body text-ink",
        "bg-white border-[1.5px] rounded-xl outline-hidden",
        "transition-colors",
        invalid
          ? "border-red-600 focus:ring-2 focus:ring-red-600/20"
          : "border-ink/12 focus:border-ficium focus:ring-2 focus:ring-ficium/15",
        "placeholder:text-muted",
        "disabled:bg-ink/5 disabled:cursor-not-allowed",
        className,
      ].join(" ")}
      {...rest}
    />
  );
});