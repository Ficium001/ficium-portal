/**
 * @component GroupsTab
 * @parent InstitutionSettings (Settings → Groups)
 * @access institution admins (write) · all members (read)
 * @description
 *   Institution-scoped group management. Admins create custom groups,
 *   assign module permissions, and edit/delete groups. Every mutation
 *   routes through submit_for_approval() (maker-checker) and lands in
 *   /approvals; the executor in 20250819_pending_actions_maker_checker.sql
 *   applies it on approval.
 *
 *   Module picker: the institution's own modules (get_my_modules RPC),
 *   falling back to the full institution catalogue when the caller has
 *   wildcard ('*') or unrestricted access.
 *
 * @dataSource
 *   institution.groups            → list (30 s cache)
 *   institution.pending_actions_v → pending group.* actions badge (compat view
 *                                   over governance.action; institution.pending_actions
 *                                   itself is no longer written to as of migration 06)
 *   get_my_modules()              → selectable module keys
 *
 * @owner Ficium Engineering
 */

import { useMemo, useState } from "react";
import { Plus, Shield, Pencil, Trash2, Clock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import institutionSupabase from "../../lib/institutionSupabase";
import { INSTITUTION_MODULE_LIST } from "../../../shared/lib/modules";
import type { PendingAction } from "../../types/institution";
import {
  InlineAlert, DataTable, DataRow, Td,
  Modal, FormField, inputCls, Btn, SkeletonRow, EmptyState,
} from "../../components/primitives";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstitutionGroup {
  id:                 string;
  institution_id:     string;
  slug:               string;
  label:              string;
  description:        string;
  module_permissions: string[];
  is_system:          boolean;
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

// ─── Data hooks ──────────────────────────────────────────────────────────────

function useInstitutionGroups() {
  return useQuery<InstitutionGroup[]>({
    queryKey: ["institution", "groups"],
    queryFn: async () => {
      const { data, error } = await institutionSupabase
        .from("groups")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((g: Record<string, unknown>) => ({
        ...g,
        module_permissions: (g.module_permissions as string[] | undefined) ?? [],
      })) as InstitutionGroup[];
    },
    staleTime: 30 * 1000,
  });
}

function usePendingGroupActions() {
  return useQuery<PendingAction[]>({
    queryKey: ["institution", "groups", "pending"],
    queryFn: async () => {
      // institution.pending_actions is no longer written to — submit_for_approval
      // now delegates to governance.submit() (see migration 06). Read through the
      // compat view instead, aliasing back to the column names this component
      // (and the PendingAction type) already expect.
      const { data, error } = await institutionSupabase
        .from("pending_actions_v")
        .select(
          "id, action_category:category, action_status:status, maker_id, maker_role, " +
          "institution_id, initiated_at:created_at, resource_type, resource_id, payload, " +
          "payload_before, checker_id, checker_role, checker_note, checked_at, " +
          "expires_at, executed_at, execution_error, created_at",
        )
        .eq("status", "pending")
        .like("category", "group.%");
      // pending_actions_v may not exist yet on older environments — fail silently
      if (error) return [];
      return (data ?? []) as unknown as PendingAction[];
    },
    refetchInterval: 60 * 1000,
  });
}

/** Module keys this member may grant. Wildcard/empty → full catalogue. */
const ALL_INSTITUTION_KEYS = INSTITUTION_MODULE_LIST.map((m) => m.key);

function useGrantableModules() {
  return useQuery<string[]>({
    queryKey: ["institution", "my-modules"],
    queryFn: async () => {
      const { data, error } = await institutionSupabase.rpc("get_my_modules");
      // RPC may not exist yet (migration pending) — fall back to full catalogue
      if (error) return ALL_INSTITUTION_KEYS;
      const mine = (data ?? []) as string[];
      if (mine.length === 0 || mine.includes("*")) return ALL_INSTITUTION_KEYS;
      return ALL_INSTITUTION_KEYS.filter((k) => mine.includes(k));
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

// ─── Module checkbox grid ────────────────────────────────────────────────────

function ModulePicker({
  selectable, selected, onToggle,
}: {
  selectable: string[];
  selected:   string[];
  onToggle:   (key: string) => void;
}) {
  const modules = INSTITUTION_MODULE_LIST.filter((m) => selectable.includes(m.key));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {modules.map((m) => {
        const on = selected.includes(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onToggle(m.key)}
            aria-pressed={on}
            className={[
              "flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all",
              on
                ? "border-ficium/40 bg-ficium/[0.04]"
                : "border-ink/[0.08] hover:border-ink/[0.15]",
            ].join(" ")}
          >
            <div
              className={[
                "w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center",
                on ? "bg-ficium border-ficium" : "border-ink/[0.25]",
              ].join(" ")}
            >
              {on && <span className="text-white text-[10px] leading-none">✓</span>}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink">{m.label}</div>
              <div className="text-[10px] text-muted leading-snug mt-0.5">{m.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── GroupsTab ───────────────────────────────────────────────────────────────

export default function GroupsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: groups = [],  isLoading } = useInstitutionGroups();
  const { data: pending = [] }            = usePendingGroupActions();
  const { data: grantable = [] }          = useGrantableModules();

  const [showCreate,  setShowCreate]  = useState(false);
  const [editGroup,   setEditGroup]   = useState<InstitutionGroup | null>(null);
  const [label,       setLabel]       = useState("");
  const [description, setDescription] = useState("");
  const [modules,     setModules]     = useState<string[]>([]);
  const [submitting,  setSubmitting]  = useState(false);
  const [flash,       setFlash]       = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const slug = useMemo(() => slugify(label), [label]);

  const pendingByGroupId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of pending) {
      const gid = (a.payload as Record<string, unknown>)?.group_id as string | undefined;
      if (gid) map.set(gid, a.action_category);
    }
    return map;
  }, [pending]);

  const pendingCreates = pending.filter((a) => a.action_category === "group.create");

  const toggleModule = (key: string) =>
    setModules((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const resetForm = () => { setLabel(""); setDescription(""); setModules([]); setError(null); };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["institution", "groups"] });
    qc.invalidateQueries({ queryKey: ["institution", "groups", "pending"] });
  };

  const submit = async (category: string, payload: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await institutionSupabase.rpc("submit_for_approval", {
      p_action_category: category,
      p_resource_type:   "institution_groups",
      p_resource_id:     (payload.group_id as string) ?? null,
      p_payload:         payload,
    });
    setSubmitting(false);
    if (rpcError) { setError(rpcError.message); return false; }
    invalidate();
    return true;
  };

  const handleCreate = async () => {
    if (!slug || !label.trim()) return;
    const ok = await submit("group.create", {
      slug, label: label.trim(), description: description.trim(),
      module_permissions: modules,
    });
    if (ok) {
      setShowCreate(false);
      resetForm();
      setFlash("Group submitted for approval. It will appear once a checker approves it in Approvals.");
    }
  };

  const handleUpdateModules = async () => {
    if (!editGroup) return;
    const ok = await submit("group.update_modules", {
      group_id: editGroup.id, module_permissions: modules,
    });
    if (ok) {
      setEditGroup(null);
      resetForm();
      setFlash("Module change submitted for approval.");
    }
  };

  const handleDelete = async (g: InstitutionGroup) => {
    const ok = await submit("group.delete", { group_id: g.id, slug: g.slug });
    if (ok) setFlash(`Deletion of "${g.label}" submitted for approval.`);
  };

  const openEdit = (g: InstitutionGroup) => {
    setEditGroup(g);
    setModules(g.module_permissions);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {flash && (
        <InlineAlert variant="success" onDismiss={() => setFlash(null)}>
          {flash}
        </InlineAlert>
      )}

      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/[0.07] flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-[15px] text-ink">Access groups</h2>
            <p className="text-[11px] text-muted mt-0.5">
              {groups.length} group{groups.length !== 1 ? "s" : ""} · changes require maker-checker approval
            </p>
          </div>
          {isAdmin && (
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => { resetForm(); setShowCreate(true); }}>
              Create group
            </Btn>
          )}
        </div>

        {isLoading ? (
          <DataTable headers={["Group", "Modules", "Created", ""]} caption="Loading groups…">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}
          </DataTable>
        ) : groups.length === 0 && pendingCreates.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No groups yet"
            description={isAdmin
              ? "Create your first group to control which modules your team can access"
              : "Your institution admin hasn't created any groups yet"}
          />
        ) : (
          <DataTable headers={["Group", "Modules", "Created", ""]} caption="Institution access groups">
            {groups.map((g) => {
              const pendingCat = pendingByGroupId.get(g.id);
              return (
                <DataRow key={g.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ficium/10 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-3.5 h-3.5 text-ficium" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-ink flex items-center gap-2">
                          {g.label}
                          {pendingCat && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-2.5 h-2.5" aria-hidden />
                              change pending
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-muted">{g.slug}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {(g.module_permissions ?? []).length === 0 ? (
                        <span className="text-[11px] text-muted">No modules</span>
                      ) : (
                        (g.module_permissions ?? []).map((k) => (
                          <span key={k} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink/[0.05] text-muted border border-ink/[0.08]">
                            {k.replace("inst:", "")}
                          </span>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td className="text-muted text-[12px]">
                    {new Date(g.created_at).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" })}
                  </Td>
                  <Td>
                    {isAdmin && !g.is_system && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(g)}
                          aria-label={`Edit modules for ${g.label}`}
                          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-ink/[0.05] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden />
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
                          disabled={submitting || !!pendingCat}
                          aria-label={`Delete ${g.label}`}
                          className="p-1.5 rounded-md text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </div>
                    )}
                  </Td>
                </DataRow>
              );
            })}
          </DataTable>
        )}

        {pendingCreates.length > 0 && (
          <div className="px-5 py-3 border-t border-ink/[0.07] bg-amber-50/40">
            <div className="text-[11px] text-amber-800 flex items-center gap-2">
              <Clock className="w-3 h-3" aria-hidden />
              {pendingCreates.length} new group{pendingCreates.length !== 1 ? "s" : ""} awaiting approval in Approvals
            </div>
          </div>
        )}
      </div>

      {/* Create group modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create access group">
        <div className="space-y-4">
          {error && <InlineAlert variant="error">{error}</InlineAlert>}
          <FormField label="Group name">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Credit Team"
              className={inputCls}
            />
            {slug && <div className="text-[10px] font-mono text-muted mt-1">slug: {slug}</div>}
          </FormField>
          <FormField label="Description" hint="What this group is for — shown to other admins">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handles credit product listings and bids"
              className={inputCls}
            />
          </FormField>
          <FormField label="Module access" hint="Members of this group can use the selected modules">
            <ModulePicker selectable={grantable} selected={modules} onToggle={toggleModule} />
          </FormField>
          <InlineAlert variant="info">
            This group enters the maker-checker queue and is created once approved.
          </InlineAlert>
          <div className="flex gap-3 pt-1">
            <Btn
              variant="primary"
              onClick={handleCreate}
              disabled={!label.trim() || modules.length === 0}
              loading={submitting}
            >
              Submit for approval
            </Btn>
            <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Edit modules modal */}
      <Modal
        open={!!editGroup}
        onClose={() => setEditGroup(null)}
        title={editGroup ? `Edit modules — ${editGroup.label}` : ""}
      >
        <div className="space-y-4">
          {error && <InlineAlert variant="error">{error}</InlineAlert>}
          <FormField label="Module access">
            <ModulePicker selectable={grantable} selected={modules} onToggle={toggleModule} />
          </FormField>
          <InlineAlert variant="info">
            The module change applies once a checker approves it.
          </InlineAlert>
          <div className="flex gap-3 pt-1">
            <Btn variant="primary" onClick={handleUpdateModules} loading={submitting}>
              Submit for approval
            </Btn>
            <Btn variant="ghost" onClick={() => setEditGroup(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
