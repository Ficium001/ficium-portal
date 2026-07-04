import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padded?: boolean;
};

/**
 * Card — white surface with soft border, used to wrap form bodies, dashboards,
 * and any content block that sits on the cream background.
 */
export function Card({
  children,
  className = "",
  padded = true,
  ...rest
}: Props) {
  return (
    <div
      className={[
        "bg-white rounded-2xl border border-ink/6",
        padded ? "p-6 sm:p-8" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}