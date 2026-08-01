/**
 * @component RequestChat
 * @description Institution-side chat thread for one marketplace request.
 *
 * Pre-acceptance the marketplace is anonymous, so BOTH sides are limited to
 * a catalogue of structured messages — free text only unlocks for the
 * institution that actually won the bid. That rule is enforced by a trigger
 * in the App DB; this component reads `can_send_free_text` off the thread
 * and shapes the composer to match rather than re-deciding it client-side.
 *
 * There is no Supabase realtime channel here on purpose: the messages live
 * in the App DB, which the portal has no client for. Polling via
 * ficium-portal-api is the only path, and it backs off when the tab is hidden.
 */
import { useEffect, useRef, useState } from "react";
import { Lock, MessageSquare, Send } from "lucide-react";

import { Btn } from "@/institution/components/primitives";
import { PortalApiError } from "@/shared/lib/portalApi";
import TemplateParamFields, {
  paramsComplete,
  type ParamSpec,
  type ParamValues,
} from "@/institution/marketplace/components/TemplateParamFields";
import {
  useMessageTemplates,
  useRequestChat,
  useSendMessage,
  type ChatMessage,
} from "@/institution/marketplace/hooks/useRequestChat";

const MAX_BODY_LEN = 2000;

/** Mirror of the API's substitution so the sender previews the real body. */
function renderTemplate(bodyTemplate: string, params: ParamValues): string {
  let out = bodyTemplate;
  for (const [key, value] of Object.entries(params)) {
    const rendered = Array.isArray(value)
      ? value.map(String).join(", ")
      : String(value ?? "");
    out = out.split("{" + key + "}").join(rendered);
  }
  return out;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-MU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.sender_type === "institution";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
        mine ? "bg-ficium text-white" : "bg-cream border border-ink/[0.07] text-ink"
      }`}>
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
          mine ? "text-white/70" : "text-muted"
        }`}>
          {message.sender_label}
          {message.kind === "structured" && (
            <span className={`ml-1.5 font-medium normal-case tracking-normal ${
              mine ? "text-white/60" : "text-muted/70"
            }`}>· template</span>
          )}
        </div>
        <div className="text-[13px] whitespace-pre-wrap break-words">{message.body}</div>
        <div className={`text-[10px] mt-1 ${mine ? "text-white/60" : "text-muted/70"}`}>
          {fmtTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}

export default function RequestChat({ requestId }: { requestId: string }) {
  const { data: thread, isLoading, error } = useRequestChat(requestId);
  const { data: templates } = useMessageTemplates();
  const sendMessage = useSendMessage(requestId);

  const [templateCode, setTemplateCode] = useState("");
  const [templateParams, setTemplateParams] = useState<ParamValues>({});
  const [freeText, setFreeText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = thread?.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const canFreeText = thread?.can_send_free_text ?? false;
  const isOpen = thread?.is_open ?? false;

  const selectedTemplate = (templates ?? []).find((t) => t.code === templateCode);
  const selectedSchema = selectedTemplate?.params_schema as
    | Record<string, ParamSpec>
    | undefined;

  const submit = () => {
    setSendError(null);
    const input = canFreeText
      ? { kind: "free" as const, body: freeText.trim() }
      : { kind: "structured" as const, template_code: templateCode, params: templateParams };

    sendMessage.mutate(input, {
      onSuccess: () => {
        setFreeText("");
        setTemplateCode("");
        setTemplateParams({});
      },
      onError: (err) => {
        // The App DB trigger surfaces thread-frozen / ineligible-free-text
        // rejections as 409. Show its message rather than a generic failure.
        setSendError(err instanceof PortalApiError ? err.message : "Could not send message.");
      },
    });
  };

  const canSubmit = !sendMessage.isPending && isOpen &&
    (canFreeText
      ? freeText.trim().length > 0
      : templateCode.length > 0 && paramsComplete(selectedSchema, templateParams));

  if (isLoading) {
    return (
      <div className="bg-ink/3 border border-ink/[0.07] rounded-xl p-6 text-center">
        <p className="text-[13px] text-muted">Loading conversation…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-[13px] text-red-700">
          {error instanceof PortalApiError ? error.message : "Could not load conversation."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Thread */}
      <div className="flex flex-col gap-2.5 max-h-[46vh] overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="bg-ink/3 border border-ink/[0.07] rounded-xl p-6 text-center">
            <MessageSquare className="w-5 h-5 text-muted/50 mx-auto mb-2" />
            <p className="text-[13px] text-muted">No messages yet.</p>
            <p className="text-[11px] text-muted/70 mt-1">
              Send a structured question to the borrower — identity stays hidden.
            </p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      {!isOpen ? (
        <div className="flex items-center gap-2 bg-ink/3 border border-ink/[0.07] rounded-xl px-3.5 py-3">
          <Lock className="w-3.5 h-3.5 text-muted shrink-0" />
          <p className="text-[12px] text-muted">
            This conversation is closed — the request is no longer live for your institution.
          </p>
        </div>
      ) : canFreeText ? (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value.slice(0, MAX_BODY_LEN))}
              placeholder="Message the borrower…"
              rows={2}
              className="flex-1 text-[13px] rounded-xl border border-ink/12 px-3.5 py-2.5 resize-none focus:outline-none focus:border-ficium/50"
            />
            <Btn onClick={submit} disabled={!canSubmit} loading={sendMessage.isPending} icon={Send}>
              Send
            </Btn>
          </div>
          <p className="text-[10px] text-muted/70 text-right">
            {freeText.length}/{MAX_BODY_LEN}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={templateCode}
              onChange={(e) => { setTemplateCode(e.target.value); setTemplateParams({}); }}
              className="flex-1 text-[13px] rounded-xl border border-ink/12 px-3.5 py-2.5 bg-white focus:outline-none focus:border-ficium/50"
            >
              <option value="">Select a message…</option>
              {(templates ?? []).map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
            <Btn onClick={submit} disabled={!canSubmit} loading={sendMessage.isPending} icon={Send}>
              Send
            </Btn>
          </div>

          <TemplateParamFields
            schema={selectedSchema}
            values={templateParams}
            onChange={setTemplateParams}
          />

          {selectedTemplate && (
            <div className="bg-white border border-ink/[0.07] rounded-xl px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                Preview
              </div>
              <p className="text-[13px] text-ink">
                {renderTemplate(selectedTemplate.body_template, templateParams)}
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted/70">
            Pre-acceptance messages are template-only to keep the borrower anonymous.
            Free text unlocks once your bid is accepted.
          </p>
        </div>
      )}

      {sendError && <p className="text-[12px] text-red-600">{sendError}</p>}
    </div>
  );
}
