/**
 * ApiKeysTab — Settings → API keys
 *
 * Lets institution admins create, approve, revoke, and delete
 * API keys for machine-to-machine integration (LOS, middleware).
 *
 * Lifecycle:
 *   Create (maker) → pending_approval
 *   Approve (checker, different user) → active
 *   Revoke → immediately inactive
 *
 * Raw key is shown ONCE on creation and must be copied immediately.
 */

import { useState } from "react";
import {
  Key, Plus, Copy, Check, Eye, EyeOff, Shield,
  CheckCircle2, Clock, XCircle, Trash2, AlertTriangle,
} from "lucide-react";
import {
  useApiKeys, useCreateApiKey, useApproveApiKey,
  useRevokeApiKey, useDeleteApiKey,
} from "@/institution/hooks/useInstitution";
import type { ApiKey } from "@/institution/types/institution";
import {
  InlineAlert, EmptyState, Modal,
  FormField, inputCls, Btn,
} from "@/institution/components/primitives";

// ─── Scope definitions ────────────────────────────────────────────────────────

const ALL_SCOPES = [
  { key: "marketplace:read",  label: "Marketplace read",   desc: "Browse open borrower requests" },
  { key: "bids:read",         label: "Bids read",          desc: "View submitted bids" },
  { key: "bids:write",        label: "Bids write",         desc: "Submit bids from LOS" },
  { key: "pipeline:read",     label: "Pipeline read",      desc: "View loan pipeline status" },
  { key: "pipeline:write",    label: "Pipeline write",     desc: "Advance pipeline stages from LOS" },
  { key: "analytics:read",    label: "Analytics read",     desc: "Pull performance metrics" },
  { key: "documents:write",   label: "Documents write",    desc: "Upload pipeline documents" },
] as const;

