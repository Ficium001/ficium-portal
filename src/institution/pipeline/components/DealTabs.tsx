/**
 * DealTabs — the deal page's section switcher.
 *
 * WAI-ARIA tabs pattern: arrow keys move between tabs, Home/End jump to the
 * ends, only the active tab is in the tab order. Scrolls horizontally on
 * narrow screens rather than wrapping.
 */
import { useRef, type KeyboardEvent } from "react";

export interface DealTab<K extends string> {
  key:    K;
  label:  string;
  /** Small status text after the label, e.g. "3/5" or "2 waiting". */
  badge?: string;
}

export function DealTabs<K extends string>({
  tabs, active, onChange,
}: {
  tabs:     DealTab<K>[];
  active:   K;
  onChange: (key: K) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (e.key === "ArrowLeft")  next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === "Home")       next = 0;
    if (e.key === "End")        next = tabs.length - 1;
    const target = tabs[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.key);
    refs.current[target.key]?.focus();
  };

  return (
    <div role="tablist" aria-label="Deal sections"
         className="flex gap-1 border-b border-line overflow-x-auto">
      {tabs.map((t, i) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            role="tab"
            id={`deal-tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`deal-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative shrink-0 px-3 py-2.5 text-[13px] font-semibold transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ficium/40 rounded-t-md
              ${selected ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.badge && (
              <span className={`ml-1.5 text-[11px] font-medium ${selected ? "text-ficium" : "text-muted"}`}>
                {t.badge}
              </span>
            )}
            {selected && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-ficium rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}
