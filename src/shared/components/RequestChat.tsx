/**
 * @component RequestChat
 * @description Stub — real-time chat channel between client and institution.
 * Wire to Supabase realtime channel on requests.{id} when implementing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export default function RequestChat({
  requestId,
  senderType: _senderType,
  client: _client,
}: {
  requestId:  string;
  senderType: "institution" | "client";
  client:     SupabaseClient;
}) {
  return (
    <div className="bg-ink/3 border border-ink/[0.07] rounded-xl p-6 text-center">
      <p className="text-[13px] text-muted">
        Chat channel for request <code className="font-mono text-ficium">{requestId.slice(0, 8)}…</code>
      </p>
      <p className="text-[11px] text-muted/70 mt-1">Real-time messaging — coming soon</p>
    </div>
  );
}
