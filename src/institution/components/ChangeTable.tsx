/**
 * What a four-eyes request changes: each field as it is now and as it will be after approval.
 *
 * The table is written by the database when the request is made (db/063) and frozen on it,
 * so the approver sees exactly what the maker saw, with names instead of ids. If the record
 * changes before approval, the database refuses the approval.
 */
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { PendingAction, ActionChangeRow } from "@/institution/types/institution";

const dash = <span className="text-muted">—</span>;

export function hasChange(action: PendingAction): boolean {
  return Array.isArray(action.change?.rows) && action.change!.rows.length > 0;
}

export default function ChangeTable({ action, decided = false }: { action: PendingAction; decided?: boolean }) {
  const rows: ActionChangeRow[] = action.change?.rows ?? [];
  const described = action.change?.described !== false;
  const isNew = rows.length > 0 && rows.every((r) => r.before == null);

  return (
    <section aria-label="What this changes">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[11px] font-bold text-ficium uppercase tracking-wider">What this changes</h3>
        {action.resource_label && <span className="text-[13px] font-semibold text-ink truncate">{action.resource_label}</span>}
      </div>

      {!described && (
        <p role="note" className="flex gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden />
          Ficium couldn't describe this change in plain words, so the raw request is shown. Reject it if you can't tell exactly what it does.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">No details were recorded for this request.</p>
      ) : (
        <div className="bg-white border border-ink/8 rounded-xl overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-ink/6">
                <th scope="col" className="px-4 py-2 font-semibold">Field</th>
                {!isNew && <th scope="col" className="px-4 py-2 font-semibold">{decided ? "Before" : "Now"}</th>}
                <th scope="col" className="px-4 py-2 font-semibold">{decided ? "After" : isNew ? "Will be" : "After approval"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const changed = r.before !== r.after;
                return (
                  <tr key={`${r.field}-${i}`} className={i < rows.length - 1 ? "border-b border-ink/6" : ""}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted align-top whitespace-nowrap">{r.field}</th>
                    {!isNew && (
                      <td className={`px-4 py-2.5 align-top wrap-break-word ${changed && r.before != null ? "text-ink/60 line-through decoration-ink/30" : "text-ink/80"}`}>
                        {r.before ?? dash}
                      </td>
                    )}
                    <td className={`px-4 py-2.5 align-top wrap-break-word ${changed ? "font-semibold text-ink" : "text-ink/80"}`}>
                      <span className="inline-flex items-start gap-1.5">
                        {!isNew && changed && <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ficium" aria-hidden />}
                        <span>{r.after ?? dash}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!decided && (
        <p className="text-[11px] text-muted mt-1.5">
          Recorded when the request was made. If the record changes before approval, approval is refused.
        </p>
      )}
    </section>
  );
}
