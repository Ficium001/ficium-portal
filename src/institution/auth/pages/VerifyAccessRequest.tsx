import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle } from "lucide-react";
import { confirmAccessRequest } from "@/shared/lib/accessRequests";
import { RegisterShell } from "@/shared/components/RegisterShell";

type State = { kind: "working" } | { kind: "done"; reference: string; name: string } | { kind: "failed"; error: string };

export default function VerifyAccessRequest() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ kind: "working" });
  const sent = useRef(false);   // the link works once: never post it twice (StrictMode re-runs effects)

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const token = params.get("token") ?? "";
    // Take the token out of the address bar and browser history.
    window.history.replaceState(null, "", window.location.pathname);
    if (token.length < 20) { setState({ kind: "failed", error: "This link is incomplete. Open it from the email again." }); return; }
    confirmAccessRequest(token).then((r) =>
      setState(r.ok ? { kind: "done", reference: r.reference, name: r.institution_name } : { kind: "failed", error: r.error }));
  }, [params]);

  return (
    <RegisterShell back={{ label: "Back to sign in", to: "/login" }}>
      <div className="text-center" aria-live="polite">
        {state.kind === "working" && <p className="text-muted text-[15px]">Confirming your application…</p>}
        {state.kind === "done" && <>
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="font-display text-3xl font-bold text-ink">Application received</h1>
          <p className="text-muted text-[15px] mt-3 leading-relaxed">
            Thank you. The application for <strong className="text-ink">{state.name}</strong> is with our team.
            Your reference is <strong className="text-ink font-mono">{state.reference}</strong>. We will contact
            you by email.
          </p>
        </>}
        {state.kind === "failed" && <>
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="font-display text-3xl font-bold text-ink">Link not valid</h1>
          <p className="text-muted text-[15px] mt-3">{state.error}</p>
          <Link to="/request-access" className="inline-block mt-6 text-ficium font-semibold hover:underline">Apply again</Link>
        </>}
      </div>
    </RegisterShell>
  );
}
