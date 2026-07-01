/**
 * WebhooksTab — Settings → Webhooks
 *
 * Manage webhook endpoints for machine-to-machine event delivery.
 * Features: register, update, test ping, view delivery log, reset failures.
 */

import { useState } from "react";
import {
  Webhook, Plus, CheckCircle, XCircle, Clock, AlertTriangle,
  Shield, Play, RotateCcw, ChevronDown, ChevronUp, Trash2,
  Check, Copy,
} from "lucide-react";
import {
  useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook,
  useTestWebhook, useWebhookDeliveries, useResetWebhookFailures,
} from "@/institution/hooks/useInstitution";
import type { InstitutionWebhook, WebhookDelivery } from "@/institution/types/institution";
import { formatDistanceToNow } from "@/institution/lib/utils";
import {
  InlineAlert, EmptyState, Modal,
  FormField, inputCls, Btn, StatusBadge,
} from "@/institution/components/primitives";

// ─── Event types ──────────────────────────────────────────────────────────────

const ALL_EVENTS = [
  { key: "request.new",           label: "New request",           desc: "Borrower posts a new financing request matching your products" },
  { key: "bid.accepted",          label: "Bid accepted",          desc: "Borrower accepted your bid" },
  { key: "bid.rejected",          label: "Bid rejected",          desc: "Bid expired or request closed without acceptance" },
  { key: "pipeline.stage_changed",label: "Pipeline stage changed",desc: "Loan pipeline stage advanced or completed" },
  { key: "identity.revealed",     label: "Identity revealed",     desc: "Borrower Phase 2 identity available after bid acceptance" },
];

// ─── Delivery log ─────────────────────────────────────────────────────────────

function DeliveryRow({ d }: { d: WebhookDelivery }) {
  const ok = d.status === "delivered";
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-ink/[0.05] last:border-0 text-[12px]">
      {ok
        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
        : <XCircle     className="w-3.5 h-3.5 text-red-400   flex-shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[11px] font-mono font-semibold text-ficium">{d.event_type}</code>
          {d.response_status && (
            <span className={`text-[11px] font-mono font-bold ${ok ? "text-emerald-600" : "text-red-500"}`}>
              HTTP {d.response_status}
            </span>
          )}
          <span className="text-muted">{d.attempts} attempt{d.attempts !== 1 ? "s" : ""}</span>
          <span className="text-muted">{formatDistanceToNow(d.created_at)} ago</span>
        </div>
        {d.response_body && !ok && (
          <p className="mt-1 text-[11px] text-red-500 truncate">{d.response_body.slice(0, 120)}</p>
        )}
      </div>
    </div>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const { data, isLoading } = useWebhookDeliveries(webhookId);

  if (isLoading) {
    return (
      <div className="p-4 space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-8 bg-ink/[0.04] rounded-lg" />)}
      </div>
    );
  }
  if (!data || data.deliveries.length === 0) {
    return (
      <div className="p-6 text-center text-[12px] text-muted">
        No deliveries yet. Send a test ping to verify connectivity.
      </div>
    );
  }
  return (
    <div>
      <div className="px-4 py-2.5 bg-ink/[0.02] border-b border-ink/[0.06]">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
          {data.total} total deliveries
        </span>
      </div>
      {data.deliveries.map(d => <DeliveryRow key={d.id} d={d} />)}
    </div>
  );
}

// ─── WebhookCard ──────────────────────────────────────────────────────────────

