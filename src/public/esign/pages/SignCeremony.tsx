/**
 * @page SignCeremony
 * @route /sign/:token
 * @access public — single-use signing token from the signer's email
 * @description
 *   The borrower-facing signing ceremony. Strictly sequential, matching
 *   what the backend enforces: review the document, verify identity
 *   with an emailed one-time code, then sign (or decline with a
 *   reason). Terminal states — signed, declined, expired, invalid
 *   link — each get a clear full-card state. Every action here lands
 *   in the envelope's hash-chained audit trail.
 *
 * @dataSource signerApi → ficium-portal-api /esign/public/:token/*
 * @owner Ficium Engineering
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  FileText, ShieldCheck, PenLine, CheckCircle2, XCircle, Clock, AlertTriangle,
} from 'lucide-react'
import FiciumLogo from '@/shared/ui/FiciumLogo'
import { signerApi, SignerApiError, type CeremonyState } from '../api/signerApi'

const inputCls =
  'w-full bg-white border border-ink/12 rounded-xl px-4 py-3 text-[15px] text-ink outline-hidden ' +
  'focus:border-ficium focus:ring-2 focus:ring-ficium/20 transition-all font-body placeholder:text-muted/60'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper font-body flex flex-col items-center px-4 py-10">
      <FiciumLogo size={28} withWordmark />
      <main className="w-full max-w-md mt-8">{children}</main>
      <footer className="mt-8 max-w-md text-center">
        <p className="text-[11px] text-muted leading-relaxed">
          Every action on this page is recorded in a cryptographically
          chained audit trail. On completion the document is sealed with a
          certificate page and its SHA-256 fingerprint.
        </p>
      </footer>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-card shadow-card p-6">
      {children}
    </div>
  )
}

function TerminalState({
  icon: Icon, tone, title, body,
}: {
  icon: React.ElementType
  tone: 'good' | 'bad' | 'muted'
  title: string
  body: string
}) {
  const toneCls = { good: 'text-good', bad: 'text-bad', muted: 'text-muted' }[tone]
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-4">
        <Icon className={`w-10 h-10 ${toneCls}`} aria-hidden />
        <h1 className="font-display text-[20px] font-bold text-ink mt-3 tracking-display">{title}</h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">{body}</p>
      </div>
    </Card>
  )
}

function StepMarker({ n, state }: { n: number; state: 'done' | 'active' | 'todo' }) {
  if (state === 'done') {
    return <CheckCircle2 className="w-5 h-5 text-good shrink-0" aria-hidden />
  }
  return (
    <span
      aria-hidden
      className={`w-5 h-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${
        state === 'active' ? 'bg-ficium text-white' : 'bg-ink/6 text-muted'
      }`}
    >
      {n}
    </span>
  )
}

export default function SignCeremony() {
  const { token = '' } = useParams<{ token: string }>()

  const [state, setState] = useState<CeremonyState | null>(null)
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null)

  const [reviewed, setReviewed] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [consent, setConsent] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'signed' | 'declined' | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await signerApi.state(token)
      setState(s)
      setLoadError(null)
    } catch (e) {
      if (e instanceof SignerApiError) setLoadError({ status: e.status, message: e.message })
      else setLoadError({ status: 0, message: 'Could not load this signing request.' })
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof SignerApiError ? e.message : 'Something went wrong. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () => run(async () => {
    await signerApi.requestOtp(token)
    setOtpSent(true)
  })

  const verifyCode = () => run(async () => {
    await signerApi.verifyOtp(token, otp.trim())
    setState(s => (s ? { ...s, otp_verified: true } : s))
  })

  const sign = () => run(async () => {
    await signerApi.sign(token)
    setOutcome('signed')
  })

  const decline = () => run(async () => {
    await signerApi.decline(token, declineReason.trim())
    setOutcome('declined')
  })

  // ── Terminal and error states ─────────────────────────────
  if (outcome === 'signed') {
    return (
      <Shell>
        <TerminalState
          icon={CheckCircle2} tone="good" title="Signed"
          body="Your signature has been recorded. Once all parties have signed, you'll receive the sealed document with its completion certificate by email."
        />
      </Shell>
    )
  }
  if (outcome === 'declined') {
    return (
      <Shell>
        <TerminalState
          icon={XCircle} tone="muted" title="Declined"
          body="You've declined to sign. The institution has been notified along with your reason. No signature was recorded."
        />
      </Shell>
    )
  }
  if (loadError) {
    const expired = loadError.status === 410
    return (
      <Shell>
        <TerminalState
          icon={expired ? Clock : AlertTriangle}
          tone={expired ? 'muted' : 'bad'}
          title={expired ? 'This request is closed' : 'Signing link not recognised'}
          body={expired
            ? loadError.message
            : 'This link is invalid or has expired. Check you opened the most recent email, or contact the institution that sent the document.'}
        />
      </Shell>
    )
  }
  if (!state) {
    return (
      <Shell>
        <Card>
          <div className="animate-pulse space-y-3 py-2">
            <div className="h-5 bg-ink/6 rounded-lg w-3/4" />
            <div className="h-3 bg-ink/6 rounded-lg w-1/2" />
            <div className="h-24 bg-ink/4 rounded-xl" />
          </div>
        </Card>
      </Shell>
    )
  }
  if (state.signer_status === 'signed') {
    return (
      <Shell>
        <TerminalState
          icon={CheckCircle2} tone="good" title="Already signed"
          body="You've already signed this document. Nothing more is needed from you."
        />
      </Shell>
    )
  }

  const verified = state.otp_verified
  type StepState = 'done' | 'active' | 'todo'
  const steps: [StepState, StepState, StepState] = [
    reviewed ? 'done' : 'active',
    verified ? 'done' : reviewed ? 'active' : 'todo',
    verified && reviewed ? 'active' : 'todo',
  ]

  // ── Ceremony ──────────────────────────────────────────────
  return (
    <Shell>
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Signature requested from {state.display_name}
        </p>
        <h1 className="font-display text-[22px] font-bold text-ink mt-1 tracking-display leading-snug">
          {state.title}
        </h1>
        <p className="text-[12px] text-muted mt-1.5">
          Open until {new Date(state.expires_at).toLocaleString()}
        </p>

        {actionError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            {actionError}
          </div>
        )}

        <ol className="mt-6 space-y-6">
          {/* 1 — review */}
          <li className="flex gap-3">
            <StepMarker n={1} state={steps[0]} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink">Review the document</p>
              <p className="text-[12px] text-muted mt-0.5">
                Read the full document before signing. It opens in a new tab.
              </p>
              <a
                href={state.document_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setReviewed(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white border border-ink/12 px-4 py-2.5 text-[13px] font-bold text-ink hover:border-ficium/40 transition-all"
              >
                <FileText className="w-4 h-4" aria-hidden />
                Open document
              </a>
            </div>
          </li>

          {/* 2 — verify */}
          <li className="flex gap-3">
            <StepMarker n={2} state={steps[1]} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink">Verify it's you</p>
              {verified ? (
                <p className="text-[12px] text-good mt-0.5 inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden /> Identity verified
                </p>
              ) : (
                <>
                  <p className="text-[12px] text-muted mt-0.5">
                    We'll email a 6-digit code to your address on file.
                  </p>
                  {!otpSent ? (
                    <button
                      onClick={sendCode}
                      disabled={busy || !reviewed}
                      className="mt-3 rounded-xl bg-ficium hover:bg-ficium-deep disabled:opacity-50 text-white px-4 py-2.5 text-[13px] font-bold transition-all"
                    >
                      Email me a code
                    </button>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <input
                        className={inputCls}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                        aria-label="Verification code"
                      />
                      <button
                        onClick={verifyCode}
                        disabled={busy || otp.length !== 6}
                        className="rounded-xl bg-ficium hover:bg-ficium-deep disabled:opacity-50 text-white px-4 py-2.5 text-[13px] font-bold transition-all whitespace-nowrap"
                      >
                        Verify
                      </button>
                    </div>
                  )}
                  {otpSent && (
                    <button
                      onClick={sendCode}
                      disabled={busy}
                      className="mt-2 text-[11px] text-muted underline underline-offset-2 hover:text-ink"
                    >
                      Send a new code
                    </button>
                  )}
                </>
              )}
            </div>
          </li>

          {/* 3 — sign */}
          <li className="flex gap-3">
            <StepMarker n={3} state={steps[2]} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink">Sign</p>
              <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  disabled={!verified}
                  className="mt-0.5 w-4 h-4 accent-ficium"
                />
                <span className="text-[12px] text-muted leading-relaxed">
                  I have read the document and agree to sign it electronically.
                  I understand my electronic signature is legally binding.
                </span>
              </label>
              <button
                onClick={sign}
                disabled={busy || !verified || !consent}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ficium hover:bg-ficium-deep disabled:opacity-50 text-white px-4 py-3 text-[14px] font-bold transition-all"
              >
                <PenLine className="w-4 h-4" aria-hidden />
                Sign as {state.display_name}
              </button>
            </div>
          </li>
        </ol>
      </Card>

      {/* Decline path */}
      <div className="mt-4">
        {!declining ? (
          <button
            onClick={() => setDeclining(true)}
            className="w-full text-center text-[12px] text-muted underline underline-offset-2 hover:text-ink py-2"
          >
            I don't want to sign this document
          </button>
        ) : (
          <Card>
            <p className="text-[13px] font-bold text-ink">Decline to sign</p>
            <p className="text-[12px] text-muted mt-1">
              Tell the institution why, so they can follow up or correct the document.
            </p>
            <textarea
              className={`${inputCls} mt-3 min-h-20`}
              placeholder="Reason for declining"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <div className="mt-3 flex gap-2 justify-end">
              <button
                onClick={() => setDeclining(false)}
                className="rounded-xl px-4 py-2.5 text-[13px] font-bold text-muted hover:text-ink transition-all"
              >
                Back
              </button>
              <button
                onClick={decline}
                disabled={busy || declineReason.trim().length < 3}
                className="rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2.5 text-[13px] font-bold transition-all"
              >
                Decline
              </button>
            </div>
          </Card>
        )}
      </div>
    </Shell>
  )
}