const RECOMMENDED_SCOPES = ["marketplace:read", "bids:write", "pipeline:write"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusConfig(key: ApiKey) {
  if (key.revoked_at)               return { label: "Revoked",          cls: "text-red-500",     Icon: XCircle       };
  if (key.mc_status === "rejected") return { label: "Rejected",         cls: "text-red-500",     Icon: XCircle       };
  if (key.mc_status === "pending_approval") return { label: "Pending approval", cls: "text-amber-500", Icon: Clock  };
  if (key.active)                   return { label: "Active",           cls: "text-emerald-600", Icon: CheckCircle2  };
  return                                   { label: "Inactive",         cls: "text-ink/40",      Icon: XCircle       };
}

// ─── CreatedKeyBanner ────────────────────────────────────────────────────────

function CreatedKeyBanner({ rawKey, onDismiss }: { rawKey: string; onDismiss: () => void }) {
  const [show,   setShow]   = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-700 shrink-0" aria-hidden />
        <span className="text-[13px] font-bold text-amber-800">
          Copy this key now — it will never be shown again
        </span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2.5 text-[11px] font-mono text-ink break-all">
          {show ? rawKey : "fic_live_" + "•".repeat(56)}
        </code>
        <button
          onClick={() => setShow(s => !s)}
          className="text-amber-600 hover:text-amber-800 shrink-0"
          aria-label={show ? "Hide key" : "Reveal key"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 hover:text-amber-900 shrink-0"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-amber-700">
          Awaiting maker-checker approval before the key becomes active.
        </p>
        <button onClick={onDismiss} className="text-[11px] text-amber-600 hover:text-amber-800 underline">
          I've copied it
        </button>
      </div>
    </div>
  );
}

// ─── KeyCard ─────────────────────────────────────────────────────────────────

function KeyCard({
  apiKey, isAdmin, onApprove, onRevoke, onDelete, approving, revoking, deleting,
}: {
  apiKey: ApiKey; isAdmin: boolean
  onApprove: () => void; onRevoke: () => void; onDelete: () => void
  approving: boolean; revoking: boolean; deleting: boolean
}) {
  const { label, cls, Icon } = statusConfig(apiKey);
  const canApprove = apiKey.mc_status === "pending_approval" && !apiKey.revoked_at;
  const canRevoke  = apiKey.active && !apiKey.revoked_at;
  const canDelete  = apiKey.mc_status === "pending_approval" || !!apiKey.revoked_at;

  return (
    <div className={`bg-white rounded-xl border border-ink/[0.07] p-5 ${!apiKey.active ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <Key className="w-4 h-4 text-ficium mt-0.5 shrink-0" aria-hidden />
          <div>
            <div className="font-display font-bold text-[14px] text-ink">{apiKey.label}</div>
            <code className="text-[11px] font-mono text-muted mt-0.5 block">{apiKey.key_prefix}••••••••</code>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${cls}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden />
          {label}
        </div>
      </div>

      {/* Scopes */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {apiKey.scopes.map(s => (
          <span key={s} className="bg-ficium/8 text-ficium text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-ficium/15">
            {s}
          </span>
        ))}
        {apiKey.scopes.length === 0 && (
          <span className="text-[11px] text-muted italic">No scopes assigned</span>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center flex-wrap gap-4 text-[11px] text-muted border-t border-ink/6 pt-3 mb-3">
        {apiKey.requested_by_username && (
          <span>Created by <strong className="text-ink">{apiKey.requested_by_username}</strong></span>
        )}
        {apiKey.approved_by_username && (
          <span>Approved by <strong className="text-ink">{apiKey.approved_by_username}</strong></span>
        )}
        {apiKey.last_used_at && (
          <span>Last used <strong className="text-ink">{new Date(apiKey.last_used_at).toLocaleDateString()}</strong></span>
        )}
        {apiKey.expires_at && (
          <span>Expires <strong className="text-ink">{new Date(apiKey.expires_at).toLocaleDateString()}</strong></span>
        )}
        {apiKey.rejection_note && (
          <span className="text-red-500">Rejected: {apiKey.rejection_note}</span>
        )}
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex gap-2">
          {canApprove && (
            <Btn variant="primary" size="sm" onClick={onApprove} loading={approving}>
              Approve
            </Btn>
          )}
          {canRevoke && (
            <Btn variant="ghost" size="sm" onClick={onRevoke} loading={revoking}>
              Revoke
            </Btn>
          )}
          {canDelete && (
            <Btn variant="ghost" size="sm" onClick={onDelete} loading={deleting}>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              Delete
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CreateKeyModal ───────────────────────────────────────────────────────────

function CreateKeyModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (rawKey: string) => void
}) {
  const [label,      setLabel]      = useState("");
  const [scopes,     setScopes]     = useState<string[]>(RECOMMENDED_SCOPES);
  const [expireDays, setExpireDays] = useState<string>("");
  const [error,      setError]      = useState<string | null>(null);
  const create = useCreateApiKey();

  const toggleScope = (s: string) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleSubmit = async () => {
    if (!label.trim() || scopes.length === 0) return;
    setError(null);
    try {
      const key = await create.mutateAsync({
        label: label.trim(),
        scopes,
        ...(expireDays ? { expires_days: parseInt(expireDays, 10) } : {}),
      });
      onCreated(key.raw_key ?? "");
      onClose();
      setLabel(""); setScopes(RECOMMENDED_SCOPES); setExpireDays("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create key.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate API key">
      <div className="space-y-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <FormField label="Key label" hint="A descriptive name for this key's purpose">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. MCB Production LOS Integration"
            className={inputCls}
          />
        </FormField>

        <div>
          <div className="text-[12px] font-semibold text-ink mb-2">Scopes</div>
          <div className="space-y-1.5">
            {ALL_SCOPES.map(s => {
              const selected = scopes.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleScope(s.key)}
                  aria-pressed={selected}
                  className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                    selected
                      ? "border-ficium/30 bg-ficium/4"
                      : "border-ink/10 hover:border-ficium/20"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${
                    selected ? "border-ficium bg-ficium" : "border-ink/20"
                  }`}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-[11px] font-mono font-semibold text-ficium">{s.key}</code>
                    <div className="text-[11px] text-muted">{s.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <FormField label="Expiry (days)" hint="Leave empty for no expiry">
          <input
            type="number"
            value={expireDays}
            onChange={e => setExpireDays(e.target.value)}
            placeholder="e.g. 365"
            min={1}
            max={3650}
            className={inputCls}
          />
        </FormField>

        <div className="bg-ficium/4 border border-ficium/15 rounded-xl p-3.5 flex gap-2.5">
          <Shield className="w-4 h-4 text-ficium shrink-0 mt-0.5" aria-hidden />
          <p className="text-[12px] text-ink/70">
            Key generation requires maker-checker approval — a second admin must approve
            before the key becomes active. The raw key is shown once on creation.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={!label.trim() || scopes.length === 0}
            loading={create.isPending}
          >
            Generate key
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── ApiKeysTab ───────────────────────────────────────────────────────────────

export function ApiKeysTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: keys = [], isLoading, error } = useApiKeys();
  const approve = useApproveApiKey();
  const revoke  = useRevokeApiKey();
  const del     = useDeleteApiKey();

  const [showCreate, setShowCreate] = useState(false);
  const [newRawKey,  setNewRawKey]  = useState<string | null>(null);
  const [actionErr,  setActionErr]  = useState<string | null>(null);

  const active  = keys.filter(k => k.active && !k.revoked_at);
  const pending = keys.filter(k => k.mc_status === "pending_approval" && !k.revoked_at);
  const others  = keys.filter(k => k.revoked_at || k.mc_status === "rejected");

  const doApprove = async (id: string) => {
    setActionErr(null);
    try { await approve.mutateAsync(id); }
    catch (e: unknown) { setActionErr(e instanceof Error ? e.message : "Approve failed."); }
  };

  const doRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    setActionErr(null);
    try { await revoke.mutateAsync(id); }
    catch (e: unknown) { setActionErr(e instanceof Error ? e.message : "Revoke failed."); }
  };

  const doDelete = async (id: string) => {
    setActionErr(null);
    try { await del.mutateAsync(id); }
    catch (e: unknown) { setActionErr(e instanceof Error ? e.message : "Delete failed."); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-muted">
            {active.length} active · {pending.length} pending approval
          </p>
        </div>
        {isAdmin && (
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            Generate key
          </Btn>
        )}
      </div>

      {newRawKey && (
        <CreatedKeyBanner rawKey={newRawKey} onDismiss={() => setNewRawKey(null)} />
      )}

      {actionErr && (
        <InlineAlert variant="error" onDismiss={() => setActionErr(null)}>
          {actionErr}
        </InlineAlert>
      )}

      {error && (
        <InlineAlert variant="error">Failed to load API keys.</InlineAlert>
      )}

      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[12px] font-semibold text-ink">Pending approval</span>
          </div>
          <div className="space-y-3">
            {pending.map(k => (
              <KeyCard
                key={k.id} apiKey={k} isAdmin={isAdmin}
                onApprove={() => doApprove(k.id)}
                onRevoke={()  => doRevoke(k.id)}
                onDelete={()  => doDelete(k.id)}
                approving={approve.isPending} revoking={revoke.isPending} deleting={del.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-ink/6 rounded-sm" />
                <div className="h-4 w-40 bg-ink/6 rounded-sm" />
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map(j => <div key={j} className="h-5 w-24 bg-ink/5 rounded-full" />)}
              </div>
            </div>
          ))}
        </div>
      ) : active.length === 0 && pending.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No API keys"
          description="Generate a key to integrate your LOS or internal systems with Ficium"
          action={isAdmin ? (
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
              Generate first key
            </Btn>
          ) : undefined}
        />
      ) : (
        active.length > 0 && (
          <div className="space-y-3">
            {active.map(k => (
              <KeyCard
                key={k.id} apiKey={k} isAdmin={isAdmin}
                onApprove={() => doApprove(k.id)}
                onRevoke={()  => doRevoke(k.id)}
                onDelete={()  => doDelete(k.id)}
                approving={approve.isPending} revoking={revoke.isPending} deleting={del.isPending}
              />
            ))}
          </div>
        )
      )}

      {others.length > 0 && (
        <details className="mt-2">
          <summary className="text-[12px] text-muted cursor-pointer select-none">
            {others.length} revoked / rejected key{others.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 space-y-3">
            {others.map(k => (
              <KeyCard
                key={k.id} apiKey={k} isAdmin={isAdmin}
                onApprove={() => doApprove(k.id)}
                onRevoke={()  => doRevoke(k.id)}
                onDelete={()  => doDelete(k.id)}
                approving={approve.isPending} revoking={revoke.isPending} deleting={del.isPending}
              />
            ))}
          </div>
        </details>
      )}

      <CreateKeyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={raw => setNewRawKey(raw)}
      />
    </div>
  );
}