function WebhookCard({
  webhook, isAdmin,
}: {
  webhook: InstitutionWebhook; isAdmin: boolean
}) {
  const [expanded,  setExpanded]  = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [testMsg,   setTestMsg]   = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const update = useUpdateWebhook();
  const del    = useDeleteWebhook();
  const test   = useTestWebhook();
  const reset  = useResetWebhookFailures();

  const isDisabled = !webhook.active;
  const hasFails   = webhook.failure_count > 0;

  const toggleActive = async () => {
    try { await update.mutateAsync({ id: webhook.id, active: !webhook.active }); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Update failed."); }
  };

  const doTest = async () => {
    setTesting(true); setTestMsg(null); setError(null);
    try {
      await test.mutateAsync(webhook.id);
      setTestMsg("Test ping sent — check delivery log below.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  const doReset = async () => {
    try { await reset.mutateAsync(webhook.id); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Reset failed."); }
  };

  const doDelete = async () => {
    if (!confirm("Delete this webhook? All delivery history will be lost.")) return;
    try { await del.mutateAsync(webhook.id); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Delete failed."); }
  };

  const deliveryIcon = () => {
    if (isDisabled)                              return <XCircle    className="w-4.5 h-4.5 text-ink/30" />;
    if (webhook.last_status === "success")       return <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />;
    if (webhook.last_status === "failed")        return <XCircle    className="w-4.5 h-4.5 text-red-400" />;
    return                                              <Clock      className="w-4.5 h-4.5 text-muted" />;
  };

  return (
    <div className={`bg-white rounded-xl border border-ink/[0.07] overflow-hidden ${isDisabled ? "opacity-70" : ""}`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">{deliveryIcon()}</div>
            <div>
              <div className="font-display font-bold text-[14px] text-ink">{webhook.label}</div>
              <code className="text-[11px] font-mono text-muted mt-0.5 break-all block">{webhook.endpoint_url}</code>
            </div>
          </div>
          <StatusBadge status={webhook.active ? "active" : "inactive"} size="xs" />
        </div>

        {/* Events */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {webhook.event_types.map(evt => (
            <span key={evt} className="bg-ficium/8 text-ficium text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full border border-ficium/15">
              {evt}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center flex-wrap gap-4 text-[11px] text-muted mb-3">
          <span>Retry <strong className="text-ink">{webhook.retry_max}×</strong></span>
          <span>Timeout <strong className="text-ink">{(webhook.timeout_ms / 1000).toFixed(0)}s</strong></span>
          {webhook.last_fired_at && (
            <span>Last fired <strong className="text-ink">{formatDistanceToNow(webhook.last_fired_at)} ago</strong></span>
          )}
          {hasFails && (
            <span className="flex items-center gap-1 text-amber-600 font-semibold">
              <AlertTriangle className="w-3 h-3" />
              {webhook.failure_count} consecutive failure{webhook.failure_count !== 1 ? "s" : ""}
              {webhook.failure_count >= 10 ? " — auto-disabled" : ""}
            </span>
          )}
        </div>

        {error  && <p className="text-[11px] text-red-500 mb-2">{error}</p>}
        {testMsg && <p className="text-[11px] text-emerald-600 mb-2">{testMsg}</p>}

        {/* Actions */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Btn variant="ghost" size="sm" onClick={doTest} loading={testing}>
              <Play className="w-3 h-3" /> Test ping
            </Btn>
            <Btn variant="ghost" size="sm" onClick={toggleActive} loading={update.isPending}>
              {webhook.active ? "Disable" : "Enable"}
            </Btn>
            {hasFails && (
              <Btn variant="ghost" size="sm" onClick={doReset} loading={reset.isPending}>
                <RotateCcw className="w-3 h-3" /> Reset failures
              </Btn>
            )}
            <Btn variant="ghost" size="sm" onClick={doDelete} loading={del.isPending}>
              <Trash2 className="w-3 h-3 text-red-400" />
            </Btn>
          </div>
        )}
      </div>

      {/* Delivery log toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-5 py-3 bg-ink/[0.02] border-t border-ink/[0.06] text-[12px] text-muted hover:text-ink transition-colors"
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Delivery log
      </button>
      {expanded && (
        <div className="border-t border-ink/[0.06]">
          <DeliveryLog webhookId={webhook.id} />
        </div>
      )}
    </div>
  );
}

// ─── CreateWebhookModal ───────────────────────────────────────────────────────

function CreateWebhookModal({
  open, onClose, onCreated,
}: {
  open: boolean; onClose: () => void
  onCreated: (secret: string) => void
}) {
  const [label,      setLabel]      = useState("");
  const [url,        setUrl]        = useState("");
  const [events,     setEvents]     = useState<string[]>(ALL_EVENTS.map(e => e.key));
  const [retryMax,   setRetryMax]   = useState("3");
  const [timeoutMs,  setTimeoutMs]  = useState("30000");
  const [error,      setError]      = useState<string | null>(null);
  const create = useCreateWebhook();

  const toggle = (key: string) =>
    setEvents(prev => prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]);

  const valid = label.trim() && url.startsWith("https://") && events.length > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setError(null);
    try {
      const wh = await create.mutateAsync({
        label: label.trim(), endpoint_url: url, event_types: events,
        retry_max: parseInt(retryMax, 10), timeout_ms: parseInt(timeoutMs, 10),
      });
      onCreated(wh.signing_secret ?? "");
      onClose();
      setLabel(""); setUrl(""); setEvents(ALL_EVENTS.map(e => e.key));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create webhook.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add webhook endpoint">
      <div className="space-y-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <FormField label="Label" hint="Descriptive name — e.g. MCB LOS Production">
          <input value={label} onChange={e => setLabel(e.target.value)}
            placeholder="e.g. MCB LOS Production" className={inputCls} />
        </FormField>

        <FormField label="Endpoint URL" hint="Must be HTTPS. TLS 1.2+ required.">
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://your-system.example.com/ficium/webhook"
            type="url" className={inputCls} />
        </FormField>

        <div>
          <div className="text-[12px] font-semibold text-ink mb-2">Events to subscribe</div>
          <div className="space-y-1.5">
            {ALL_EVENTS.map(evt => {
              const selected = events.includes(evt.key);
              return (
                <button key={evt.key} type="button" onClick={() => toggle(evt.key)}
                  aria-pressed={selected}
                  className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                    selected ? "border-ficium/30 bg-ficium/[0.04]" : "border-ink/[0.10] hover:border-ficium/20"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? "border-ficium bg-ficium" : "border-ink/20"
                  }`}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <code className="text-[11px] font-mono font-semibold text-ficium">{evt.key}</code>
                    <div className="text-[11px] text-muted">{evt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Retry max" hint="0–10">
            <input type="number" value={retryMax} onChange={e => setRetryMax(e.target.value)}
              min={0} max={10} className={inputCls} />
          </FormField>
          <FormField label="Timeout (ms)" hint="1000–120000">
            <input type="number" value={timeoutMs} onChange={e => setTimeoutMs(e.target.value)}
              min={1000} max={120000} step={1000} className={inputCls} />
          </FormField>
        </div>

        <div className="bg-ficium/[0.04] border border-ficium/15 rounded-xl p-3.5 flex gap-2.5">
          <Shield className="w-4 h-4 text-ficium flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-[12px] text-ink/70">
            Ficium signs every payload with{" "}
            <code className="font-mono text-[11px] text-ficium">X-Ficium-Signature-256</code>.
            The signing secret is shown <strong>once</strong> after creation — store it securely.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Btn variant="primary" onClick={handleSubmit} disabled={!valid} loading={create.isPending}>
            Register endpoint
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── SecretBanner ─────────────────────────────────────────────────────────────

function SecretBanner({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-700 flex-shrink-0" />
        <span className="text-[13px] font-bold text-amber-800">
          Copy your signing secret — shown once only
        </span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2.5 text-[11px] font-mono text-ink break-all">
          {secret}
        </code>
        <button onClick={copy} className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-amber-700">
          Use this to verify <code className="font-mono">X-Ficium-Signature-256</code> on incoming events.
        </p>
        <button onClick={onDismiss} className="text-[11px] text-amber-600 underline">I've saved it</button>
      </div>
    </div>
  );
}


// ─── WebhooksTab ──────────────────────────────────────────────────────────────

export function WebhooksTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: webhooks = [], isLoading, error } = useWebhooks();
  const [showCreate, setShowCreate] = useState(false);
  const [newSecret,  setNewSecret]  = useState<string | null>(null);

  const active = webhooks.filter(w => w.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          {active} active endpoint{active !== 1 ? "s" : ""}
        </p>
        {isAdmin && (
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            Add endpoint
          </Btn>
        )}
      </div>

      {newSecret && (
        <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
      )}

      {error && <InlineAlert variant="error">Failed to load webhooks.</InlineAlert>}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-ink/[0.06] rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-36 bg-ink/[0.06] rounded" />
                  <div className="h-3 w-52 bg-ink/[0.04] rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhook endpoints"
          description="Register an HTTPS endpoint to receive real-time Ficium events in your systems"
          action={isAdmin ? (
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
              Add first endpoint
            </Btn>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {webhooks.map(wh => (
            <WebhookCard key={wh.id} webhook={wh} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      <CreateWebhookModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={secret => setNewSecret(secret)}
      />
    </div>
  );
}
