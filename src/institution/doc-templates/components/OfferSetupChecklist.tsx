/**
 * @component OfferSetupChecklist
 * @description
 *   What an institution needs before it can send its first offer, shown at
 *   the top of Document templates until everything is done. One button
 *   installs a standard credit-approval chain and a starter facility letter;
 *   both still need a second admin before they go live (dual control), which
 *   shows here as "waiting" with a link to where that admin acts.
 *
 * @dataSource useOfferSetup / useInstallOfferDefaults → /institution/offer-setup/*
 */
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Clock, Sparkles } from 'lucide-react'
import { useInstallOfferDefaults, useOfferSetup, type OfferSetupItem } from '../hooks/useDocTemplates'
import { getTokenPayload } from '@/shared/lib/ficiumAuth'
import { PortalApiError } from '@/shared/lib/portalApi'
import { Btn, InlineAlert } from '@/institution/components/primitives'

const ADMIN_ROLES = new Set(['admin', 'institution_admin', 'super_admin'])

const ICON: Record<OfferSetupItem['state'], { Icon: typeof Circle; cls: string; label: string }> = {
  done:    { Icon: CheckCircle2, cls: 'text-emerald-600', label: 'Done' },
  waiting: { Icon: Clock,        cls: 'text-amber-600',   label: 'Waiting for a second admin' },
  todo:    { Icon: Circle,       cls: 'text-muted',       label: 'To do' },
}

export function OfferSetupChecklist() {
  const { data, isLoading, isError } = useOfferSetup()
  const install = useInstallOfferDefaults()
  const role = (getTokenPayload() as { user_role?: string } | null)?.user_role ?? ''
  const isAdmin = ADMIN_ROLES.has(role)

  if (isLoading || isError || !data || data.complete) return null

  return (
    <div className="bg-white border border-line rounded-card shadow-card px-5 py-4 mb-6">
      <p className="text-[14px] font-bold text-ink">Get ready to send offers</p>
      <p className="text-[12px] text-muted mt-0.5 mb-3">
        Four things are needed before your first offer can go out.
      </p>

      <ul className="space-y-2.5">
        {data.items.map(item => {
          const { Icon, cls, label } = ICON[item.state]
          return (
            <li key={item.key} className="flex items-start gap-2.5">
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cls}`} aria-label={label} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink font-semibold">{item.label}</p>
                <p className="text-[12px] text-muted">{item.detail}</p>
              </div>
              {item.action && item.action !== 'install' && item.path && (
                <Link to={item.path} className="text-[12px] font-semibold text-ficium hover:underline shrink-0">
                  {item.action}
                </Link>
              )}
            </li>
          )
        })}
      </ul>

      {install.isError && (
        <div className="mt-3">
          <InlineAlert variant="error">
            {install.error instanceof PortalApiError ? install.error.message : 'Install failed. Please retry.'}
          </InlineAlert>
        </div>
      )}

      {data.can_install && (
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-muted max-w-md">
            Installs a one-step credit approval chain and a starter facility letter. A second
            admin must approve each before use, and the letter's terms need your legal team's wording.
          </p>
          {isAdmin ? (
            <Btn size="sm" icon={Sparkles} loading={install.isPending} onClick={() => install.mutate()}>
              Install standard setup
            </Btn>
          ) : (
            <span className="text-[12px] text-muted">An institution admin can install this.</span>
          )}
        </div>
      )}
    </div>
  )
}
