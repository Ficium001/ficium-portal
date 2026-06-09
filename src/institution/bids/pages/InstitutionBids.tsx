/**
 * @page InstitutionBids
 * @route /bids
 * @access protected — admin, analyst, viewer
 * @description
 *   Full bid ledger for this institution. Analysts can expand any bid
 *   to view full conditions, see outcome context, and initiate a
 *   withdrawal (which enters maker-checker). Viewers are read-only.
 *
 *   Layout:
 *     1. Header with KPI summary row
 *     2. Status filter pills
 *     3. Bids data table (expandable rows)
 *     4. Withdraw confirmation modal
 *
 * @dataSource
 *   useMyBids       → my_bids view, filterable by status (30 s cache)
 *   useMyInstitution → institutions table (5 min cache)
 *   useSubmitBid    → submit_for_approval() RPC (mutation — withdrawal)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useCallback } from "react";
import { FileText, ChevronDown, ChevronUp, XCircle, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import type { InstitutionBid } from "../../types/institution";
import { useMyBids, useMyInstitution, useSubmitBid } from "../../hooks/useInstitution";
import { formatDistanceToNow, formatRate, formatAmount } from "../../lib/utils";
import {
  SectionHeader, KpiCard, FilterPills, DataTable, DataRow, Td,
  StatusBadge, ConfirmModal, EmptyState, SkeletonRow, MonoRef, InlineAlert,
} from "../../components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { key: "all",       label: "All bids"  },
  { key: "submitted", label: "Active"    },
  { key: "accepted",  label: "Accepted"  },
  { key: "rejected",  label: "Rejected"  },
  { key: "expired",   label: "Expired"   },
  { key: "withdrawn", label: "Withdrawn" },
];

type StatusKey = "all" | "submitted" | "accepted" | "rejected" | "expired" | "withdrawn";

// ─────────────────────────────────────────────────────────────────────────────
// Expanded bid row detail panel
// ─────────────────────────────────────────────────────────────────────────────

function BidDetailPanel({
  bid,
  canWithdraw,
  onWithdraw,
}: {
  bid: InstitutionBid;
  canWithdraw: boolean;
  onWithdraw: () => void;
}) {
  return (
    <tr className="bg-cream/50">
      <td colSpan={8} className="px-5 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Details column */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5">
              Bid details
            </div>
            <div className="space-y-2">
              {[
                ["Request ref",   bid.request_id ? `${bid.request_id.slice(0, 12)}…` : "—"],
                ["Rate type",     bid.rate_type ?? "—"],
                ["Submitted via", bid.submitted_via ?? "—"],
                ["Response time", bid.response_time_ms ? `${bid.response_time_ms.toLocaleString()} ms` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-[12px]">
                  <span className="text-muted">{label}</span>
                  <span className="font-medium text-ink">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Conditions column */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5">
              Conditions
            </div>
            {bid.conditions && Object.keys(bid.conditions).length > 0 ? (
              <pre className="text-[11px] text-muted bg-white border border-ink/[0.08] rounded-lg p-3 overflow-auto max-h-28 font-mono leading-relaxed">
                {JSON.stringify(bid.conditions, null, 2)}
              </pre>
            ) : (
              <span className="text-[12px] text-muted italic">None specified</span>
            )}
          </div>

          {/* Actions / outcome column */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5">
              Outcome
            </div>
            {bid.status === "submitted" && canWithdraw && (
              <button
                onClick={onWithdraw}
                className="flex items-center gap-2 border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-semibold px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Withdraw bid
              </button>
            )}
            {bid.status === "accepted" && (
              <div className="flex items-center gap-2 text-[13px] text-emerald-600 font-semibold">
                <CheckCircle className="w-4 h-4" />
                Accepted by client
              </div>
            )}
            {bid.status === "rejected" && (
              <div className="flex items-center gap-2 text-[13px] text-red-500">
                <AlertTriangle className="w-4 h-4" />
                Client chose another offer
              </div>
            )}
            {bid.status === "expired" && (
              <div className="flex items-center gap-2 text-[13px] text-amber-600">
                <Clock className="w-4 h-4" />
                Bid window expired
              </div>
            )}
            {bid.status === "withdrawn" && bid.withdraw_reason && (
              <p className="text-[12px] text-muted italic">
                Reason: {bid.withdraw_reason}
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionBids() {
  const { data: institution }                           = useMyInstitution();
  const [statusFilter, setStatusFilter]                 = useState<StatusKey>("all");
  const { data: bids = [], isLoading }                  = useMyBids(
    statusFilter === "all" ? undefined : statusFilter
  );
  const submitBid                                       = useSubmitBid();
  const [expanded,       setExpanded]                   = useState<string | null>(null);
  const [withdrawBidId,  setWithdrawBidId]              = useState<string | null>(null);
  const [withdrawNote,   setWithdrawNote]               = useState("");
  const [withdrawSuccess, setWithdrawSuccess]           = useState(false);

  const modules     = institution?.modules ?? [];
  const canWithdraw = modules.includes("marketplace");

  // KPIs
  const total      = bids.length;
  const accepted   = bids.filter((b) => b.status === "accepted").length;
  const active     = bids.filter((b) => b.status === "submitted").length;
  const winRate    = total > 0 ? Math.round((accepted / total) * 100) : 0;

  const handleWithdrawConfirm = useCallback(async () => {
    const bid = bids.find((b) => b.id === withdrawBidId);
    if (!bid || !withdrawNote.trim()) return;
    await submitBid.mutateAsync({
      request_id:     bid.request_id ?? "",
      rate:           0,
      rate_type:      "fixed",
      amount_offered: 0,
      term_months:    0,
      conditions:     { withdraw_reason: withdrawNote },
      submitted_via:  "portal",
    });
    setWithdrawBidId(null);
    setWithdrawNote("");
    setWithdrawSuccess(true);
  }, [bids, withdrawBidId, withdrawNote, submitBid]);

  return (
    <main className="p-6 lg:p-8 max-w-[1440px] mx-auto">
      <SectionHeader
        title="Bids"
        subtitle={`${total} bid${total !== 1 ? "s" : ""} · win rate ${winRate}%`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total bids"   value={total}    icon={FileText} />
        <KpiCard label="Active bids"  value={active}                   />
        <KpiCard label="Accepted"     value={accepted}                 />
        <KpiCard label="Win rate"     value={`${winRate}%`}            />
      </div>

      {withdrawSuccess && (
        <div className="mb-5">
          <InlineAlert
            variant="success"
            onDismiss={() => setWithdrawSuccess(false)}
          >
            Withdrawal submitted for maker-checker approval.
          </InlineAlert>
        </div>
      )}

      {/* Filter */}
      <div className="mb-5">
        <FilterPills
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusKey)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <DataTable
          headers={["Product", "Amount", "Rate", "Term", "Via", "Status", "Submitted", ""]}
          caption="Bids loading…"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} cols={8} />
          ))}
        </DataTable>
      ) : bids.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No bids found"
          description={
            statusFilter !== "all"
              ? "Try clearing the filter to see all bids"
              : "Submitted bids appear here"
          }
          action={
            statusFilter !== "all" ? (
              <button
                onClick={() => setStatusFilter("all")}
                className="text-[13px] text-ficium font-semibold hover:underline mt-1"
              >
                Clear filter
              </button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          headers={["Product", "Amount offered", "Rate", "Term", "Channel", "Status", "Submitted", ""]}
          caption="Institution bid ledger"
        >
          {bids.map((bid) => {
            const isOpen = expanded === bid.id;
            return (
              <>
                <DataRow
                  key={bid.id}
                  selected={isOpen}
                  onClick={() => setExpanded(isOpen ? null : bid.id)}
                >
                  <Td>
                    <div className="font-semibold text-[13px]">
                      {bid.product_label ?? bid.product_type ?? "—"}
                    </div>
                    <MonoRef value={bid.id} />
                  </Td>
                  <Td className="font-semibold">
                    {formatAmount(bid.amount_offered, bid.currency ?? "MUR")}
                  </Td>
                  <Td className="font-bold text-ficium">
                    {formatRate(bid.rate)}
                  </Td>
                  <Td className="text-muted">{bid.term_months}m</Td>
                  <Td>
                    <code className="text-[11px] bg-ink/[0.04] px-2 py-0.5 rounded-lg font-mono text-muted">
                      {bid.submitted_via ?? "—"}
                    </code>
                  </Td>
                  <Td>
                    <StatusBadge status={bid.status} />
                  </Td>
                  <Td className="text-muted whitespace-nowrap text-[12px]">
                    {formatDistanceToNow(bid.submitted_at)} ago
                  </Td>
                  <td className="px-5 py-3.5">
                    <button
                      aria-label={isOpen ? "Collapse bid details" : "Expand bid details"}
                      aria-expanded={isOpen}
                      className="text-muted hover:text-ink transition-colors"
                    >
                      {isOpen
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />
                      }
                    </button>
                  </td>
                </DataRow>

                {isOpen && (
                  <BidDetailPanel
                    key={`${bid.id}-detail`}
                    bid={bid}
                    canWithdraw={canWithdraw}
                    onWithdraw={() => setWithdrawBidId(bid.id)}
                  />
                )}
              </>
            );
          })}
        </DataTable>
      )}

      {/* Withdraw modal */}
      <ConfirmModal
        open={!!withdrawBidId}
        onClose={() => { setWithdrawBidId(null); setWithdrawNote(""); }}
        onConfirm={handleWithdrawConfirm}
        title="Withdraw bid"
        description="This withdrawal enters maker-checker. A second admin must approve before the bid is removed from the marketplace."
        confirmLabel="Submit withdrawal"
        variant="warning"
        notePlaceholder="Reason for withdrawal (required)"
        noteRequired
        note={withdrawNote}
        onNoteChange={setWithdrawNote}
        isPending={submitBid.isPending}
      />
    </main>
  );
}
