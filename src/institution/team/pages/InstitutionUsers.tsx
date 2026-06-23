/**
 * @page InstitutionUsers
 * @route /team/users
 * @access protected — inst:team
 * @description
 *   Institution user management. Admins create users, assign them to a
 *   custom institution group, and set their maker-checker role.
 *
 *   Create user flow:
 *     1. Admin fills in name, email, group, role → submit_for_approval
 *        (action_category: user.create)
 *     2. Checker approves in /approvals
 *     3. approve_action executor calls provision-institution-user Edge Fn
 *     4. Edge Fn: auth.admin.inviteUserByEmail + institution_members insert
 *     5. User receives set-password email → logs in
 *
 *   Assign group flow:
 *     Inline edit on existing members → user.assign_group pending action
 *     → executor updates custom_group_id on institution_members
 *
 * @dataSource
 *   institution.institution_members  (30 s cache)
 *   institution.groups               (30 s cache)
 *   institution.pending_actions_v    (60 s poll) — compat view over governance.action;
 *                                     institution.pending_actions itself is no longer
 *                                     written to as of migration 06.
 *
 * @owner Ficium Engineering
 */

import { useMemo, useState } from "react";
import {
  Plus, Users, Clock, Shield,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "../../../shared/lib/portalApi";
import { useMyGroup } from "../../../admin/hooks/useAdmin";
import type { InstitutionUser, PendingAction } from "../../types/institution";
import type { InstitutionGroup } from "../../settings/components/GroupsTab";
import {
  SectionHeader, InlineAlert, DataTable, DataRow, Td,
  Modal, FormField, inputCls, Btn, SkeletonRow, EmptyState,
} from "../../components/primitives";

// ─── Data hooks ──────────────────────────────────────────────────────────────

function useInstitutionMembers() {
  return useQuery<InstitutionUser[]>({
    queryKey: ["institution", "members"],
    queryFn: () => portalApi.get<InstitutionUser[]>("/members"),
    staleTime: 30 * 1000,
  });
}

function useInstitutionGroups() {
  return useQuery<InstitutionGroup[]>({
    queryKey: ["institution", "groups"],
    queryFn: () => portalApi.get<InstitutionGroup[]>("/groups"),
    staleTime: 30 * 1000,
  });
}

function usePendingUserActions() {
  return useQuery<PendingAction[]>({
    queryKey: ["institution", "users", "pending"],
    queryFn: async () => {
      try {
        return await portalApi.get<PendingAction[]>("/members/pending");
      } catch {
        return [];
      }
    },
    refetchInterval: 60 * 1000,
  });
}

// ─── Role badge ──────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, string> = {
  maker:        "bg-ficium/[0.08] text-ficium border-ficium/20",
  checker:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  viewer:       "bg-ink/[0.05] text-muted border-ink/[0.08]",
  api_operator: "bg-purple-50 text-purple-700 border-purple-200",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_STYLE[role] ?? ROLE_STYLE.viewer}`}>
      {role?.replace("_", " ") ?? "—"}
    </span>
  );
}

// ─── Assign group modal ──────────────────────────────────────────────────────

function AssignGroupModal({
  member, groups, open, onClose,
}: {
  member:  InstitutionUser | null;
  groups:  InstitutionGroup[];
  open:    boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [groupId,    setGroupId]    = useState("");
  const [role,       setRole]       = useState("maker");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!member || !groupId) return;
    setSubmitting(true);
    setError(null);
    try {
      await portalApi.post("/approvals/submit", {
        action_category: "user.assign_group",
        resource_type:   "institution_members",
        resource_id:     member.id,
        payload:         { member_id: member.id, custom_group_id: groupId, member_role: role },
      });
      qc.invalidateQueries({ queryKey: ["institution", "users", "pending"] });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Assign group">
      <div className="space-y-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        <FormField label="Group">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
            <option value="">Select a group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Role within group" hint="Controls maker-checker permissions for this member">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="maker">Maker — can submit actions</option>
            <option value="checker">Checker — can approve actions</option>
            <option value="viewer">Viewer — read only</option>
            <option value="api_operator">API Operator — programmatic access</option>
          </select>
        </FormField>
        <InlineAlert variant="info">
          The group change enters the maker-checker queue and applies once approved.
        </InlineAlert>
        <div className="flex gap-3 pt-1">
          <Btn variant="primary" onClick={handleSubmit} disabled={!groupId} loading={submitting}>
            Submit for approval
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Create user modal ───────────────────────────────────────────────────────

function CreateUserModal({
  groups, open, onClose, onSuccess,
}: {
  groups:    InstitutionGroup[];
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [groupId,    setGroupId]    = useState("");
  const [role,       setRole]       = useState("maker");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const selectedGroup = groups.find((g) => g.id === groupId);

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail("");
    setGroupId(""); setRole("maker"); setError(null);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !groupId) return;
    setSubmitting(true);
    setError(null);
    try {
      await portalApi.post("/approvals/submit", {
        action_category: "user.create",
        resource_type:   "institution_members",
        resource_id:     null,
        payload: {
          email:           email.trim().toLowerCase(),
          first_name:      firstName.trim(),
          last_name:       lastName.trim(),
          custom_group_id: groupId,
          member_role:     role,
        },
      });
      reset();
      onClose();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Create team member">
      <div className="space-y-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Aisha"
              className={inputCls}
            />
          </FormField>
          <FormField label="Last name">
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Ramjeet"
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Work email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="aisha.ramjeet@mcb.mu"
            type="email"
            className={inputCls}
          />
        </FormField>

        <FormField label="Access group" hint="Determines which modules this user can access">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
            <option value="">Select a group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label} — {g.module_permissions.map((k) => k.replace("inst:", "")).join(", ")}
              </option>
            ))}
          </select>
        </FormField>

        {selectedGroup && (
          <div className="flex flex-wrap gap-1.5 px-3 py-2.5 rounded-lg bg-ficium/[0.04] border border-ficium/20">
            {selectedGroup.module_permissions.map((k) => (
              <span key={k} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ficium/10 text-ficium">
                {k.replace("inst:", "")}
              </span>
            ))}
          </div>
        )}

        <FormField label="Role" hint="Maker can submit actions; Checker can approve them">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="maker">Maker — submits bids and actions</option>
            <option value="checker">Checker — approves bids and actions</option>
            <option value="viewer">Viewer — read only</option>
            <option value="api_operator">API Operator — programmatic access only</option>
          </select>
        </FormField>

        <InlineAlert variant="info">
          This enters the maker-checker queue. Once approved, {email || "the user"} will receive
          an email to set their password and access the portal.
        </InlineAlert>

        <div className="flex gap-3 pt-1">
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={!email.trim() || !groupId}
            loading={submitting}
          >
            Submit for approval
          </Btn>
          <Btn variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InstitutionUsers() {
  const qc = useQueryClient();
  const { data: myGroup }            = useMyGroup();
  const { data: members = [], isLoading } = useInstitutionMembers();
  const { data: groups  = [] }       = useInstitutionGroups();
  const { data: pending = [] }       = usePendingUserActions();

  const isAdmin = !!(myGroup?.label?.toLowerCase().includes("admin"));

  const [showCreate,    setShowCreate]    = useState(false);
  const [assignTarget,  setAssignTarget]  = useState<InstitutionUser | null>(null);
  const [flash,         setFlash]         = useState<string | null>(null);

  // Map group id → label for display
  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  );

  // Map member id → pending action category
  const pendingByMember = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of pending) {
      const mid = (a.payload as Record<string, unknown>)?.member_id as string | undefined;
      if (mid) map.set(mid, a.action_category);
    }
    return map;
  }, [pending]);

  const pendingCreates = pending.filter((a) => a.action_category === "user.create");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["institution", "members"] });
    qc.invalidateQueries({ queryKey: ["institution", "users", "pending"] });
  };

  return (
    <main className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <SectionHeader
        title="Team"
        subtitle="Manage who has access to your institution's portal"
      />

      {flash && (
        <div className="mb-4"><InlineAlert variant="success" onDismiss={() => setFlash(null)}>
          {flash}
        </InlineAlert></div>
      )}

      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/[0.07] flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-[15px] text-ink">Members</h2>
            <p className="text-[11px] text-muted mt-0.5">
              {members.length} member{members.length !== 1 ? "s" : ""} · new users require maker-checker approval
            </p>
          </div>
          {isAdmin && groups.length > 0 && (
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
              Create user
            </Btn>
          )}
          {isAdmin && groups.length === 0 && (
            <span className="text-[11px] text-muted">
              Create a group in Settings first
            </span>
          )}
        </div>

        {isLoading ? (
          <DataTable headers={["Member", "Group", "Role", "Since", ""]} caption="Loading members…">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
          </DataTable>
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team members yet"
            description={isAdmin ? "Create your first team member above" : "Your admin hasn't added any team members yet"}
          />
        ) : (
          <DataTable headers={["Member", "Group", "Role", "Since", ""]} caption="Institution team">
            {members.map((m) => {
              const mu = m as InstitutionUser & { custom_group_id?: string; member_role?: string };
              const group      = mu.custom_group_id ? groupMap.get(mu.custom_group_id) : null;
              const pendingCat = pendingByMember.get(m.id);
              return (
                <DataRow key={m.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-ficium/10 flex items-center justify-center text-[11px] font-bold text-ficium flex-shrink-0 uppercase">
                        {m.full_name
                          ? m.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
                          : (m.auth_user_id ?? m.id).slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-ink block truncate">
                          {m.full_name || m.email || (m.auth_user_id ?? m.id).slice(0, 16) + "…"}
                        </span>
                        {m.email && m.full_name && (
                          <span className="text-[11px] text-muted block truncate">{m.email}</span>
                        )}
                        {m.is_primary_admin && (
                          <span className="text-[10px] font-semibold text-ficium">Primary admin</span>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {group ? (
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-ficium flex-shrink-0" aria-hidden />
                        <span className="text-[12px] font-medium text-ink">{group.label}</span>
                        {pendingCat === "user.assign_group" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" aria-hidden />pending
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted italic">Unassigned</span>
                    )}
                  </Td>
                  <Td>
                    <RoleBadge role={mu.member_role ?? m.role ?? "viewer"} />
                  </Td>
                  <Td className="text-muted text-[12px]">
                    {new Date(m.created_at).toLocaleDateString("en-MU", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </Td>
                  <Td>
                    {isAdmin && !m.is_primary_admin && (
                      <button
                        onClick={() => setAssignTarget(m)}
                        className="text-[11px] font-medium text-ficium hover:text-ficium/80 transition-colors"
                      >
                        Assign group
                      </button>
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
              {pendingCreates.length} new user{pendingCreates.length !== 1 ? "s" : ""} awaiting approval in Approvals
            </div>
          </div>
        )}
      </div>

      <CreateUserModal
        groups={groups}
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          invalidate();
          setFlash("User submitted for approval. They'll receive an invite email once a checker approves.");
        }}
      />

      <AssignGroupModal
        member={assignTarget}
        groups={groups}
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
      />
    </main>
  );
}
