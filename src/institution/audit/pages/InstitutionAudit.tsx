/**
 * @page InstitutionAudit
 * @route /audit
 * @access protected — all roles (read-only)
 * @description
 *   Immutable audit log for all institution-level events. Append-only,
 *   WORM-compliant, FSC Mauritius reportable. No updates or deletes
 *   are permitted at the database level (RLS enforces this).
 *
 *   Provides:
 *     - Full event history with outcome, actor role, resource type
 *     - Outcome filter (all / success / rejected / failed)
 *     - Category filter (all / bid / webhook / user / api_key / institution)
 *     - Free-text search across event label, resource type, actor role
 *     - CSV export (full filtered result set)
 *     - Pagination via "Load more" (50 records per page)
 *
 * @dataSource
 *   useAuditEvents → audit_events table, ordered by created_at DESC
 *   Default limit: 50 per fetch. Expandable in 50-record increments.
 *
 * @compliance
 *   FSC Mauritius financial services regulations require a minimum
 *   7-year retention period on all transaction audit records.
 *   Ficium platform enforces this at the database level.
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useMemo, useCallback } from "react";
import { ScrollText, Download, Search, X, Filter, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuditEvents } from "@/institution/hooks/useInstitution";
import { portalApi } from "@/shared/lib/portalApi";
import type { AuditEvent, InstitutionUser, MemberAuditReport, LoginEvent, PortalActionEvent, GovernanceEvent } from "@/institution/types/institution";
import {
  SectionHeader, DataTable, DataRow, Td, StatusBadge,
  KpiCard, FilterPills, EmptyState,
  SkeletonRow, Btn, inputCls,
} from "@/institution/components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_OPTIONS = [
  { key: "all",      label: "All outcomes" },
  { key: "success",  label: "Success"      },
  { key: "rejected", label: "Rejected"     },
  { key: "failed",   label: "Failed"       },
  { key: "expired",  label: "Expired"      },
  { key: "logged",   label: "Logged"       },
];

const CATEGORY_OPTIONS = [
  { key: "all",         label: "All categories" },
  { key: "bid",         label: "Bids"           },
  { key: "webhook",     label: "Webhooks"        },
  { key: "user",        label: "Users"           },
  { key: "api_key",     label: "API keys"        },
  { key: "institution", label: "Institution"     },
];

type OutcomeKey = "all" | "success" | "rejected" | "failed" | "expired" | "logged";
type CategoryKey = "all" | "bid" | "webhook" | "user" | "api_key" | "institution";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "—", time: "—" };
  return {
    date: d.toLocaleDateString("en-MU", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-MU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function exportCSV(events: AuditEvent[], filename: string) {
  const headers = ["Timestamp (UTC)", "Event", "Category", "Resource", "Resource ID", "Actor role", "Outcome", "Note"];
  const rows = events.map((e) => [
    new Date(e.created_at).toISOString(),
    e.event_label,
    e.action_category ?? "",
    e.resource_type ?? "",
    e.resource_id   ?? "",
    e.actor_role    ?? "system",
    e.outcome,
    e.outcome_note  ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => JSON.stringify(v)).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditEventDrawer — slide-over detail panel
// ─────────────────────────────────────────────────────────────────────────────

function JsonDiff({
  label,
  before,
  after,
}: {
  label: string;
  before: Record<string, unknown> | null | undefined;
  after:  Record<string, unknown> | null | undefined;
}) {
  if (!before && !after) return null;

  // Collect all keys from both sides
  const allKeys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  ).sort();

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">{label}</p>
      <div className="rounded-xl border border-line overflow-hidden text-[12px] font-mono">
        {/* Header row */}
        <div className="grid grid-cols-3 bg-ink/3 border-b border-line">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Field</div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wider border-l border-line">Before</div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-emerald-700 uppercase tracking-wider border-l border-line">After</div>
        </div>
        {allKeys.map((key) => {
          const bVal = before?.[key];
          const aVal = after?.[key];
          const changed = JSON.stringify(bVal) !== JSON.stringify(aVal);
          return (
            <div
              key={key}
              className={`grid grid-cols-3 border-b border-line last:border-0 ${changed ? "bg-amber-50/40" : ""}`}
            >
              <div className="px-3 py-1.5 text-muted truncate">{key}</div>
              <div className={`px-3 py-1.5 border-l border-line truncate ${changed ? "text-amber-700 line-through opacity-70" : "text-ink"}`}>
                {bVal !== undefined ? String(bVal) : <span className="text-muted/50 italic">—</span>}
              </div>
              <div className={`px-3 py-1.5 border-l border-line truncate ${changed ? "text-emerald-700 font-semibold" : "text-ink"}`}>
                {aVal !== undefined ? String(aVal) : <span className="text-muted/50 italic">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuditEventDrawer({
  event,
  onClose,
}: {
  event: AuditEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;

  const { date, time } = fmtDate(event.created_at);
  const hasChanges = event.state_before || event.state_after;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/20 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-line">
          <div>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">Audit event</p>
            <code className="text-[13px] font-mono text-ink bg-ink/4 px-2 py-0.5 rounded-lg">
              {event.event_label || "—"}
            </code>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-ink/5 transition-colors mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Core metadata grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Date",      value: date },
              { label: "Time",      value: time },
              { label: "Outcome",   value: (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-block ${
                  event.outcome === "success"  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : event.outcome === "failed" || event.outcome === "rejected"
                                               ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>{event.outcome}</span>
              )},
              { label: "Category",  value: event.action_category?.replace(/_/g, " ").replace(/\./g, " › ") ?? "—" },
              { label: "Actor role", value: event.actor_role ?? "system" },
              { label: "Actor IP",  value: event.actor_ip ? <code className="font-mono text-[12px]">{event.actor_ip}</code> : "—" },
              { label: "Resource",  value: event.resource_type ?? "—" },
              { label: "Resource label", value: event.resource_label ?? "—" },
              { label: "Resource ID", value: event.resource_id
                ? <code className="font-mono text-[11px] text-muted break-all">{event.resource_id}</code>
                : "—"
              },
              { label: "Event ID",  value: <code className="font-mono text-[11px] text-muted break-all">{event.id}</code> },
            ].map(({ label, value }) => (
              <div key={label} className="bg-ink/2 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">{label}</p>
                <div className="text-[13px] text-ink">{value}</div>
              </div>
            ))}
          </div>

          {/* Outcome note */}
          {event.outcome_note && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Note</p>
              <p className="text-[13px] text-amber-800">{event.outcome_note}</p>
            </div>
          )}

          {/* Change diff */}
          {hasChanges ? (
            <JsonDiff
              label="Changes made"
              before={event.state_before}
              after={event.state_after}
            />
          ) : (
            <div className="bg-ink/2 border border-line rounded-xl px-4 py-6 text-center">
              <p className="text-[12px] text-muted">No field-level change data recorded for this event.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line bg-ink/1.5">
          <p className="text-[11px] text-muted font-mono">
            WORM-protected · append-only · FSC 7-year retention
          </p>
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

// ─── User report tab ──────────────────────────────────────────

function UserAuditReport() {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [tab, setTab] = useState<"logins" | "actions" | "governance">("logins");

  const { data: members = [] } = useQuery<Pick<InstitutionUser, "id" | "full_name" | "email">[]>({
    queryKey: ["institution", "members"],
    queryFn: () => portalApi.get("/members"),
    staleTime: 30_000,
  });

  const { data: report, isLoading: reportLoading } = useQuery<MemberAuditReport>({
    queryKey: ["institution", "member-audit", selectedMember],
    queryFn: () => portalApi.get(`/members/${selectedMember}/audit?limit=100`),
    enabled: !!selectedMember,
    staleTime: 30_000,
  });

  const OUTCOME_ICON: Record<string, string> = { success: "✓", failed: "✗", rejected: "⊘", logged: "○" };

  return (
    <div className="space-y-6">
      {/* Member selector */}
      <div className="bg-white border border-line rounded-xl p-5">
        <label className="text-[12px] font-semibold text-muted uppercase tracking-wider block mb-2">Select team member</label>
        <select
          value={selectedMember ?? ""}
          onChange={e => { setSelectedMember(e.target.value || null); setTab("logins"); }}
          className={`${inputCls} max-w-sm`}
        >
          <option value="">Choose a member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name || m.email} — {m.email}</option>
          ))}
        </select>
      </div>

      {!selectedMember && (
        <div className="bg-white border border-line rounded-xl p-12 text-center">
          <ScrollText className="w-8 h-8 text-muted/50 mx-auto mb-2" />
          <p className="text-[13px] text-muted">Select a team member to view their activity report</p>
        </div>
      )}

      {selectedMember && reportLoading && (
        <div className="bg-white border border-line rounded-xl p-8 text-center">
          <p className="text-[13px] text-muted animate-pulse">Loading report…</p>
        </div>
      )}

      {selectedMember && report && (
        <>
          {/* Member summary */}
          <div className="bg-white border border-line rounded-xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-ficium/10 flex items-center justify-center text-[14px] font-bold text-ficium">
              {(report.member.full_name ?? report.member.email ?? "?").split(" ").map((n) => n[0]).join("").slice(0,2).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-[15px] text-ink">{report.member.full_name || report.member.email}</div>
              <div className="text-[12px] text-muted">{report.member.email}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted uppercase tracking-wider">Logins</div>
              <div className="text-[22px] font-display font-bold text-ink">{report.logins.length}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted uppercase tracking-wider">Actions</div>
              <div className="text-[22px] font-display font-bold text-ink">{report.actions.length}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted uppercase tracking-wider">Approvals</div>
              <div className="text-[22px] font-display font-bold text-ink">{report.governance.length}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-line">
            {(["logins", "actions", "governance"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-[12px] font-semibold capitalize border-b-2 -mb-px transition-colors ${
                  tab === t ? "border-ficium text-ficium" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t === "logins" ? "Login history" : t === "actions" ? "Portal actions" : "Approvals"}{" "}
                <span className="ml-1 text-[10px] bg-ink/8 text-muted px-1.5 py-0.5 rounded-full">
                  {t === "logins" ? report.logins.length : t === "actions" ? report.actions.length : report.governance.length}
                </span>
              </button>
            ))}
          </div>

          {/* Login history */}
          {tab === "logins" && (
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {report.logins.length === 0 ? (
                <p className="text-[13px] text-muted text-center py-10">No login events recorded.</p>
              ) : (
                <DataTable headers={["Date & time", "Outcome", "IP address", "Location", "Device"]} caption="Login history">
                  {report.logins.map((l: LoginEvent) => {
                    const { date, time } = fmtDate(l.occurred_at);
                    return (
                      <DataRow key={l.id}>
                        <Td>
                          <span className="text-[12px] font-mono text-ink">{date}</span>
                          <span className="text-[11px] text-muted ml-2">{time}</span>
                        </Td>
                        <Td>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            l.outcome === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-600 border border-red-200"
                          }`}>
                            {OUTCOME_ICON[l.outcome] ?? "○"} {l.outcome}
                          </span>
                          {l.failure_reason && <span className="text-[10px] text-muted ml-2">{l.failure_reason}</span>}
                        </Td>
                        <Td><code className="text-[11px] text-muted font-mono">{l.ip ?? "—"}</code></Td>
                        <Td className="text-[12px] text-muted">{[l.city, l.country].filter(Boolean).join(", ") || "—"}</Td>
                        <Td className="text-[11px] text-muted max-w-[200px] truncate">{l.user_agent?.split(" ")[0] ?? "—"}</Td>
                      </DataRow>
                    );
                  })}
                </DataTable>
              )}
            </div>
          )}

          {/* Portal actions */}
          {tab === "actions" && (
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {report.actions.length === 0 ? (
                <p className="text-[13px] text-muted text-center py-10">No portal actions recorded.</p>
              ) : (
                <DataTable headers={["Date & time", "Action", "Resource", "Outcome", "IP"]} caption="Portal actions">
                  {report.actions.map((a: PortalActionEvent) => {
                    const { date, time } = fmtDate(a.occurred_at);
                    return (
                      <DataRow key={a.id}>
                        <Td>
                          <span className="text-[12px] font-mono text-ink">{date}</span>
                          <span className="text-[11px] text-muted ml-2">{time}</span>
                        </Td>
                        <Td className="text-[12px] font-medium text-ink">{a.action?.replace(/_/g, " ") ?? "—"}</Td>
                        <Td>
                          <span className="text-[11px] text-muted">{a.resource_type ?? "—"}</span>
                          {a.resource_label && <span className="text-[11px] text-ink ml-1 font-medium">{a.resource_label}</span>}
                        </Td>
                        <Td>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            a.outcome === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-600 border border-red-200"
                          }`}>
                            {a.outcome}
                          </span>
                        </Td>
                        <Td><code className="text-[11px] text-muted font-mono">{a.actor_ip ?? "—"}</code></Td>
                      </DataRow>
                    );
                  })}
                </DataTable>
              )}
            </div>
          )}

          {/* Governance */}
          {tab === "governance" && (
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {report.governance.length === 0 ? (
                <p className="text-[13px] text-muted text-center py-10">No approval actions recorded.</p>
              ) : (
                <DataTable headers={["Date", "Action", "Resource", "Status", "Their role"]} caption="Approval actions">
                  {report.governance.map((g: GovernanceEvent) => {
                    const { date } = fmtDate(g.created_at);
                    const isMaker = g.maker_role != null;
                    return (
                      <DataRow key={g.id}>
                        <Td><span className="text-[12px] font-mono text-ink">{date}</span></Td>
                        <Td className="text-[12px] font-medium text-ink">{g.category?.replace(/_/g, " ") ?? "—"}</Td>
                        <Td className="text-[11px] text-muted">{g.resource_type ?? "—"}{g.resource_label ? ` · ${g.resource_label}` : ""}</Td>
                        <Td>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            g.status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : g.status === "rejected" ? "bg-red-50 text-red-600 border border-red-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {g.status}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-[11px] text-muted">{isMaker ? "Maker" : "Checker"}</span>
                        </Td>
                      </DataRow>
                    );
                  })}
                </DataTable>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function InstitutionAudit() {
  const [activeTab, setActiveTab] = useState<"log" | "users">("log");
  const [limit,    setLimit]    = useState(50);
  const [outcome,  setOutcome]  = useState<OutcomeKey>("all");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [search,   setSearch]   = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const { data: events = [], isLoading } = useAuditEvents(limit);

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return events.filter((e) => {
      const matchOutcome   = outcome  === "all" || e.outcome === outcome;
      const matchCategory  = category === "all" || (e.action_category ?? "").startsWith(category);
      const matchSearch    = !search  ||
        e.event_label.toLowerCase().includes(lc) ||
        (e.resource_type ?? "").toLowerCase().includes(lc) ||
        (e.actor_role    ?? "").toLowerCase().includes(lc) ||
        (e.action_category ?? "").toLowerCase().includes(lc);
      return matchOutcome && matchCategory && matchSearch;
    });
  }, [events, outcome, category, search]);

  const handleExport = useCallback(() => {
    const filename = `ficium-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    exportCSV(filtered, filename);
  }, [filtered]);

  // KPIs
  const totalEvents = events.length;
  const successCount = events.filter((e) => e.outcome === "success").length;
  const failCount    = events.filter((e) => ["rejected", "failed"].includes(e.outcome)).length;

  return (
    <main className="p-6 lg:p-8 max-w-[1440px] mx-auto">
      {/* Event detail drawer */}
      <AuditEventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      <SectionHeader
        title="Audit"
        subtitle="Immutable activity log · append-only · WORM compliant"
        actions={
          activeTab === "log" ? (
            <Btn variant="secondary" size="sm" icon={Download} onClick={handleExport}>
              Export CSV
            </Btn>
          ) : undefined
        }
      />

      {/* Page tabs */}
      <div className="flex gap-1 border-b border-line mb-6">
        {([["log", "Audit log", ScrollText], ["users", "User reports", Users]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as "log" | "users")}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === key ? "border-ficium text-ficium" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "users" && <UserAuditReport />}

      {activeTab === "log" && (
        <>
          {/* Compliance banner */}
          <div className="bg-ink/2.5 border border-ink/[0.07] rounded-xl px-5 py-3 flex items-center gap-3 mb-6">
            <ScrollText className="w-4 h-4 text-muted shrink-0" aria-hidden />
            <p className="text-[11px] text-muted font-mono tracking-wide uppercase">
              Append-only · WORM compliant · FSC Mauritius reportable · 7-year retention ·
              No updates or deletes permitted
            </p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total events"    value={totalEvents}   />
            <KpiCard label="Successful"      value={successCount}  />
            <KpiCard label="Rejected/failed" value={failCount} alert={failCount > 0} />
            <KpiCard label="Showing"         value={filtered.length} />
          </div>

          {/* Filters row */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted shrink-0" aria-hidden />
              <FilterPills
                options={OUTCOME_OPTIONS}
                value={outcome}
                onChange={(v) => setOutcome(v as OutcomeKey)}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap lg:ml-4">
              <FilterPills
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(v) => setCategory(v as CategoryKey)}
              />
            </div>
            {/* Search */}
            <div className="relative lg:ml-auto">
              <Search className="w-3.5 h-3.5 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search event, resource, role…"
                aria-label="Search audit events"
                className="bg-white border border-ink/12 rounded-xl pl-9 pr-9 py-2 text-[13px] outline-hidden focus:border-ficium focus:ring-2 focus:ring-ficium/20 w-full lg:w-60 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <DataTable
              headers={["Timestamp", "Event", "Category", "Resource", "Actor role", "Outcome", "Note"]}
              caption="Audit events loading…"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} cols={7} />
              ))}
            </DataTable>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No events match"
              description={search || outcome !== "all" || category !== "all"
                ? "Try adjusting your filters or clearing the search"
                : "Audit events will appear here as actions occur"
              }
            />
          ) : (
            <>
              <DataTable
                headers={["Timestamp", "Event", "Category", "Resource", "Actor role", "Outcome", "Note"]}
                caption="Institution audit log"
              >
                {filtered.map((e) => {
                  const { date, time } = fmtDate(e.created_at);
                  return (
                    <DataRow
                      key={e.id}
                      onClick={() => setSelectedEvent(e)}
                      className="cursor-pointer hover:bg-ficium/2 transition-colors"
                    >
                      <Td>
                        <div className="font-semibold text-[13px] whitespace-nowrap">{date}</div>
                        <div className="text-[11px] text-muted font-mono">{time}</div>
                      </Td>
                      <Td>
                        <code className="text-[11px] text-ink bg-ink/4 px-2 py-0.5 rounded-lg font-mono">
                          {e.event_label}
                        </code>
                      </Td>
                      <Td className="text-muted text-[12px]">{e.action_category ?? "—"}</Td>
                      <Td className="text-ficium font-medium">{e.resource_type ?? "—"}</Td>
                      <Td className="text-muted text-[12px]">{e.actor_role ?? "system"}</Td>
                      <Td><StatusBadge status={e.outcome} size="xs" /></Td>
                      <Td className="text-muted max-w-[200px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="block truncate text-[12px]" title={e.outcome_note ?? ""}>
                            {e.outcome_note ?? "—"}
                          </span>
                          <span className="text-muted/40 text-[10px] shrink-0">›</span>
                        </div>
                      </Td>
                    </DataRow>
                  );
                })}
              </DataTable>

              {events.length >= limit && (
                <div className="flex justify-center mt-5">
                  <Btn variant="secondary" size="sm" onClick={() => setLimit((l) => l + 50)}>
                    Load more (showing {limit})
                  </Btn>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
