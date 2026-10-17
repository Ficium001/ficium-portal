/**
 * CreditDecisionForm — record a credit decision made in the institution's own
 * credit system, for a product whose credit stage is decided externally.
 *
 * The API enforces every rule (reference required, conditions only with a
 * conditional approval, reason for refer-back and decline, date not in the
 * future); the form mirrors them so the officer finds out before submitting.
 */
import { useState } from "react";
import { Button } from "@/shared/ui";
import { useRecordCreditDecision } from "@/institution/pipeline/hooks/usePipeline";
import type { CreditOutcome } from "@/institution/pipeline/types/pipeline";

const OUTCOMES: { value: CreditOutcome; label: string; hint: string }[] = [
  { value: "approved",                 label: "Approved",
    hint: "The deal moves to its next stage." },
  { value: "approved_with_conditions", label: "Approved with conditions",
    hint: "The deal moves on; the conditions stay on record." },
  { value: "referred_back",            label: "Referred back",
    hint: "The stage stays open with the credit team's reason." },
  { value: "declined",                 label: "Declined",
    hint: "The deal is declined and closed." },
];

const ACTION: Record<CreditOutcome, string> = {
  approved:                 "Record approval",
  approved_with_conditions: "Record conditional approval",
  referred_back:            "Record referral",
  declined:                 "Decline deal",
};

const inputCls =
  "w-full text-[13px] border border-ink/12 rounded-xl px-3 py-2 bg-white outline-hidden " +
  "focus:border-ficium/40 focus:ring-2 focus:ring-ficium/15 transition-all";

const today = () => new Date().toISOString().slice(0, 10);

export function CreditDecisionForm({ pipelineId }: { pipelineId: string }) {
  const [outcome,    setOutcome]    = useState<CreditOutcome | null>(null);
  const [reference,  setReference]  = useState("");
  const [conditions, setConditions] = useState("");
  const [reason,     setReason]     = useState("");
  const [decidedOn,  setDecidedOn]  = useState(today());
  const [error,      setError]      = useState<string | null>(null);

  const { mutate, isPending } = useRecordCreditDecision(pipelineId);

  const conditionList = conditions.split("\n").map((c) => c.trim()).filter(Boolean);
  const needsReason   = outcome === "referred_back" || outcome === "declined";
  const missing =
    !outcome ? "Choose the credit decision."
    : !reference.trim() ? "Enter the credit reference."
    : outcome === "approved_with_conditions" && conditionList.length === 0
      ? "List at least one condition."
    : needsReason && reason.trim().length < 5 ? "Give the reason (at least 5 characters)."
    : null;

  function submit() {
    if (!outcome || missing) return;
    setError(null);
    // A date alone means "that day"; today means now, so the API's
    // "not in the future" check never trips on a time zone.
    const decided_at = decidedOn && decidedOn !== today()
      ? new Date(`${decidedOn}T12:00:00`).toISOString() : undefined;
    mutate(
      {
        outcome,
        external_reference: reference.trim(),
        conditions: outcome === "approved_with_conditions" ? conditionList : undefined,
        reason: needsReason ? reason.trim() : undefined,
        decided_at,
      },
      {
        onSuccess: () => { setOutcome(null); setReference(""); setConditions(""); setReason(""); },
        onError: (e) => setError(e instanceof Error ? e.message : "That didn't go through. Try again."),
      },
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <fieldset>
        <legend className="text-[12px] font-semibold text-ink mb-2">Credit decision</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer
                          bg-white transition-colors focus-within:ring-2 focus-within:ring-ficium/25 ${
                outcome === o.value
                  ? o.value === "declined" ? "border-red-300 bg-red-50/60" : "border-ficium/50 bg-ficium/4"
                  : "border-ink/10 hover:border-ink/20"}`}
            >
              <input
                type="radio" name={`credit-outcome-${pipelineId}`} value={o.value}
                checked={outcome === o.value} onChange={() => setOutcome(o.value)}
                className="mt-0.5 accent-ficium"
              />
              <span>
                <span className="block text-[13px] font-medium text-ink">{o.label}</span>
                <span className="block text-[11px] text-muted leading-snug">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="block text-[12px] font-medium text-ink mb-1">Credit reference</span>
          <input
            className={inputCls} value={reference} maxLength={64}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Application or committee minute number"
          />
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-ink mb-1">Decided on</span>
          <input
            type="date" className={inputCls} value={decidedOn} max={today()}
            onChange={(e) => setDecidedOn(e.target.value)}
          />
        </label>
      </div>

      {outcome === "approved_with_conditions" && (
        <label className="block">
          <span className="block text-[12px] font-medium text-ink mb-1">Conditions</span>
          <textarea
            className={`${inputCls} resize-none`} rows={3} value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder={"One per line, e.g.\nLife cover assigned to the bank\nSalary domiciled for the loan term"}
          />
        </label>
      )}

      {needsReason && (
        <label className="block">
          <span className="block text-[12px] font-medium text-ink mb-1">
            {outcome === "declined" ? "Reason for declining" : "What the credit team needs"}
          </span>
          <textarea
            className={`${inputCls} resize-none`} rows={2} value={reason} maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}

      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}

      <Button
        size="sm" className="w-full" loading={isPending} disabled={!!missing}
        variant={outcome === "declined" ? "danger" : undefined}
        onClick={submit}
        title={missing ?? undefined}
      >
        {outcome ? ACTION[outcome] : "Record credit decision"}
      </Button>
    </div>
  );
}
