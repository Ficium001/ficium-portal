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
import { Plus, Shield, Pencil, Trash2, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "@/shared/lib/portalApi";
import { INSTITUTION_MODULE_LIST, type PortalModule } from "@/shared/lib/modules";
import type { PendingAction } from "@/institution/types/institution";
import {
  InlineAlert, DataTable, DataRow, Td,
  Modal, FormField, inputCls, Btn, SkeletonRow, EmptyState,
} from "@/institution/components/primitives";
import { poll60s } from '@/shared/lib/polling'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstitutionGroup {
  id:                 string;
  institution_id:     string;
  slug:               string;
  label:              string;
  description:        string;
  module_permissions: string[];
  product_scope:      string[];   // [] = unrestricted (all licensed products)
  is_system:          boolean;
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

export interface LicensedProduct {
  id:           string;
  code:         string;
  label:        string;
  family_code:  string;
  family_label: string;
}

// ─── Data hooks ──────────────────────────────────────────────────────────────

function useInstitutionGroups() {
  return useQuery<InstitutionGroup[]>({
    queryKey: ["institution", "groups"],
    queryFn: () => portalApi.get<InstitutionGroup[]>("/groups"),
    staleTime: 30 * 1000,
  });
}

function usePendingGroupActions() {
  return useQuery<PendingAction[]>({
    queryKey: ["institution", "groups", "pending"],
    queryFn: async () => {
      try {
        return await portalApi.get<PendingAction[]>("/groups/pending");
      } catch {
        return [];
      }
    },
    refetchInterval: poll60s,
    refetchOnWindowFocus: true,
  });
}

/** Module keys this member may grant. Wildcard/empty → full catalogue. */
const ALL_INSTITUTION_KEYS = INSTITUTION_MODULE_LIST.map((m) => m.key);

function useGrantableModules() {
  return useQuery<string[]>({
    queryKey: ["institution", "my-modules"],
    queryFn: async () => {
      try {
        const mine = await portalApi.get<string[]>("/groups/my-modules");
        if (mine.length === 0 || mine.includes("*")) return ALL_INSTITUTION_KEYS;
        return ALL_INSTITUTION_KEYS.filter((k) => mine.includes(k));
      } catch {
        return ALL_INSTITUTION_KEYS;
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}

function useLicensedProducts() {
  return useQuery<LicensedProduct[]>({
    queryKey: ["institution", "licensed-products"],
    queryFn: () => portalApi.get<LicensedProduct[]>("/groups/licensed-products"),
    staleTime: 10 * 60 * 1000,
  });
}

/** Product ids this member may grant. Empty → full licensed catalogue. */
function useGrantableProducts(allLicensedIds: string[]) {
  return useQuery<string[]>({
    queryKey: ["institution", "my-products", allLicensedIds.join(",")],
    queryFn: async () => {
      try {
        const mine = await portalApi.get<string[]>("/groups/my-products");
        if (mine.length === 0) return allLicensedIds;
        return allLicensedIds.filter((id) => mine.includes(id));
      } catch {
        return allLicensedIds;
      }
    },
    enabled: allLicensedIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

// Mirrors NAV_SECTIONS in PortalShell.tsx so the picker reads exactly like
// the sidebar the admin already knows. Any module not covered by a named
// section still falls into "Other" below so nothing is ever silently
// dropped if a new module is added to the catalogue before this list is
// updated — that gap (inst:benefits/documents/esign/doctemplates/approvals
// missing from both this list and the live nav) is what caused newly
// licensed modules to be invisible after being granted; keep both lists
// in sync when adding a module to shared/lib/modules.ts.
const MODULE_SECTIONS: { label: string; keys: string[] }[] = [
  { label: "Home",        keys: ["inst:dashboard"] },
  { label: "Marketplace", keys: ["inst:marketplace", "inst:bids", "inst:bid_approval", "inst:approvals"] },
  { label: "Insights",    keys: ["inst:analytics", "inst:notifications"] },
  { label: "Manage",      keys: ["inst:dual_control", "inst:team", "inst:products", "inst:settings", "inst:benefits"] },
  { label: "Operations",  keys: ["inst:audit", "inst:pipeline", "inst:esign", "inst:doctemplates"] },
];

// ─── Module checkbox grid (collapsible, grouped like the sidebar nav) ────────

function ModulePicker({
  selectable, selected, onToggle,
}: {
  selectable: string[];
  selected:   string[];
  onToggle:   (key: string) => void;
}) {
  const modules = INSTITUTION_MODULE_LIST.filter((m) => selectable.includes(m.key));
  const byKey = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.key, m])),
    [modules],
  );

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const named = MODULE_SECTIONS
      .map((s) => {
        const items = s.keys
          .map((k) => byKey[k])
          .filter((m): m is PortalModule => !!m);
        for (const m of items) seen.add(m.key);
        return { label: s.label, items };
      })
      .filter((s) => s.items.length > 0);
    const other = modules.filter((m) => !seen.has(m.key));
    return other.length > 0 ? [...named, { label: "Other", items: other }] : named;
  }, [modules, byKey]);

  // Sections containing an already-selected module start expanded; the
  // rest start collapsed so the picker reads compactly on open. Recomputed
  // only on mount (intentionally — toggling a checkbox shouldn't snap a
  // section open/closed under the admin's cursor).
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.items.some((m) => selected.includes(m.key))).map((g) => g.label)),
  );
  const toggleSection = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });

  if (groups.length === 0) {
    return <div className="text-[11px] text-muted">No modules available to grant.</div>;
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = expanded.has(g.label);
        const selectedCount = g.items.filter((m) => selected.includes(m.key)).length;
        return (
          <div key={g.label} className="border border-ink/8 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(g.label)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-ink/1.5 hover:bg-ink/3 transition-colors text-left"
            >
              <span className="flex items-center gap-1.5">
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted" aria-hidden />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted" aria-hidden />
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink">{g.label}</span>
              </span>
              {selectedCount > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-ficium/10 text-ficium">
                  {selectedCount} selected
                </span>
              )}
            </button>
            {isOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5">
                {g.items.map((m) => {
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
                          ? "border-ficium/40 bg-ficium/4"
                          : "border-ink/8 hover:border-ink/15",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "w-4 h-4 mt-0.5 rounded-sm border shrink-0 flex items-center justify-center",
                          on ? "bg-ficium border-ficium" : "border-ink/25",
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Product checkbox grid ───────────────────────────────────────────────────
// Flat, compact grid like ModulePicker. A family header is only shown when
// that family actually has more than one product — today every family has
// exactly one (Home Loan, Personal Loan, etc.), so headers would just
// duplicate the item label and add noise. This scales cleanly once a
// family ever does have multiple products.

function ProductPicker({
  catalogue, selectable, selected, onToggle,
}: {
  catalogue:  LicensedProduct[];
  selectable: string[];
  selected:   string[];
  onToggle:   (id: string) => void;
}) {
  const products = catalogue.filter((p) => selectable.includes(p.id));
  const familySizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.family_code, (counts.get(p.family_code) ?? 0) + 1);
    return counts;
  }, [products]);

  if (products.length === 0) {
    return <div className="text-[11px] text-muted">No licensed products available to grant.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {products.map((p) => {
        const on = selected.includes(p.id);
        const showFamily = (familySizes.get(p.family_code) ?? 0) > 1;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            aria-pressed={on}
            className={[
              "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all",
              on
                ? "border-ficium/40 bg-ficium/4"
                : "border-ink/8 hover:border-ink/15",
            ].join(" ")}
          >
            <div
              className={[
                "w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center",
                on ? "bg-ficium border-ficium" : "border-ink/25",
              ].join(" ")}
            >
              {on && <span className="text-white text-[10px] leading-none">✓</span>}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink truncate">{p.label}</div>
              {showFamily && (
                <div className="text-[10px] text-muted truncate">{p.family_label}</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── All / Specific product access toggle ───────────────────────────────────

function AccessModeToggle({
  mode, onChange,
}: {
  mode:     "all" | "specific";
  onChange: (mode: "all" | "specific") => void;
}) {
  const options: { value: "all" | "specific"; label: string; hint: string }[] = [
    { value: "all", label: "All licensed products", hint: "Default — works for every product the institution offers" },
    { value: "specific", label: "Specific products", hint: "Restrict this group to selected products only" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const on = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            className={[
              "flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all",
              on
                ? "border-ficium/40 bg-ficium/4"
                : "border-ink/8 hover:border-ink/15",
            ].join(" ")}
          >
            <div
              className={[
                "w-4 h-4 mt-0.5 rounded-full border shrink-0 flex items-center justify-center",
                on ? "border-ficium" : "border-ink/25",
              ].join(" ")}
            >
              {on && <div className="w-2 h-2 rounded-full bg-ficium" />}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink">{opt.label}</div>
              <div className="text-[10px] text-muted leading-snug mt-0.5">{opt.hint}</div>
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
  const { data: licensedProducts = [] }   = useLicensedProducts();
  const licensedProductIds = useMemo(() => licensedProducts.map((p) => p.id), [licensedProducts]);
  const { data: grantableProducts = [] }  = useGrantableProducts(licensedProductIds);

  const [showCreate,  setShowCreate]  = useState(false);
  const [editGroup,   setEditGroup]   = useState<InstitutionGroup | null>(null);
  const [label,       setLabel]       = useState("");
  const [description, setDescription] = useState("");
  const [modules,     setModules]     = useState<string[]>([]);
  const [products,    setProducts]    = useState<string[]>([]);
  const [productMode, setProductMode] = useState<"all" | "specific">("all");
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

  const toggleProduct = (id: string) =>
    setProducts((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const resetForm = () => {
    setLabel(""); setDescription(""); setModules([]); setProducts([]);
    setProductMode("all"); setError(null);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["institution", "groups"] });
    qc.invalidateQueries({ queryKey: ["institution", "groups", "pending"] });
  };

  const submit = async (category: string, payload: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      await portalApi.post("/approvals/submit", {
        action_category: category,
        resource_type:   "institution_groups",
        resource_id:     (payload.group_id as string) ?? null,
        payload,
      });
      invalidate();
      setSubmitting(false);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
      return false;
    }
  };

  const handleCreate = async () => {
    if (!slug || !label.trim()) return;
    if (productMode === "specific" && products.length === 0) {
      setError("Select at least one product, or switch to \"All licensed products\".");
      return;
    }
    const ok = await submit("group.create", {
      slug, label: label.trim(), description: description.trim(),
      module_permissions: modules,
      product_scope: productMode === "all" ? [] : products,
    });
    if (ok) {
      setShowCreate(false);
      resetForm();
      setFlash("Group submitted for approval. It will appear once a checker approves it in Approvals.");
    }
  };

  const handleUpdateModules = async () => {
    if (!editGroup) return;
    if (productMode === "specific" && products.length === 0) {
      setError("Select at least one product, or switch to \"All licensed products\".");
      return;
    }
    const ok = await submit("group.update_modules", {
      group_id: editGroup.id, module_permissions: modules,
      product_scope: productMode === "all" ? [] : products,
    });
    if (ok) {
      setEditGroup(null);
      resetForm();
      setFlash("Access change submitted for approval.");
    }
  };

  const handleDelete = async (g: InstitutionGroup) => {
    const ok = await submit("group.delete", { group_id: g.id, slug: g.slug });
    if (ok) setFlash(`Deletion of "${g.label}" submitted for approval.`);
  };

  const openEdit = (g: InstitutionGroup) => {
    setEditGroup(g);
    setModules(g.module_permissions);
    const scope = g.product_scope ?? [];
    setProducts(scope);
    setProductMode(scope.length === 0 ? "all" : "specific");
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
          <DataTable headers={["Group", "Modules", "Products", "Created", ""]} caption="Loading groups…">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
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
          <DataTable headers={["Group", "Modules", "Products", "Created", ""]} caption="Institution access groups">
            {groups.map((g) => {
              const pendingCat = pendingByGroupId.get(g.id);
              const productLabels = (g.product_scope ?? []).length === 0
                ? null
                : g.product_scope.map((id) => licensedProducts.find((p) => p.id === id)?.label ?? id);
              return (
                <DataRow key={g.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ficium/10 flex items-center justify-center shrink-0">
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
                          <span key={k} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink/5 text-muted border border-ink/8">
                            {k.replace("inst:", "")}
                          </span>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {productLabels === null ? (
                        <span className="text-[11px] text-muted">All licensed products</span>
                      ) : (
                        productLabels.map((label) => (
                          <span key={label} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ficium/6 text-ficium border border-ficium/15">
                            {label}
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
                          aria-label={`Edit access for ${g.label}`}
                          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-ink/5 transition-colors"
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
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create access group" width="max-w-4xl">
        <div className="max-h-[78vh] overflow-y-auto pr-1 space-y-5">
          {error && <InlineAlert variant="error">{error}</InlineAlert>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
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
            </div>
            <div className="space-y-4">
              <FormField label="Product access">
                <AccessModeToggle mode={productMode} onChange={setProductMode} />
              </FormField>
              {productMode === "specific" && (
                <FormField label="Select products" hint="e.g. an Investments team scoped only to deposit/savings products">
                  <ProductPicker
                    catalogue={licensedProducts}
                    selectable={grantableProducts}
                    selected={products}
                    onToggle={toggleProduct}
                  />
                </FormField>
              )}
            </div>
          </div>
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

      {/* Edit access modal */}
      <Modal
        open={!!editGroup}
        onClose={() => setEditGroup(null)}
        title={editGroup ? `Edit access — ${editGroup.label}` : ""}
        width="max-w-4xl"
      >
        <div className="max-h-[78vh] overflow-y-auto pr-1 space-y-5">
          {error && <InlineAlert variant="error">{error}</InlineAlert>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <FormField label="Module access">
                <ModulePicker selectable={grantable} selected={modules} onToggle={toggleModule} />
              </FormField>
            </div>
            <div className="space-y-4">
              <FormField label="Product access">
                <AccessModeToggle mode={productMode} onChange={setProductMode} />
              </FormField>
              {productMode === "specific" && (
                <FormField label="Select products">
                  <ProductPicker
                    catalogue={licensedProducts}
                    selectable={grantableProducts}
                    selected={products}
                    onToggle={toggleProduct}
                  />
                </FormField>
              )}
            </div>
          </div>
          <InlineAlert variant="info">
            The access change applies once a checker approves it.
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
