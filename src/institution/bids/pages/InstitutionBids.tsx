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
import { FileText, ChevronDown, ChevronUp, XCircle, CheckCircle, AlertTriangle, Clock, User, Mail, Phone, MapPin, CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { InstitutionBid } from "@/institution/types/institution";
import { useMyBids, useMyInstitution, useSubmitBid } from "@/institution/hooks/useInstitution";
import { portalApi } from "@/shared/lib/portalApi";
import { formatDistanceToNow, formatRate, formatAmount } from "@/institution/lib/utils";
import {
  SectionHeader, KpiCard, FilterPills, DataTable, DataRow, Td,
  StatusBadge, ConfirmModal, EmptyState, SkeletonRow, MonoRef, InlineAlert,
} from "@/institution/components/primitives";

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
// Phase 2 reveal types & hook
// ─────────────────────────────────────────────────────────────────────────────

interface BidReveal {
  full_name:       string
  email:           string
  phone?:          string | null
  address?:        string | null
  date_of_birth?:  string | null
  document_number?: string | null
  revealed_at:     string
}

function useBidReveal(bidId: string | null) {
  return useQuery<BidReveal>({
    queryKey: ["bid-reveal", bidId],
    queryFn:  () => portalApi.get<BidReveal>(`/marketplace/bids/${bidId}/reveal`),
    enabled:  !!bidId,
    staleTime: 5 * 60 * 1000, // PII — 5 min cache, don't over-fetch
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 borrower identity panel (shown on accepted bids only)
// ─────────────────────────────────────────────────────────────────────────────

function BorrowerRevealPanel({ bidId }: { bidId: string }) {
  const { data: reveal, isLoading } = useBidReveal(bidId)

  if (isLoading) {
    return (
      <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 animate-pulse">
        <div className="h-3 bg-emerald-200/60 rounded w-1/3 mb-2" />
        <div className="h-3 bg-emerald-200/40 rounded w-1/2" />
      </div>
    )
  }
  if (!reveal) return null

  return (
    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-100 grid place-items-center">
          <User className="w-3.5 h-3.5 text-emerald-700" />
        </div>
        <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">
          Client identity revealed
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="col-span-2">
          <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Full name</div>
          <div className="text-[14px] font-bold text-ink">{reveal.full_name}</div>
        </div>
        <div>
          <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide flex items-center gap-1">
            <Mail className="w-3 h-3" /> Email
          </div>
          <a href={`mailto:${reveal.email}`} className="text-[13px] text-ficium hover:underline">
            {reveal.email}
          </a>
        </div>
        {reveal.phone && (
          <div>
            <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone
            </div>
            <a href={`tel:${reveal.phone}`} className="text-[13px] text-ficium hover:underline">
              {reveal.phone}
            </a>
          </div>
        )}
        {reveal.address && (
          <div className="col-span-2">
            <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Address
            </div>
            <div className="text-[13px] text-ink">{reveal.address}</div>
          </div>
        )}
        {reveal.document_number && (
          <div>
            <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide flex items-center gap-1">
              <CreditCard className="w-3 h-3" /> Document
            </div>
            <div className="text-[13px] text-ink font-mono">{reveal.document_number}</div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-emerald-600/70 pt-1 border-t border-emerald-200">
        Revealed {new Date(reveal.revealed_at).toLocaleString("en-MU")} ·
        Confidential — for authorised personnel only
      </p>
    </div>
  )
}

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
              <div>
                <div className="flex items-center gap-2 text-[13px] text-emerald-600 font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  Accepted by client
                </div>
                <BorrowerRevealPanel bidId={bid.id} />
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
