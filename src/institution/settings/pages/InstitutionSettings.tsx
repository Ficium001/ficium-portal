/**
 * @page InstitutionSettings
 * @route /settings
 * @access protected — admin (write), all roles (read)
 * @description
 *   Institution configuration hub. Tabbed into four sections:
 *     - Profile     — read-only institution identity; contact Ficium to update
 *     - Team        — member list; invite (maker-checker); role display
 *     - API keys    — generate / revoke integration keys (maker-checker)
 *     - SLA config  — bid window and auto-withdrawal minutes per product
 *
 *   Admin-only mutations (invite, generate key, revoke) all route
 *   through submit_for_approval() and appear in /approvals.
 *
 * @dataSource
 *   useMyInstitution   → institutions table (5 min cache)
 *   useMyRole          → institution_members (10 min cache)
  *   useProducts         → products table (1 hr cache)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState } from "react";
import {
  Building2, Key, Clock, Copy, Check, Plus, Eye, EyeOff, Shield,
} from "lucide-react";
import {
  useMyInstitution, useMyRole, useProducts,
} from "../../hooks/useInstitution";
import { useMyGroup } from "../../../admin/hooks/useAdmin";
import type { Institution } from "../../types/institution";
import { portalApi } from "../../../shared/lib/portalApi";
import {
  SectionHeader, StatusBadge, InlineAlert,
  Modal, FormField, inputCls, Btn,
} from "../../components/primitives";
import GroupsTab from "../components/GroupsTab";

// ─────────────────────────────────────────────────────────────────────────────
// Tab types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "profile" | "groups" | "api-keys" | "sla";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "profile",  label: "Profile",   icon: Building2 },
  { key: "groups",   label: "Groups",    icon: Shield    },
  { key: "api-keys", label: "API keys",  icon: Key       },
  { key: "sla",      label: "SLA",       icon: Clock     },
];

// ─────────────────────────────────────────────────────────────────────────────
// ProfileTab
// ─────────────────────────────────────────────────────────────────────────────

function ProfileTab({ institution }: { institution: Institution }) {
  const fields: [string, string][] = [
    ["Institution name",  institution.name],
    ["Legal name",        institution.legal_name],
    ["Type",              institution.institution_type.replace(/_/g, " ")],
    ["Deployment model",  institution.deployment_model],
    ["Country",           institution.country],
    ["Regulator",         institution.regulator ?? "—"],
    ["Reg number",        institution.reg_number ?? "—"],
    ["Contact email",     institution.primary_contact_email ?? "—"],
    ["Contact phone",     institution.primary_contact_phone ?? "—"],
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/[0.07] flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-ink">Institution profile</h2>
          <p className="text-[11px] text-muted">To update, contact your Ficium account manager</p>
        </div>
        <div className="divide-y divide-ink/[0.05]">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-center px-5 py-3.5">
              <div className="w-44 text-[12px] text-muted flex-shrink-0">{label}</div>
              <div className="text-[13px] font-medium text-ink capitalize">{value}</div>
            </div>
          ))}
          {/* Compliance status */}
          <div className="flex items-center px-5 py-3.5">
            <div className="w-44 text-[12px] text-muted flex-shrink-0">Compliance status</div>
            <StatusBadge status={institution.compliance_status} size="xs" />
          </div>
          {/* Onboarding stage */}
          <div className="flex items-center px-5 py-3.5">
            <div className="w-44 text-[12px] text-muted flex-shrink-0">Onboarding stage</div>
            <StatusBadge status={institution.onboarding_stage} size="xs"
              label={institution.onboarding_stage.replace(/_/g, " ")} />
          </div>
        </div>
        {/* Licensed modules */}
        <div className="px-5 py-4 border-t border-ink/[0.07]">
          <div className="text-[12px] text-muted mb-2.5">Licensed modules</div>
          <div className="flex gap-2 flex-wrap">
            {institution.modules.map((m) => (
              <span
                key={m}
                className="bg-ficium/8 text-ficium border border-ficium/20 text-[11px] font-semibold px-3 py-1 rounded-full"
              >
                {m}
              </span>
            ))}
            {institution.modules.length === 0 && (
              <span className="text-[12px] text-muted italic">No modules assigned yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ApiKeysTab
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeysTab({ isAdmin }: { isAdmin: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [label,      setLabel]      = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [showKey,    setShowKey]    = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!label.trim()) return;
    setSubmitting(true);
    const raw = "fk_live_" + Array.from(
      crypto.getRandomValues(new Uint8Array(24))
    ).map((b) => b.toString(16).padStart(2, "0")).join("");
    try {
      await portalApi.post("/approvals/submit", {
        action_category: "api_key.create",
        resource_type:   "institution_api_keys",
        resource_id:     null,
        payload:         { label, scopes: ["bids:write", "requests:read"] },
      });
      setCreatedKey(raw);
      setShowCreate(false);
      setLabel("");
    } finally {
      setSubmitting(false);
    }
  };

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4">
      {createdKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-amber-700" aria-hidden />
            <span className="text-[13px] font-bold text-amber-800">
              Copy this key now — it will never be shown again
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2.5 text-[11px] font-mono text-ink overflow-auto">
              {showKey ? createdKey : "fk_live_" + "•".repeat(40)}
            </code>
            <button
              onClick={() => setShowKey((s) => !s)}
              className="text-amber-600 hover:text-amber-800 transition-colors flex-shrink-0"
              aria-label={showKey ? "Hide key" : "Reveal key"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={copyKey}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0"
              aria-label="Copy API key"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-amber-700">
            This key is awaiting maker-checker approval before it becomes active.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/[0.07] flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-[15px] text-ink">API keys</h2>
            <p className="text-[11px] text-muted mt-0.5">
              Keys are never stored in plaintext — raw values shown once only
            </p>
          </div>
          {isAdmin && (
            <Btn
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowCreate(true)}
            >
              Generate key
            </Btn>
          )}
        </div>
        <div className="px-5 py-14 text-center text-[13px] text-muted">
          <Key className="w-8 h-8 text-ink/15 mx-auto mb-3" aria-hidden />
          No active keys visible — plaintext values are never stored or displayed
        </div>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Generate API key">
        <div className="space-y-4">
          <FormField label="Key label" hint="A descriptive name for this key's use case">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Production bidding integration"
              className={inputCls}
            />
          </FormField>
          <div className="bg-ink/[0.03] border border-ink/[0.07] rounded-xl p-4">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Default scopes</div>
            <div className="flex gap-2">
              {["bids:write", "requests:read"].map((s) => (
                <code key={s} className="text-[11px] bg-ficium/8 text-ficium px-2.5 py-1 rounded-full font-mono border border-ficium/15">
                  {s}
                </code>
              ))}
            </div>
          </div>
          <InlineAlert variant="warning">
            Key generation enters the maker-checker queue. A second admin must approve
            before the key is activated. Store the key securely immediately — it will
            not be shown again after this session.
          </InlineAlert>
          <div className="flex gap-3 pt-1">
            <Btn
              variant="primary"
              onClick={handleCreate}
              disabled={!label.trim()}
              loading={submitting}
            >
              Generate + submit
            </Btn>
            <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlaTab
// ─────────────────────────────────────────────────────────────────────────────

function SlaTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: products = [], isLoading } = useProducts();
  const [values, setValues] = useState<Record<string, { bid: number; auto: number }>>({});
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  const getVal = (code: string) => values[code] ?? { bid: 240, auto: 300 };

  const setVal = (code: string, field: "bid" | "auto", v: number) =>
    setValues((prev) => ({ ...prev, [code]: { ...getVal(code), [field]: v } }));

  const handleSave = async (code: string) => {
    const v = getVal(code);
    await portalApi.post("/sla-config", {
      product_code:          code,
      bid_window_minutes:    v.bid,
      auto_withdraw_minutes: v.auto,
    });
    setSaved((prev) => ({ ...prev, [code]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [code]: false })), 2500);
  };

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
      <div className="px-5 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[15px] text-ink">SLA configuration</h2>
        <p className="text-[11px] text-muted mt-0.5">
          Bid window and auto-withdrawal timeouts per product. Changes take effect immediately.
        </p>
      </div>
      {isLoading ? (
        <div className="divide-y divide-ink/[0.05]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
              <div className="flex-1 h-4 bg-ink/[0.06] rounded w-32" />
              <div className="h-8 w-24 bg-ink/[0.05] rounded-lg" />
              <div className="h-8 w-24 bg-ink/[0.05] rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-ink/[0.05]">
          {products.map((p) => {
            const v = getVal(p.code);
            return (
              <div
                key={p.id}
                className="flex items-center gap-4 px-5 py-4 flex-wrap"
              >
                <div className="flex-1 min-w-[140px]">
                  <div className="text-[13px] font-semibold text-ink">{p.label}</div>
                  <code className="text-[11px] text-muted font-mono">{p.code}</code>
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                      Bid window (min)
                    </label>
                    <input
                      type="number"
                      value={v.bid}
                      onChange={(e) => setVal(p.code, "bid", Number(e.target.value))}
                      disabled={!isAdmin}
                      min={15}
                      max={1440}
                      className="w-24 border border-ink/[0.12] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 disabled:bg-ink/[0.02] disabled:text-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                      Auto-withdraw (min)
                    </label>
                    <input
                      type="number"
                      value={v.auto}
                      onChange={(e) => setVal(p.code, "auto", Number(e.target.value))}
                      disabled={!isAdmin}
                      min={15}
                      max={2880}
                      className="w-24 border border-ink/[0.12] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-ficium focus:ring-2 focus:ring-ficium/20 disabled:bg-ink/[0.02] disabled:text-muted"
                    />
                  </div>
                  {isAdmin && (
                    <Btn
                      variant={saved[p.code] ? "secondary" : "primary"}
                      size="sm"
                      icon={saved[p.code] ? Check : undefined}
                      onClick={() => handleSave(p.code)}
                    >
                      {saved[p.code] ? "Saved" : "Save"}
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionSettings() {
  const [tab,            setTab] = useState<Tab>("profile");
  const { data: institution }    = useMyInstitution();
  const { data: role }           = useMyRole();
  const { data: myGroup }        = useMyGroup();

  // Resolve admin from the group already working in the shell (useMyRole
  // may return undefined if institution_members query fails)
  const isAdmin =
    role?.role === "admin" || !!role?.is_primary_admin ||
    !!(myGroup?.label?.toLowerCase().includes("admin"));

  return (
    <main className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <SectionHeader
        title="Settings"
        subtitle={institution?.name}
      />

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 bg-ink/[0.04] p-1 rounded-xl mb-6 w-fit"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
              tab === t.key ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            <t.icon className="w-3.5 h-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "profile"  && institution && <ProfileTab institution={institution} />}
      {tab === "groups"   && <GroupsTab isAdmin={isAdmin} />}
      {tab === "api-keys" && <ApiKeysTab isAdmin={isAdmin} />}
      {tab === "sla"      && <SlaTab   isAdmin={isAdmin} />}
    </main>
  );
}
