/**
 * @page InstitutionNotifications
 * @route /notifications
 * @module inst:notifications
 * @description
 *   Institution-side notification centre. Shows bid outcomes, pipeline
 *   events, approval alerts, and compliance warnings.
 *
 *   Kind config drives icon, colour, and action-required flag.
 *   Notifications are sourced from portal_notifications table in Portal DB
 *   via RLS (institution_id = current institution).
 *
 *   Gracefully empty if portal_notifications table doesn't exist yet —
 *   never errors, just shows zero state.
 *
 * @owner Ficium Engineering
 */

import { useNavigate } from 'react-router-dom'
import {
  Bell, BellOff, CheckCheck,
  CheckCircle, XCircle, Clock, Zap,
  TrendingUp, ShieldAlert, AlertTriangle,
} from 'lucide-react'
import {
  usePortalNotifications,
  useMarkPortalNotifRead,
  useMarkAllPortalNotifsRead,
} from '../hooks/usePortalNotifications'
import { portalTimeAgo } from '../api/notificationsApi'
import type { PortalNotificationKind } from '../types/notifications'
import { SectionHeader, Btn, InlineAlert } from '@/institution/components/primitives'

// ─── Kind config ──────────────────────────────────────────────

const KIND_CONFIG: Record<PortalNotificationKind, {
  icon:           React.ElementType
  bg:             string
  fg:             string
  label:          string
  actionRequired: boolean
}> = {
  bid_accepted:        { icon: CheckCircle,   bg: 'bg-emerald-50', fg: 'text-emerald-600', label: 'Bid',      actionRequired: false },
  bid_rejected:        { icon: XCircle,       bg: 'bg-red-50',     fg: 'text-red-500',     label: 'Bid',      actionRequired: false },
  bid_expired:         { icon: Clock,         bg: 'bg-amber-50',   fg: 'text-amber-600',   label: 'Bid',      actionRequired: false },
  request_closed:      { icon: CheckCircle,   bg: 'bg-ink/[0.05]', fg: 'text-muted',       label: 'Request',  actionRequired: false },
  pipeline_advanced:   { icon: TrendingUp,    bg: 'bg-ficium/10',  fg: 'text-ficium',      label: 'Pipeline', actionRequired: false },
  pipeline_approved:   { icon: CheckCircle,   bg: 'bg-emerald-50', fg: 'text-emerald-600', label: 'Pipeline', actionRequired: false },
  approval_needed:     { icon: AlertTriangle, bg: 'bg-amber-50',   fg: 'text-amber-600',   label: 'Approval', actionRequired: true  },
  compliance_expiring: { icon: ShieldAlert,   bg: 'bg-red-50',     fg: 'text-red-500',     label: 'Compliance', actionRequired: true },
  system:              { icon: Zap,           bg: 'bg-ficium/10',  fg: 'text-ficium',      label: 'System',   actionRequired: false },
}

// ─── Notification row ─────────────────────────────────────────

function NotifRow({ notif, onRead }: {
  notif:  import('../types/notifications').PortalNotification
  onRead: (id: string) => void
}) {
  const navigate  = useNavigate()
  const cfg       = KIND_CONFIG[notif.kind] ?? KIND_CONFIG.system
  const Icon      = cfg.icon
  const isUnread  = !notif.read_at

  const handleClick = () => {
    if (isUnread) onRead(notif.id)
    if (notif.link) navigate(notif.link)
  }

  return (
    <div
      onClick={handleClick}
      className={[
        'flex items-start gap-4 px-5 py-4 rounded-2xl border transition-all cursor-pointer',
        isUnread
          ? 'bg-white border-ficium/15 shadow-sm hover:shadow-md hover:border-ficium/25'
          : 'bg-white/60 border-ink/[0.06] hover:bg-white',
      ].join(' ')}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${cfg.bg}`}>
        <Icon size={18} className={cfg.fg} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{cfg.label}</span>
              {cfg.actionRequired && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">ACTION</span>
              )}
              {isUnread && (
                <span className="w-1.5 h-1.5 rounded-full bg-ficium flex-shrink-0" />
              )}
            </div>
            <div className={`text-[14px] font-semibold leading-snug ${isUnread ? 'text-ink' : 'text-ink/70'}`}>
              {notif.title}
            </div>
            {notif.body && (
              <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{notif.body}</p>
            )}
          </div>
          <span className="text-[11px] text-muted whitespace-nowrap flex-shrink-0">{portalTimeAgo(notif.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function InstitutionNotifications() {
  const { data: notifications = [], isLoading, error } = usePortalNotifications()
  const { mutate: markOne }  = useMarkPortalNotifRead()
  const { mutate: markAll, isPending: markingAll } = useMarkAllPortalNotifsRead()

  const unreadCount    = notifications.filter(n => !n.read_at).length
  const actionRequired = notifications.filter(n => KIND_CONFIG[n.kind]?.actionRequired && !n.read_at)
  const todayItems     = notifications.filter(n => isToday(n.created_at))
  const earlierItems   = notifications.filter(n => !isToday(n.created_at))

  return (
    <main className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <SectionHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        actions={
          unreadCount > 0 ? (
            <Btn
              variant="secondary"
              size="sm"
              icon={CheckCheck}
              onClick={() => markAll()}
              disabled={markingAll}
            >
              Mark all read
            </Btn>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-5">
          <InlineAlert variant="info">
            Notification history unavailable. This feature becomes active once portal_notifications is set up.
          </InlineAlert>
        </div>
      )}

      {/* Action required banner */}
      {actionRequired.length > 0 && (
        <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-amber-800">
            {actionRequired.length} notification{actionRequired.length > 1 ? 's' : ''} require your action.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-ink/[0.04] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-[22px] bg-ink/[0.04] grid place-items-center mx-auto mb-4">
            <BellOff size={28} className="text-muted" />
          </div>
          <div className="font-display text-[20px] font-bold text-ink mb-2">No notifications yet</div>
          <p className="text-[13px] text-muted max-w-[280px] mx-auto">
            Bid outcomes, pipeline updates, and approval alerts will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {todayItems.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Today</div>
              <div className="space-y-2">
                {todayItems.map(n => (
                  <NotifRow key={n.id} notif={n} onRead={id => markOne(id)} />
                ))}
              </div>
            </div>
          )}
          {earlierItems.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Earlier</div>
              <div className="space-y-2">
                {earlierItems.map(n => (
                  <NotifRow key={n.id} notif={n} onRead={id => markOne(id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getDate() === now.getDate()
    && d.getMonth() === now.getMonth()
    && d.getFullYear() === now.getFullYear()
}
