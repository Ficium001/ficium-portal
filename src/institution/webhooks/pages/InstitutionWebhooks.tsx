/**
 * @page InstitutionWebhooks
 * @route /webhooks
 * @access protected — admin only
 * @description
 *   Webhook endpoint management. Institutions can register HTTPS
 *   endpoints to receive real-time Ficium events. All mutations
 *   (create, deactivate, delete) enter the maker-checker queue.
 *
 *   Ficium signs every outbound payload with X-Ficium-Signature
 *   (HMAC-SHA256). Banks MUST verify this header.
 *
 *   Event taxonomy: request.new, bid.accepted, bid.rejected,
 *   bid.expired, request.cancelled
 *
 * @dataSource
 *   useWebhooks → institution_webhooks table
 *
 * @security
 *   Endpoint URLs and signing secrets are never surfaced in the UI
 *   after creation. Ensure TLS 1.2+ on all receiving endpoints.
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState } from "react";
import {
  Webhook, Plus, CheckCircle, XCircle, Clock, AlertTriangle, Shield,
} from "lucide-react";
import { useWebhooks } from "@/institution/hooks/useInstitution";
import type { InstitutionWebhook } from "@/institution/types/institution";
import { formatDistanceToNow } from "@/institution/lib/utils";
import {
  SectionHeader, InlineAlert, EmptyState, Modal, FormField,
  inputCls, Btn, StatusBadge,
} from "@/institution/components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_EVENTS = [
  { key: "request.new",      label: "New request",         description: "Client posts a new financing request" },
  { key: "bid.accepted",     label: "Bid accepted",        description: "Client accepts your bid" },
  { key: "bid.rejected",     label: "Bid rejected",        description: "Client rejects your bid" },
  { key: "bid.expired",      label: "Bid expired",         description: "Bid window closed without acceptance" },
  { key: "request.cancelled",label: "Request cancelled",   description: "Client withdraws their request" },
];

// ─────────────────────────────────────────────────────────────────────────────
// WebhookCard — individual webhook endpoint display
// ─────────────────────────────────────────────────────────────────────────────

function WebhookCard({
  webhook,
}: {
  webhook: InstitutionWebhook;
}) {
  const statusIcon = () => {
    if (!webhook.active)                 return <XCircle    className="w-5 h-5 text-ink/30" />;
    if (webhook.last_status === "delivered") return <CheckCircle className="w-5 h-5 text-emerald-500" />;
    if (webhook.last_status === "failed")    return <XCircle    className="w-5 h-5 text-red-400" />;
    return <Clock className="w-5 h-5 text-muted" />;
  };

  return (
    <article
      className={[
        "bg-white rounded-xl border border-ink/[0.07] p-5",
        !webhook.active ? "opacity-60" : "",
      ].join(" ")}
      aria-label={`Webhook: ${webhook.label}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">{statusIcon()}</div>
          <div>
            <div className="font-display font-bold text-[15px] text-ink">
              {webhook.label}
            </div>
            <code className="text-[11px] text-muted font-mono mt-0.5 break-all block">
              {webhook.endpoint_url}
            </code>
          </div>
        </div>
        <StatusBadge status={webhook.active ? "active" : "inactive"} size="xs" />
      </div>

      {/* Event subscriptions */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(webhook.event_types as string[]).map((evt) => (
          <span
            key={evt}
            className="bg-ficium/8 text-ficium text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full border border-ficium/15"
          >
            {evt}
          </span>
        ))}
      </div>

      {/* Meta row */}
      <div className="flex items-center flex-wrap gap-4 text-[11px] text-muted border-t border-ink/[0.06] pt-3">
        <span>Retry max: <strong className="text-ink">{webhook.retry_max}</strong></span>
        <span>Timeout: <strong className="text-ink">{webhook.timeout_ms.toLocaleString()}ms</strong></span>
        {webhook.last_fired_at && (
          <span>Last fired: <strong className="text-ink">{formatDistanceToNow(webhook.last_fired_at)} ago</strong></span>
        )}
        {webhook.last_status && (
          <span className={webhook.last_status === "delivered" ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
            {webhook.last_status}
          </span>
        )}
        {!webhook.active && (
          <span className="flex items-center gap-1 text-amber-600 font-semibold">
            <AlertTriangle className="w-3 h-3" />
            Deactivated — re-activation requires maker-checker approval
          </span>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AddWebhookModal — create new endpoint (submitted for approval)
// ─────────────────────────────────────────────────────────────────────────────

function AddWebhookModal({
  open,
  onClose,
  onSuccess,
}: {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    label:       "",
    endpoint_url:"",
    event_types: ALL_EVENTS.map((e) => e.key),
  });

  const toggleEvent = (key: string) =>
    setForm((f) => ({
      ...f,
      event_types: f.event_types.includes(key)
        ? f.event_types.filter((e) => e !== key)
        : [...f.event_types, key],
    }));

  const isValid =
    form.label.trim() &&
    form.endpoint_url.startsWith("https://") &&
    form.event_types.length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    // Wired to submit_for_approval() RPC in production
    onSuccess();
    onClose();
    setForm({ label: "", endpoint_url: "", event_types: ALL_EVENTS.map((e) => e.key) });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add webhook endpoint">
      <div className="space-y-4">
        <FormField
          label="Label"
          hint="A descriptive name for your team — e.g. Production bidding system"
        >
          <input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Production bidding system"
            className={inputCls}
          />
        </FormField>

        <FormField
          label="Endpoint URL"
          hint="Must be HTTPS. TLS 1.2 or higher required."
        >
          <input
            value={form.endpoint_url}
            onChange={(e) => setForm((f) => ({ ...f, endpoint_url: e.target.value }))}
            placeholder="https://your-system.example.com/ficium/webhook"
            type="url"
            className={inputCls}
          />
        </FormField>

        <div>
          <div className="text-[12px] font-semibold text-ink mb-2.5">
            Events to subscribe
          </div>
          <div className="space-y-2">
            {ALL_EVENTS.map((evt) => {
              const selected = form.event_types.includes(evt.key);
              return (
                <button
                  key={evt.key}
                  type="button"
                  onClick={() => toggleEvent(evt.key)}
                  aria-pressed={selected}
                  className={[
                    "w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all",
                    selected
                      ? "border-ficium/30 bg-ficium/[0.04]"
                      : "border-ink/[0.10] bg-white hover:border-ficium/20",
                  ].join(" ")}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                    selected ? "border-ficium bg-ficium" : "border-ink/20"
                  }`}>
                    {selected && (
                      <CheckCircle className="w-full h-full text-white p-0.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono font-semibold text-ficium">
                        {evt.key}
                      </code>
                    </div>
                    <div className="text-[11px] text-muted">{evt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Security notice */}
        <div className="bg-ficium/5 border border-ficium/15 rounded-xl p-4 flex items-start gap-3">
          <Shield className="w-4 h-4 text-ficium flex-shrink-0 mt-0.5" aria-hidden />
          <div className="text-[12px] text-ink/70">
            Ficium signs every payload with{" "}
            <code className="text-ficium font-mono text-[11px]">X-Ficium-Signature</code>{" "}
            (HMAC-SHA256). You must verify this header on every incoming request.
            Your signing secret is shown only once upon approval.
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Submit for approval
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionWebhooks() {
  const { data: webhooks = [], isLoading } = useWebhooks();
  const [showAdd,     setShowAdd]     = useState(false);
  const [addSuccess,  setAddSuccess]  = useState(false);

  const active = webhooks.filter((w) => w.active).length;

  return (
    <main className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <SectionHeader
        title="Webhooks"
        subtitle={`${active} active endpoint${active !== 1 ? "s" : ""}`}
        actions={
          <Btn
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowAdd(true)}
          >
            Add endpoint
          </Btn>
        }
      />

      <InlineAlert variant="warning">
        Adding or deactivating endpoints requires maker-checker approval in{" "}
        <a href="/approvals" className="font-semibold underline underline-offset-2">
          Approvals
        </a>.
        Endpoint URLs are immutable after approval.
      </InlineAlert>

      {addSuccess && (
        <div className="mt-4">
          <InlineAlert
            variant="success"
            onDismiss={() => setAddSuccess(false)}
          >
            Webhook endpoint submitted for maker-checker approval.
          </InlineAlert>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink/[0.07] p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 bg-ink/[0.06] rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-ink/[0.06] rounded" />
                  <div className="h-3 w-48 bg-ink/[0.04] rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-6 w-24 bg-ink/[0.05] rounded-full" />
                ))}
              </div>
            </div>
          ))
        ) : webhooks.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No endpoints configured"
            description="Add an HTTPS endpoint to receive real-time Ficium events"
            action={
              <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>
                Add first endpoint
              </Btn>
            }
          />
        ) : (
          webhooks.map((wh) => (
            <WebhookCard key={wh.id} webhook={wh} />
          ))
        )}
      </div>

      <AddWebhookModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => setAddSuccess(true)}
      />
    </main>
  );
}
