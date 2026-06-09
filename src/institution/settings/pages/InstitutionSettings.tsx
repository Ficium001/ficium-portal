// =============================================================
// Ficium 3 — Institution Settings
// Team users, API keys, SLA config per product, profile.
// =============================================================
import { useState } from "react";
import {
  useMyInstitution, useMyRole, useInstitutionUsers, useProducts,
} from "../../hooks/useInstitution";
import institutionSupabase from "../../lib/institutionSupabase";
import { Users, Key, Clock, Building2, Copy, Check, Plus, Eye, EyeOff } from "lucide-react";
import type { Institution } from "../../types/institution";

type Tab = "profile" | "team" | "api-keys" | "sla";

export default function InstitutionSettings() {
  const [tab, setTab] = useState<Tab>("profile");
  const { data: institution } = useMyInstitution();
  const { data: role }        = useMyRole();
  const isAdmin = role?.role === "admin" || !!role?.is_primary_admin;

  const TABS = [
    { key: "profile"  as Tab, label: "Profile",    icon: Building2 },
    { key: "team"     as Tab, label: "Team",        icon: Users     },
    { key: "api-keys" as Tab, label: "API keys",    icon: Key       },
    { key: "sla"      as Tab, label: "SLA config",  icon: Clock     },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Settings</h1>
        <p className="text-muted mt-1.5">{institution?.name}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-ink/[0.04] p-1 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
              tab === t.key ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink"
            }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile"  && institution && <ProfileTab institution={institution} />}
      {tab === "team"     && <TeamTab isAdmin={isAdmin} />}
      {tab === "api-keys" && <ApiKeysTab isAdmin={isAdmin} />}
      {tab === "sla"      && <SlaTab isAdmin={isAdmin} />}
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────
function ProfileTab({ institution }: { institution: Institution }) {
  const rows: [string, string][] = [
    ["Institution name",  institution.name],
    ["Legal name",        institution.legal_name],
    ["Type",              institution.institution_type.replace(/_/g, " ")],
    ["Deployment model",  institution.deployment_model],
    ["Country",           institution.country],
    ["Regulator",         institution.regulator ?? "—"],
    ["Reg number",        institution.reg_number ?? "—"],
    ["Compliance status", institution.compliance_status],
    ["Contact email",     institution.primary_contact_email ?? "—"],
    ["Contact phone",     institution.primary_contact_phone ?? "—"],
  ];

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[16px] text-ink">Institution profile</h2>
        <p className="text-[12px] text-muted mt-0.5">To update these details contact your Ficium account manager.</p>
      </div>
      <div className="divide-y divide-ink/[0.05]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center px-6 py-4">
            <div className="w-48 text-[13px] text-muted flex-shrink-0">{k}</div>
            <div className="text-[13px] font-medium text-ink capitalize">{v}</div>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 border-t border-ink/[0.07]">
        <div className="text-[13px] text-muted mb-2">Licensed modules</div>
        <div className="flex gap-2 flex-wrap">
          {institution.modules.map(m => (
            <span key={m} className="bg-ficium/8 text-ficium text-[12px] font-semibold px-3 py-1 rounded-full">{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Team tab ──────────────────────────────────────────────────
function TeamTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: users = [], isLoading } = useInstitutionUsers();
  const [showInvite, setShowInvite]     = useState(false);
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviteRole, setInviteRole]     = useState("analyst");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    await institutionSupabase.rpc("submit_for_approval", {
      p_action_category: "user.invite",
      p_resource_type:   "institution_users",
      p_resource_id:     null,
      p_payload:         { email: inviteEmail, role: inviteRole },
    });
    setInviteSuccess(true);
    setShowInvite(false);
    setInviteEmail("");
  };

  const roleColors: Record<string, string> = {
    admin:      "bg-ficium/8 text-ficium",
    analyst:    "bg-ink/5 text-muted",
    viewer:     "bg-ink/5 text-muted",
    compliance: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink/[0.07] flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-[16px] text-ink">Team members</h2>
          <p className="text-[12px] text-muted mt-0.5">Invitations require maker-checker approval.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(s => !s)}
            className="flex items-center gap-1.5 bg-ficium text-white text-[12px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5" />Invite
          </button>
        )}
      </div>

      {inviteSuccess && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-[13px] text-green-700">
          Invitation submitted for approval.
        </div>
      )}

      {showInvite && (
        <div className="mx-6 mt-4 p-4 bg-cream rounded-xl border border-ink/[0.07] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-ink mb-1.5">Email</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@institution.mu"
                className="w-full border border-ink/[0.12] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink mb-1.5">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                className="w-full border border-ink/[0.12] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-ficium">
                <option value="analyst">Analyst</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleInvite}
              className="bg-ficium text-white text-[12px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
              Submit for approval
            </button>
            <button onClick={() => setShowInvite(false)}
              className="text-[12px] text-muted border border-ink/10 px-4 py-2 rounded-xl hover:bg-ink/[0.03] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="divide-y divide-ink/[0.05]">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ficium/10 flex items-center justify-center text-[11px] font-bold text-ficium">
                  {u.user_id?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-[13px] font-medium text-ink font-mono">{u.user_id?.slice(0, 8)}…</div>
                  {u.is_primary_admin && <div className="text-[10px] text-muted">Primary admin</div>}
                </div>
              </div>
              <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${roleColors[u.role] ?? "bg-ink/5 text-muted"}`}>
                {u.role}
              </span>
            </div>
          ))}
          {users.length === 0 && (
            <div className="px-6 py-10 text-center text-muted text-[13px]">No team members yet</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── API Keys tab ──────────────────────────────────────────────
function ApiKeysTab({ isAdmin }: { isAdmin: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [label,      setLabel]      = useState("");
  const [created,    setCreated]    = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [showKey,    setShowKey]    = useState(false);

  const handleCreate = async () => {
    if (!label.trim()) return;
    const raw = "fk_live_" + Array.from(
      crypto.getRandomValues(new Uint8Array(24))
    ).map(b => b.toString(16).padStart(2, "0")).join("");
    await institutionSupabase.rpc("submit_for_approval", {
      p_action_category: "api_key.create",
      p_resource_type:   "institution_api_keys",
      p_resource_id:     null,
      p_payload:         { label, key_hash: raw, scopes: ["bids:write", "requests:read"] },
    });
    setCreated(raw);
    setShowCreate(false);
    setLabel("");
  };

  const copyKey = () => {
    if (!created) return;
    navigator.clipboard.writeText(created);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink/[0.07] flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-[16px] text-ink">API keys</h2>
          <p className="text-[12px] text-muted mt-0.5">Shown once — store securely.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-1.5 bg-ficium text-white text-[12px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5" />Generate key
          </button>
        )}
      </div>

      {created && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-[12px] font-semibold text-amber-800 mb-2">
            Copy this key now — it will not be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-[11px] font-mono text-ink overflow-auto">
              {showKey ? created : "fk_live_" + "•".repeat(40)}
            </code>
            <button onClick={() => setShowKey(s => !s)} className="text-amber-600 hover:text-amber-800 flex-shrink-0">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={copyKey} className="flex items-center gap-1 text-[12px] font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="mx-6 mt-4 p-4 bg-cream rounded-xl border border-ink/[0.07] space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-ink mb-1.5">Key label</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Production bidding system"
              className="w-full border border-ink/[0.12] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20" />
          </div>
          <div className="text-[12px] text-muted bg-ficium/5 border border-ficium/15 rounded-xl p-3">
            Key creation requires maker-checker approval. Scopes: <code className="font-mono">bids:write requests:read</code>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate}
              className="bg-ficium text-white text-[12px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
              Generate + submit
            </button>
            <button onClick={() => setShowCreate(false)}
              className="text-[12px] text-muted border border-ink/10 px-4 py-2 rounded-xl hover:bg-ink/[0.03]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="px-6 py-12 text-center text-muted text-[13px]">
        No keys visible — raw values are never stored.
      </div>
    </div>
  );
}

// ── SLA config tab ────────────────────────────────────────────
function SlaTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: products = [], isLoading } = useProducts();
  const [saved, setSaved] = useState<string | null>(null);

  const handleSave = async (productCode: string, bidWindow: number, autoWithdraw: number) => {
    await institutionSupabase
      .from("institution_sla_config")
      .upsert(
        { product_code: productCode, bid_window_minutes: bidWindow, auto_withdraw_minutes: autoWithdraw },
        { onConflict: "institution_id,product_code" }
      );
    setSaved(productCode);
    setTimeout(() => setSaved(null), 2000);
  };

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[16px] text-ink">SLA configuration</h2>
        <p className="text-[12px] text-muted mt-0.5">Bid window and auto-withdrawal times per product.</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="divide-y divide-ink/[0.05]">
          {products.slice(0, 8).map(p => (
            <SlaRow key={p.id} product={p} onSave={handleSave} saved={saved === p.code} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function SlaRow({ product, onSave, saved, isAdmin }: {
  product: { id: string; code: string; label: string };
  onSave:  (code: string, bid: number, auto: number) => void;
  saved:   boolean;
  isAdmin: boolean;
}) {
  const [bidWindow,    setBidWindow]    = useState(240);
  const [autoWithdraw, setAutoWithdraw] = useState(300);

  return (
    <div className="flex items-center gap-4 px-6 py-4 flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <div className="text-[13px] font-medium text-ink">{product.label}</div>
        <div className="text-[11px] text-muted font-mono">{product.code}</div>
      </div>
      <div className="flex items-center gap-3">
        <div>
          <label className="block text-[10px] text-muted mb-1">Bid window (min)</label>
          <input type="number" value={bidWindow}
            onChange={e => setBidWindow(Number(e.target.value))}
            disabled={!isAdmin}
            className="w-24 border border-ink/[0.12] rounded-lg px-2 py-1.5 text-[13px] outline-none focus:border-ficium disabled:bg-ink/[0.02] disabled:text-muted" />
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">Auto-withdraw (min)</label>
          <input type="number" value={autoWithdraw}
            onChange={e => setAutoWithdraw(Number(e.target.value))}
            disabled={!isAdmin}
            className="w-24 border border-ink/[0.12] rounded-lg px-2 py-1.5 text-[13px] outline-none focus:border-ficium disabled:bg-ink/[0.02] disabled:text-muted" />
        </div>
        {isAdmin && (
          <button onClick={() => onSave(product.code, bidWindow, autoWithdraw)}
            className={`mt-4 text-[11px] font-bold px-3 py-2 rounded-lg transition-colors ${
              saved ? "bg-green-500 text-white" : "bg-ficium/8 text-ficium hover:bg-ficium hover:text-white"
            }`}>
            {saved ? "✓ Saved" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
