/**
 * EnvelopeCard — one e-signature envelope: title, status, signer progress,
 * audit trail and sealed-PDF actions.
 *
 * Shared by the e-sign list (/esign) and the deal page's Signatures tab so
 * both render an envelope identically.
 */
import { History, FileDown, CheckCircle2, Circle } from 'lucide-react'
import type { EsignEnvelope } from '@/institution/types/approvalEngine'
import { Btn, StatusBadge } from '@/institution/components/primitives'

function SignerDots({ env }: { env: EsignEnvelope }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {env.signers.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          {s.status === 'signed'
            ? <CheckCircle2 className="w-3.5 h-3.5 text-good" aria-hidden />
            : <Circle className="w-3.5 h-3.5 text-line" aria-hidden />}
          {s.display_name}
          <span className="text-[10px] text-muted/70">({s.party})</span>
        </span>
      ))}
    </div>
  )
}

export function EnvelopeCard({
  env,
  onShowTrail,
  onOpenSealed,
  sealedLoading,
}: {
  env: EsignEnvelope
  onShowTrail: (env: EsignEnvelope) => void
  onOpenSealed: (env: EsignEnvelope) => void
  sealedLoading?: boolean
}) {
  return (
    <div className="bg-white border border-line rounded-card shadow-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-ink truncate">{env.title}</p>
          <p className="text-[11px] text-muted mt-0.5">
            {env.entity_type.replace(/_/g, ' ')}
            {', '}
            {env.status === 'completed' && env.completed_at
              ? `completed ${new Date(env.completed_at).toLocaleDateString()}`
              : `expires ${new Date(env.expires_at).toLocaleString()}`}
          </p>
        </div>
        <StatusBadge status={env.status} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <SignerDots env={env} />
        <div className="flex items-center gap-2">
          <Btn size="sm" variant="ghost" icon={History} onClick={() => onShowTrail(env)}>
            Audit trail
          </Btn>
          {env.status === 'completed' && (
            <Btn size="sm" variant="secondary" icon={FileDown}
                 loading={sealedLoading} onClick={() => onOpenSealed(env)}>
              Sealed PDF
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
