/**
 * CloseDealModal — end a deal that will not proceed.
 *
 *   Declined  — the bank declines (conditions not met, affordability, fraud…)
 *   Withdrawn — the borrower withdrew
 *
 * The reason is mandatory: it stays on the deal and in the audit log. Any
 * credit approval still running is withdrawn by the server.
 */
import { useState } from "react";
import { Modal, Btn, InlineAlert, FormField, inputCls } from "@/institution/components/primitives";
import { useCloseDeal } from "@/institution/pipeline/hooks/usePipeline";
import { PortalApiError } from "@/shared/lib/portalApi";

type Outcome = "declined" | "withdrawn";

export function CloseDealModal({ pipelineId, onClose }: { pipelineId: string; onClose: () => void }) {
  const close = useCloseDeal(pipelineId);
  const [outcome, setOutcome] = useState<Outcome>("declined");
  const [reason, setReason]   = useState("");
  const [error, setError]     = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (reason.trim().length < 5) {
      setError("Give a reason (at least 5 characters).");
      return;
    }
    try {
      await close.mutateAsync({ outcome, reason: reason.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof PortalApiError || e instanceof Error ? e.message : "Couldn't close the deal. Try again.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Close deal" width="max-w-md">
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-[12px] font-semibold text-ink mb-1">Outcome</legend>
          {([
            ["declined",  "Declined by us",       "Conditions not met, affordability, fraud or policy."],
            ["withdrawn", "Withdrawn by borrower", "The borrower no longer wants this facility."],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${
              outcome === value ? "border-ficium/50 bg-ficium/4" : "border-ink/[0.08]"}`}>
              <input type="radio" name="outcome" value={value} checked={outcome === value}
                     onChange={() => setOutcome(value)} className="mt-1 accent-ficium" />
              <span>
                <span className="block text-[13px] font-medium text-ink">{label}</span>
                <span className="block text-[11px] text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <FormField label="Reason" required hint="Kept on the deal and in the audit log.">
          <textarea className={`${inputCls} resize-none`} rows={3} value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={outcome === "declined" ? "e.g. Debt service ratio above policy limit" : "e.g. Borrower accepted another offer"} />
        </FormField>

        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" loading={close.isPending} onClick={submit}>
            {outcome === "declined" ? "Decline deal" : "Mark withdrawn"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
