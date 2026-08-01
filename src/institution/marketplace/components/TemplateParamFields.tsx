// =============================================================
// Ficium Portal — structured message parameter editor
//
// Institution message templates carry a `params_schema` describing the
// placeholders in their `body_template` (e.g. "Approval typically takes
// {days} business days."). The API substitutes params server-side; if a
// placeholder has no matching param it is left in the body VERBATIM, so
// an unfilled form sends the borrower a literal "{days}". This component
// renders the right input per declared type and reports validity so the
// composer can block sending until every placeholder is satisfied.
// =============================================================
import type { ReactNode } from "react";

export type ParamSpec = {
  type: "int" | "decimal" | "enum" | "string_list" | "label_amount_list";
  min?: number;
  max?: number;
  values?: string[];
  max_items?: number;
  max_len?: number;
};

export type ParamValues = Record<string, unknown>;

const humanise = (s: string) =>
  s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** True when every declared param has a usable value. */
export function paramsComplete(
  schema: Record<string, ParamSpec> | undefined,
  values: ParamValues,
): boolean {
  if (!schema) return true;
  return Object.entries(schema).every(([key, spec]) => {
    const v = values[key];
    if (v === undefined || v === null || v === "") return false;
    if (spec.type === "int" || spec.type === "decimal") {
      const n = Number(v);
      if (Number.isNaN(n)) return false;
      if (spec.min != null && n < spec.min) return false;
      if (spec.max != null && n > spec.max) return false;
      if (spec.type === "int" && !Number.isInteger(n)) return false;
      return true;
    }
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim().length > 0;
  });
}

function Wrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full text-[13px] rounded-xl border border-ink/12 px-3 py-2 bg-white focus:outline-none focus:border-ficium/50";

export default function TemplateParamFields({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, ParamSpec> | undefined;
  values: ParamValues;
  onChange: (next: ParamValues) => void;
}) {
  if (!schema || Object.keys(schema).length === 0) return null;

  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <div className="space-y-2.5 bg-cream rounded-xl p-3 border border-ink/[0.07]">
      {Object.entries(schema).map(([key, spec]) => {
        const label = humanise(key);

        if (spec.type === "int" || spec.type === "decimal") {
          return (
            <Wrap key={key} label={label}>
              <input
                type="number"
                inputMode={spec.type === "int" ? "numeric" : "decimal"}
                step={spec.type === "int" ? 1 : "any"}
                min={spec.min}
                max={spec.max}
                value={(values[key] as number | string) ?? ""}
                onChange={(e) =>
                  set(key, e.target.value === "" ? "" : Number(e.target.value))
                }
                className={inputCls}
              />
            </Wrap>
          );
        }

        if (spec.type === "enum") {
          return (
            <Wrap key={key} label={label}>
              <select
                value={(values[key] as string) ?? ""}
                onChange={(e) => set(key, e.target.value)}
                className={inputCls}
              >
                <option value="">Select…</option>
                {(spec.values ?? []).map((v) => (
                  <option key={v} value={v}>{humanise(v)}</option>
                ))}
              </select>
            </Wrap>
          );
        }

        // string_list and label_amount_list are both comma-separated entry.
        // The API joins arrays with ", " when substituting, so sending an
        // array keeps the rendered body identical to what's previewed here.
        const asArray = Array.isArray(values[key]) ? (values[key] as string[]) : [];
        return (
          <Wrap key={key} label={label}>
            <input
              type="text"
              placeholder={
                spec.type === "label_amount_list"
                  ? "e.g. Arrangement fee MUR 5000, Valuation MUR 3000"
                  : "Comma-separated"
              }
              value={asArray.join(", ")}
              onChange={(e) =>
                set(
                  key,
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, spec.max_items ?? 12)
                    .map((s) => (spec.max_len ? s.slice(0, spec.max_len) : s)),
                )
              }
              className={inputCls}
            />
            {spec.max_items != null && (
              <p className="text-[10px] text-muted/70 mt-1">
                {asArray.length}/{spec.max_items} items
              </p>
            )}
          </Wrap>
        );
      })}
    </div>
  );
}
