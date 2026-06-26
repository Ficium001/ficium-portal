/**
 * @page InstitutionUsers
 * @route /team/users
 * @access protected — inst:team
 */

import { useMemo, useState } from "react";
import {
  Plus, Users, Clock, Shield, Search, X, Edit2,
  UserX, UserCheck, KeyRound, ChevronRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "@/shared/lib/portalApi";
import { useMyGroup } from "@/admin/hooks/useAdmin";
import type { InstitutionUser, PendingAction } from "@/institution/types/institution";
import type { InstitutionGroup } from "@/institution/settings/components/GroupsTab";
import {
  SectionHeader, InlineAlert, DataTable, DataRow, Td,
  Modal, FormField, inputCls, Btn, SkeletonRow, EmptyState,
} from "@/institution/components/primitives";

// ─── Data hooks ───────────────────────────────────────────────

function useInstitutionMembers() {
  return useQuery<(InstitutionUser & { active?: boolean; auth_active?: boolean; member_role?: string; custom_group_id?: string })[]>({
    queryKey: ["institution", "members"],
    queryFn: () => portalApi.get("/members?include_inactive=true"),
    staleTime: 30_000,
  });
}
function useInstitutionGroups() {
  return useQuery<InstitutionGroup[]>({
    queryKey: ["institution", "groups"],
    queryFn:  () => portalApi.get("/groups"),
    staleTime: 30_000,
  });
}
function usePendingUserActions() {
  return useQuery<PendingAction[]>({
    queryKey: ["institution", "users", "pending"],
    queryFn:  () => portalApi.get("/members/pending"),
    refetchInterval: 60_000,
  });
}

// ─── Helpers ──────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin:    "bg-ficium/8 text-ficium border border-ficium/20",
    checker:  "bg-purple-50 text-purple-700 border border-purple-200",
    maker:    "bg-blue-50 text-blue-700 border border-blue-200",
    analyst:  "bg-teal-50 text-teal-700 border border-teal-200",
    viewer:   "bg-ink/5 text-muted border border-line",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${styles[role] ?? styles.viewer}`}>
      {role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-good">
      <span className="w-1.5 h-1.5 rounded-full bg-good" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-muted/50" />Inactive
    </span>
  );
}

function initials(m: { full_name?: string; email?: string }) {
  return (m.full_name ?? m.email ?? "?")
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Assign group modal ───────────────────────────────────────

function AssignGroupModal({ member, groups, open, onClose }: {
  member: InstitutionUser | null;
  groups: InstitutionGroup[];
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState("");
  const [role,    setRole]    = useState("maker");
  const [error,   setError]   = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: object) => portalApi.post("/approvals/submit", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["institution"] }); onClose(); },
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Failed to submit"),
  });

  const handleSubmit = () => {
    if (!groupId) return setError("Select a group.");
    setError(null);
    mut.mutate({
      action_category: "user.assign_group",
      resource_type: "institution_members",
      resource_id: member?.id,
      payload: { member_id: member?.id, custom_group_id: groupId, member_role: role },
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Assign group — ${member?.full_name ?? member?.email}`}>
      <div className="space-y-4">
        <FormField label="Group">
          <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
            <option value="">Select group…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </FormField>
        <FormField label="Role">
          <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
            {["maker","checker","analyst","viewer"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </FormField>
        {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-2">
          <Btn variant="primary" onClick={handleSubmit} loading={mut.isPending}>Submit for approval</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
        <p className="text-[11px] text-muted">This change enters the maker-checker queue.</p>
      </div>
    </Modal>
  );
}

// ─── Create user modal ────────────────────────────────────────

function CreateUserModal({ groups, open, onClose, onSuccess }: {
  groups: InstitutionGroup[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [username,   setUsername]   = useState("");
  const [groupId,    setGroupId]    = useState("");
  const [role,       setRole]       = useState("maker");
  const [error,      setError]      = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: object) => portalApi.post("/approvals/submit", body),
    onSuccess: () => {
      setFirstName(""); setLastName(""); setEmail(""); setUsername(""); setGroupId(""); setRole("maker");
      onSuccess(); onClose();
    },
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Submission failed"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Create team member">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name">
            <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} placeholder="Jane" />
          </FormField>
          <FormField label="Last name">
            <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} placeholder="Smith" />
          </FormField>
        </div>
        <FormField label="Email">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} placeholder="jane@mcb.mu" />
        </FormField>
        <FormField label="Username">
          <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, "_"))} className={inputCls} placeholder="jane_smith" />
          <p className="text-[10px] text-muted mt-1">Used to log in to the portal</p>
        </FormField>
        <FormField label="Group">
          <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
            <option value="">Select group…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </FormField>
        <FormField label="Role">
          <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
            {["maker","checker","analyst","viewer"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </FormField>
        {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-2">
          <Btn
            variant="primary"
            loading={mut.isPending}
            onClick={() => {
              if (!firstName || !email || !username || !groupId) return setError("First name, email, username and group are required.");
              setError(null);
              mut.mutate({
                action_category: "user.create",
                resource_type: "institution_members",
                payload: { first_name: firstName, last_name: lastName, email, username, custom_group_id: groupId, member_role: role },
              });
            }}
          >
            Submit for approval
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
        <p className="text-[11px] text-muted">New users require maker-checker approval before they can log in.</p>
      </div>
    </Modal>
  );
}

// ─── User detail drawer ───────────────────────────────────────

function TempPasswordModal({ password, email, username, onClose }: { password: string; email: string; username?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open onClose={onClose} title="Temporary password">
      <div className="space-y-4">
        <InlineAlert variant="warning">Share this with <strong>{email}</strong> — it won't be shown again.</InlineAlert>
        {username && (
          <div className="bg-ink/[0.03] border border-ink/[0.10] rounded-xl px-4 py-3">
            <p className="text-[11px] text-muted mb-0.5">Username (for login)</p>
            <code className="text-[13px] font-mono font-bold text-ink">{username}</code>
          </div>
        )}
        <div className="flex items-center gap-2 bg-ink/[0.03] border border-ink/10 rounded-xl px-4 py-3">
          <code className="flex-1 text-[15px] font-mono font-bold text-ink tracking-wider">{password}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-ficium hover:text-ficium-deep text-[11px] font-semibold"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <Btn variant="primary" onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

type MemberExt = InstitutionUser & {
  active?: boolean;
  auth_active?: boolean;
  member_role?: string;
  custom_group_id?: string;
};

function UserDrawer({
  member, groupMap, isAdmin, onClose, onRefresh,
}: {
  member: MemberExt;
  groupMap: Map<string, InstitutionGroup>;
  isAdmin: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [editName,  setEditName]  = useState(false);
  const [fullName,  setFullName]  = useState(member.full_name ?? "");
  const [editEmail, setEditEmail] = useState(false);
  const [email,     setEmail]     = useState(member.email ?? "");
  const [editRole,  setEditRole]  = useState(false);
  const [memberRole, setMemberRole] = useState(member.member_role ?? "maker");
  const [editGroup, setEditGroup] = useState(false);
  const [newGroupId, setNewGroupId] = useState(member.custom_group_id ?? "");
  const [error,     setError]     = useState<string | null>(null);
  const [flash,     setFlash]     = useState<string | null>(null);
  const [tempPw,    setTempPw]    = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"deactivate" | "reactivate" | null>(null);

  const assignGroupMut = useMutation({
    mutationFn: (body: object) => portalApi.post("/approvals/submit", body),
    onSuccess: () => { setEditGroup(false); setFlash("Group change submitted for approval."); onRefresh(); },
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Failed to submit"),
  });

  const isActive = member.active !== false;

  const updateMut = useMutation({
    mutationFn: (body: object) => portalApi.post("/approvals/submit", body),
    onSuccess: () => { setEditName(false); setEditEmail(false); setEditRole(false); setFlash("Change submitted for approval."); onRefresh(); },
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Submission failed"),
  });

  const deactivateMut = useMutation({
    mutationFn: () => portalApi.post("/approvals/submit", {
      action_category: "user.deactivate", resource_type: "institution_members", resource_id: member.id,
      payload: { member_id: member.id, email: member.email },
    }),
    onSuccess: () => { setConfirming(null); setFlash("Deactivation submitted for approval."); onRefresh(); },
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Failed"),
  });

  const reactivateMut = useMutation({
    mutationFn: () => portalApi.post("/approvals/submit", {
      action_category: "user.reactivate", resource_type: "institution_members", resource_id: member.id,
      payload: { member_id: member.id, email: member.email },
    }),
    onSuccess: () => { setConfirming(null); setFlash("Reactivation submitted for approval."); onRefresh(); },
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Failed"),
  });

  const resetPwMut = useMutation({
    mutationFn: () => portalApi.post(`/members/${member.id}/reset-password`, {}),
    onSuccess: (data: any) => setTempPw(data.temp_password),
    onError: (e: any) => setError(e?.detail ?? e?.message ?? "Failed"),
  });

  const group = member.custom_group_id ? groupMap.get(member.custom_group_id) : null;

  return (
    <>
      <div className="fixed inset-0 bg-ink/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[380px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-line flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0 ${isActive ? "bg-ficium/10 text-ficium" : "bg-ink/8 text-muted"}`}>
            {initials(member)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[16px] text-ink truncate">{member.full_name || member.email}</div>
            <div className="text-[12px] text-muted truncate">{member.email}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {flash && <InlineAlert variant="success" onDismiss={() => setFlash(null)}>{flash}</InlineAlert>}
          {error && <InlineAlert variant="error" onDismiss={() => setError(null)}>{error}</InlineAlert>}

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Status</span>
            <StatusBadge active={isActive} />
          </div>

          {/* Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Full name</span>
              {isAdmin && !member.is_primary_admin && (
                <button onClick={() => setEditName(!editName)} className="text-[11px] text-ficium font-semibold flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            {editName ? (
              <div className="space-y-2">
                <input value={fullName} onChange={e => setFullName(e.target.value)} className={`${inputCls} w-full`} />
                <div className="flex gap-2">
                  <Btn size="sm" variant="primary" loading={updateMut.isPending} onClick={() => updateMut.mutate({
                    action_category: "user.update", resource_type: "institution_members", resource_id: member.id,
                    payload: { member_id: member.id, field: "full_name", value: fullName },
                  })}>Submit for approval</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditName(false)}>Cancel</Btn>
                </div>
                <p className="text-[10px] text-muted">Requires checker approval.</p>
              </div>
            ) : (
              <p className="text-[13px] text-ink font-medium">{member.full_name || "—"}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Email</span>
              {isAdmin && !member.is_primary_admin && (
                <button onClick={() => setEditEmail(!editEmail)} className="text-[11px] text-ficium font-semibold flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            {editEmail ? (
              <div className="space-y-2">
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={`${inputCls} w-full`} />
                <div className="flex gap-2">
                  <Btn size="sm" variant="primary" loading={updateMut.isPending} onClick={() => updateMut.mutate({
                    action_category: "user.update", resource_type: "institution_members", resource_id: member.id,
                    payload: { member_id: member.id, field: "email", value: email },
                  })}>Submit for approval</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditEmail(false); setEmail(member.email ?? ""); }}>Cancel</Btn>
                </div>
                <p className="text-[10px] text-muted">Email changes affect login — requires checker approval.</p>
              </div>
            ) : (
              <p className="text-[13px] text-ink font-medium">{member.email || "—"}</p>
            )}
          </div>

          {/* Role */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Role</span>
              {isAdmin && !member.is_primary_admin && (
                <button onClick={() => setEditRole(!editRole)} className="text-[11px] text-ficium font-semibold flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            {editRole ? (
              <div className="space-y-2">
                <select value={memberRole} onChange={e => setMemberRole(e.target.value)} className={`${inputCls} w-full`}>
                  {["maker","checker","analyst","viewer"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <Btn size="sm" variant="primary" loading={updateMut.isPending} onClick={() => updateMut.mutate({
                    action_category: "user.update", resource_type: "institution_members", resource_id: member.id,
                    payload: { member_id: member.id, field: "member_role", value: memberRole },
                  })}>Submit for approval</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditRole(false)}>Cancel</Btn>
                </div>
                <p className="text-[10px] text-muted">Requires checker approval.</p>
              </div>
            ) : (
              <RoleBadge role={member.member_role ?? member.role ?? "viewer"} />
            )}
          </div>

          {/* Group */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Group</span>
              {isAdmin && !member.is_primary_admin && (
                <button onClick={() => setEditGroup(v => !v)} className="text-[11px] text-ficium font-semibold flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            {editGroup ? (
              <div className="space-y-2">
                <select value={newGroupId} onChange={e => setNewGroupId(e.target.value)} className={inputCls}>
                  <option value="">Select group…</option>
                  {Array.from(groupMap.values()).map(g => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Btn size="sm" variant="primary" loading={assignGroupMut.isPending}
                    onClick={() => {
                      if (!newGroupId) return;
                      assignGroupMut.mutate({ member_id: member.id, custom_group_id: newGroupId, member_role: member.member_role ?? "maker" });
                    }}
                  >
                    Submit for approval
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditGroup(false)}>Cancel</Btn>
                </div>
                <p className="text-[10px] text-muted">Group changes require checker approval.</p>
              </div>
            ) : group ? (
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-ficium" />
                <span className="text-[13px] font-medium text-ink">{group.label}</span>
              </div>
            ) : (
              <span className="text-[12px] text-muted italic">Unassigned</span>
            )}
          </div>

          {/* Member since */}
          <div>
            <span className="text-[12px] font-semibold text-muted uppercase tracking-wider block mb-1">Member since</span>
            <p className="text-[13px] text-ink">{new Date(member.created_at).toLocaleDateString("en-MU", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>

          {/* Admin actions */}
          {isAdmin && !member.is_primary_admin && (
            <div className="pt-2 border-t border-line space-y-2">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Admin actions</p>

              {/* Reset password */}
              <button
                onClick={() => resetPwMut.mutate()}
                disabled={resetPwMut.isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-line hover:border-ficium hover:text-ficium text-ink transition-all text-left group"
              >
                <KeyRound className="w-4 h-4 text-muted group-hover:text-ficium transition-colors" />
                <span className="text-[13px] font-semibold">{resetPwMut.isPending ? "Generating…" : "Reset password"}</span>
              </button>

              {/* Deactivate / Reactivate */}
              {confirming === "deactivate" ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-[12px] text-red-700 font-semibold">Deactivate {member.full_name ?? member.email}?</p>
                  <p className="text-[11px] text-red-600">This will be submitted for checker approval before taking effect.</p>
                  <div className="flex gap-2">
                    <Btn variant="danger" size="sm" loading={deactivateMut.isPending} onClick={() => deactivateMut.mutate()}>Submit for approval</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Btn>
                  </div>
                </div>
              ) : confirming === "reactivate" ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <p className="text-[12px] text-emerald-700 font-semibold">Reactivate {member.full_name ?? member.email}?</p>
                  <p className="text-[11px] text-emerald-600">This will be submitted for checker approval before taking effect.</p>
                  <div className="flex gap-2">
                    <Btn variant="primary" size="sm" loading={reactivateMut.isPending} onClick={() => reactivateMut.mutate()}>Submit for approval</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Btn>
                  </div>
                </div>
              ) : isActive ? (
                <button
                  onClick={() => setConfirming("deactivate")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 transition-all text-left group"
                >
                  <UserX className="w-4 h-4" />
                  <span className="text-[13px] font-semibold">Deactivate user</span>
                </button>
              ) : (
                <button
                  onClick={() => setConfirming("reactivate")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-emerald-700 transition-all text-left group"
                >
                  <UserCheck className="w-4 h-4" />
                  <span className="text-[13px] font-semibold">Reactivate user</span>
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {tempPw && (
        <TempPasswordModal password={tempPw} email={member.email ?? ""} onClose={() => setTempPw(null)} />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function InstitutionUsers() {
  const qc = useQueryClient();
  const { data: myGroup }                  = useMyGroup();
  const { data: members = [], isLoading }  = useInstitutionMembers();
  const { data: groups  = [] }             = useInstitutionGroups();
  const { data: pending = [] }             = usePendingUserActions();

  const isAdmin = !!(myGroup?.module_permissions?.includes("inst:team") &&
    (myGroup?.label?.toLowerCase().includes("admin") || myGroup?.slug?.includes("admin")));

  const [showCreate,   setShowCreate]   = useState(false);
  const [assignTarget, setAssignTarget] = useState<InstitutionUser | null>(null);
  const [drawerMember, setDrawerMember] = useState<MemberExt | null>(null);
  const [flash,        setFlash]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  );

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

  // Filter members
  const filtered = useMemo(() => {
    return (members as MemberExt[]).filter(m => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (m.full_name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q);
      const matchActive = showInactive ? true : m.active !== false;
      return matchSearch && matchActive;
    });
  }, [members, search, showInactive]);

  const inactiveCount = (members as MemberExt[]).filter(m => m.active === false).length;

  return (
    <main className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <SectionHeader
        title="Team"
        subtitle="Manage who has access to your institution's portal"
      />

      {flash && (
        <div className="mb-4">
          <InlineAlert variant="success" onDismiss={() => setFlash(null)}>{flash}</InlineAlert>
        </div>
      )}

      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-ink/[0.07]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-bold text-[15px] text-ink">Members</h2>
              <p className="text-[11px] text-muted mt-0.5">
                {members.length} member{members.length !== 1 ? "s" : ""} · new users require maker-checker approval
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && groups.length === 0 && (
                <span className="text-[11px] text-muted">Create a group in Settings first</span>
              )}
              {isAdmin && groups.length > 0 && (
                <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
                  Create user
                </Btn>
              )}
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-8 pr-3 py-2 text-[12px] border border-line rounded-xl focus:outline-none focus:border-ficium bg-ink/[0.02]"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(v => !v)}
                className={`text-[11px] font-semibold px-3 py-2 rounded-xl border transition-all ${showInactive ? "border-ficium text-ficium bg-ficium/5" : "border-line text-muted hover:border-ficium/40"}`}
              >
                {showInactive ? "Hide" : "Show"} inactive ({inactiveCount})
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <DataTable headers={["Member", "Group", "Role", "Status", "Since", ""]} caption="Loading members…">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
          </DataTable>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? "No members match your search" : "No team members yet"}
            description={search ? "Try a different name or email" : isAdmin ? "Create your first team member above" : "Your admin hasn't added any team members yet"}
          />
        ) : (
          <DataTable headers={["Member", "Group", "Role", "Status", "Since", ""]} caption="Institution team">
            {filtered.map((m) => {
              const group      = m.custom_group_id ? groupMap.get(m.custom_group_id) : null;
              const pendingCat = pendingByMember.get(m.id);
              const isActive   = m.active !== false;
              return (
                <DataRow
                  key={m.id}
                  className={`cursor-pointer hover:bg-ink/[0.02] transition-colors ${!isActive ? "opacity-60" : ""}`}
                  onClick={() => setDrawerMember(m)}
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 uppercase ${isActive ? "bg-ficium/10 text-ficium" : "bg-ink/8 text-muted"}`}>
                        {initials(m)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-ink block truncate">
                          {m.full_name || m.email}
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
                        <Shield className="w-3 h-3 text-ficium flex-shrink-0" />
                        <span className="text-[12px] font-medium text-ink">{group.label}</span>
                        {pendingCat === "user.assign_group" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />pending
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted italic">Unassigned</span>
                    )}
                  </Td>
                  <Td><RoleBadge role={m.member_role ?? m.role ?? "viewer"} /></Td>
                  <Td><StatusBadge active={isActive} /></Td>
                  <Td className="text-muted text-[12px]">
                    {new Date(m.created_at).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric" })}
                  </Td>
                  <Td>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </Td>
                </DataRow>
              );
            })}
          </DataTable>
        )}

        {pendingCreates.length > 0 && (
          <div className="px-5 py-3 border-t border-ink/[0.07] bg-amber-50/40">
            <div className="text-[11px] text-amber-800 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {pendingCreates.length} new user{pendingCreates.length !== 1 ? "s" : ""} awaiting approval in Dual Control
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal
        groups={groups}
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => { invalidate(); setFlash("User submitted for approval — checker must approve before they can log in."); }}
      />
      <AssignGroupModal
        member={assignTarget}
        groups={groups}
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
      />

      {/* User detail drawer */}
      {drawerMember && (
        <UserDrawer
          member={drawerMember}
          groupMap={groupMap}
          isAdmin={isAdmin}
          onClose={() => setDrawerMember(null)}
          onRefresh={() => { invalidate(); setDrawerMember(null); }}
        />
      )}
    </main>
  );
}
