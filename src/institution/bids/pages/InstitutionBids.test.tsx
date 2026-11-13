import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";

const withdraw = vi.fn();
const submitBid = vi.fn();
const bids = [
  { id: "b-live", request_id: "r1", status: "submitted", rate: 0.05, amount_offered: 100000, term_months: 12 },
  { id: "b-won", request_id: "r2", status: "accepted", rate: 0.05, amount_offered: 100000, term_months: 12 },
];

vi.mock("@/institution/hooks/useInstitution", () => ({
  useMyBids: () => ({ data: bids, isLoading: false }),
  useMyInstitution: () => ({ data: { modules: ["marketplace"] } }),
  useWithdrawBid: () => ({ mutateAsync: withdraw, isPending: false }),
  useSubmitBid: () => ({ mutateAsync: submitBid, isPending: false }),
}));
vi.mock("@/shared/lib/portalApi", () => ({ portalApi: { get: vi.fn().mockResolvedValue(null) } }));

import InstitutionBids from "./InstitutionBids";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const btn = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim().includes(text)) as HTMLButtonElement | undefined;

async function render() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const qc = new QueryClient();
  await act(async () => {
    createRoot(host).render(<QueryClientProvider client={qc}><InstitutionBids /></QueryClientProvider>);
  });
  return host;
}

async function expand(host: HTMLElement, bidIndex: number) {
  const rows = [...host.querySelectorAll("tbody tr")];
  await act(async () => { (rows[bidIndex] as HTMLElement).click(); });
  await settle();
}

describe("InstitutionBids withdraw", () => {
  beforeEach(() => { withdraw.mockReset(); submitBid.mockReset(); document.body.innerHTML = ""; });

  it("withdraws through the withdraw endpoint with the reason, never by submitting a bid", async () => {
    withdraw.mockResolvedValue({ action_id: "a1", status: "pending_approval" });
    const host = await render();
    await expand(host, 0);
    await act(async () => { btn(document.body, "Withdraw bid")!.click(); });

    const note = document.body.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(note, "Pricing changed");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { btn(document.body, "Submit withdrawal")!.click(); });
    await settle();

    expect(withdraw).toHaveBeenCalledWith({ bidId: "b-live", reason: "Pricing changed" });
    expect(submitBid).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("stays live until a second person approves");
  });

  it("offers no withdraw on an accepted bid", async () => {
    const host = await render();
    await expand(host, 1);
    expect(btn(document.body, "Withdraw bid")).toBeUndefined();
  });
});
