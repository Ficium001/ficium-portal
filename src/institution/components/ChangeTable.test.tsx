import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect } from "vitest";
import ChangeTable, { hasChange } from "./ChangeTable";
import type { PendingAction } from "@/institution/types/institution";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  id: "a1", action_category: "user.update", action_status: "pending", maker_id: "m", maker_role: "maker",
  initiated_at: "2026-11-14T00:00:00Z", resource_type: "member", payload: {}, expires_at: "2026-11-15T00:00:00Z",
  created_at: "2026-11-14T00:00:00Z",
} as unknown as PendingAction;

async function render(action: PendingAction, decided = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => { createRoot(host).render(<ChangeTable action={action} decided={decided} />); });
  return host;
}

describe("ChangeTable", () => {
  it("shows each field as it is now and after approval, with the record's name", async () => {
    const h = await render({ ...base, resource_label: "Asha Test",
      change: { rows: [{ field: "Role", before: "viewer", after: "checker" }], described: true } });
    expect(h.textContent).toContain("Asha Test");
    const cells = [...h.querySelectorAll("tbody td, tbody th")].map((c) => c.textContent?.trim());
    expect(cells).toEqual(["Role", "viewer", "checker"]);
    expect(h.querySelector("thead")!.textContent).toContain("After approval");
    expect(h.textContent).toContain("approval is refused");
  });

  it("a new record has no 'now' column", async () => {
    const h = await render({ ...base, change: { rows: [{ field: "Email", before: null, after: "a@b.mu" }], described: true } });
    expect(h.querySelectorAll("thead th")).toHaveLength(2);
    expect(h.querySelector("thead")!.textContent).toContain("Will be");
  });

  it("decided requests read Before / After", async () => {
    const h = await render({ ...base, change: { rows: [{ field: "Role", before: "viewer", after: "checker" }] } }, true);
    expect(h.querySelector("thead")!.textContent).toContain("Before");
    expect(h.textContent).not.toContain("approval is refused");
  });

  it("warns when the change could not be described", async () => {
    const h = await render({ ...base, change: { rows: [{ field: "Member Id", before: null, after: "x" }], described: false } });
    expect(h.querySelector("[role=note]")!.textContent).toContain("Reject it if you can't tell");
  });

  it("hasChange only when there are rows", () => {
    expect(hasChange(base)).toBe(false);
    expect(hasChange({ ...base, change: { rows: [] } })).toBe(false);
    expect(hasChange({ ...base, change: { rows: [{ field: "a", before: null, after: "b" }] } })).toBe(true);
  });
});
