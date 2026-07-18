/**
 * @component PortalShell
 * @description
 *   Unified portal shell — 2026 revamp.
 *   No persistent sidebar: all navigation lives in a left slide-in
 *   glass drawer opened by the burger in the top bar. Nav items are
 *   driven entirely by group.module_permissions.
 *
 *   Visual direction: calm light canvas, frosted surfaces, the
 *   blue→violet brand gradient reserved for moments that matter.
 *
 *   Features (unchanged from previous shell):
 *     - Session guard (4 min warn, 5 min logout)
 *     - Connection monitor
 *     - Vim-style keyboard nav (G+key)
 *     - Status bar
 *     - Permission-filtered modules from MODULE_CATALOGUE
 *
 *   New:
 *     - Burger → drawer with staggered item reveal (Esc / scrim closes)
 *     - FiciumLogo (gradient dual-blade mark)
 *     - Frosted sticky top bar
 *
 * @owner Ficium Engineering
 */

import {
  useEffect, useRef, useState, useCallback,
} from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Store, FileText, Clock,
  Package, ScrollText, Settings,
  LogOut, Bell, Wifi, WifiOff, AlertTriangle, Shield,
  Menu, X, Users, GitMerge, Radio, MonitorDot, Building2,
  BarChart2, Gift, FolderCheck, GitBranch, PenLine, FileType2,
} from 'lucide-react'
import { signOut as ficiumSignOut, getTokenPayload, hasSession } from '@/shared/lib/ficiumAuth'
import { useMyGroup } from '@/admin/hooks/useAdmin'
import { MODULE_CATALOGUE, allowedModules, filterByEntitlement, type PortalModule } from '@/shared/lib/modules'
import { useMyInstitution } from '@/institution/hooks/useInstitution'
import FiciumLogo from '@/shared/ui/FiciumLogo'
import { usePortalUnreadCount } from '@/institution/notifications/hooks/usePortalNotifications'

// ─── Constants ───────────────────────────────────────────────
const IDLE_WARN_MS   = 4 * 60 * 1000
const IDLE_LOGOUT_MS = 5 * 60 * 1000

// ─── Icon resolver ───────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Store, FileText, Clock, Package,
  ScrollText, Settings, Shield, Users,
  GitMerge, Radio, MonitorDot, Building2,
  BarChart2, Bell, Gift, FolderCheck, GitBranch, PenLine, FileType2,
}
function resolveIcon(key: string): React.ElementType {
  return ICON_MAP[key] ?? LayoutDashboard
}

// ─── Hooks (unchanged) ───────────────────────────────────────
function useSessionGuard(onSignOut: () => void) {
  const [idleWarning, setIdleWarning] = useState(false)
  const lastActivity = useRef(Date.now())
  const reset = useCallback(() => { lastActivity.current = Date.now(); setIdleWarning(false) }, [])
  useEffect(() => {
    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle >= IDLE_LOGOUT_MS) onSignOut()
      else if (idle >= IDLE_WARN_MS) setIdleWarning(true)
      else setIdleWarning(false)
    }, 10_000)
    return () => { events.forEach(e => window.removeEventListener(e, reset)); clearInterval(tick) }
  }, [onSignOut, reset])
  return { idleWarning, reset }
}

type ConnStatus = 'connected' | 'reconnecting' | 'offline'
function useConnStatus(): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>('connected')
  useEffect(() => {
    let stale = false
    const check = async () => {
      if (!navigator.onLine) { if (!stale) setStatus('offline'); return }
      // Liveness: a valid ficium-auth token in session == connected.
      // Network reachability is covered by navigator.onLine above.
      try {
        if (!stale) setStatus(hasSession() ? 'connected' : 'reconnecting')
      } catch { if (!stale) setStatus('offline') }
    }
    check()
    const id = setInterval(check, 30_000)
    const onOnline  = () => { if (!stale) setStatus('reconnecting'); check() }
    const onOffline = () => { if (!stale) setStatus('offline') }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      stale = true
      clearInterval(id)
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  return status
}

// ─── Idle warning ─────────────────────────────────────────────
function IdleWarningBanner({ onDismiss, onSignOut }: { onDismiss: () => void; onSignOut: () => void }) {
  return (
    <div className='fixed inset-0 bg-ink/30 backdrop-blur-xs flex items-center justify-center z-100 p-4'
      role='alertdialog' aria-labelledby='idle-title'>
      <div className='bg-white rounded-2xl border border-amber-200 shadow-2xl p-7 max-w-sm w-full text-center'>
        <div className='w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4'>
          <Clock className='w-6 h-6 text-amber-600' aria-hidden />
        </div>
        <h2 id='idle-title' className='font-display font-bold text-[18px] text-ink mb-2'>Session expiring</h2>
        <p className='text-[13px] text-muted mb-5'>
          You've been inactive for 4 minutes. You'll be signed out in 1 minute.
        </p>
        <div className='flex gap-3'>
          <button onClick={onDismiss} autoFocus
            className='flex-1 bg-ficium hover:bg-ficium-deep text-white font-bold py-2.5 rounded-xl transition-colors text-[13px]'>
            Continue session
          </button>
          <button onClick={onSignOut}
            className='flex-1 border border-ink/12 text-muted font-semibold py-2.5 rounded-xl hover:bg-ink/3 transition-colors text-[13px]'>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Drawer nav ───────────────────────────────────────────────
// Section layout. 'Home' deduped by path so wildcard users don't
// see Dashboard twice.
const NAV_SECTIONS = [
  { label: 'Home',        keys: ['inst:dashboard', 'admin:dashboard'] },
  { label: 'Marketplace', keys: ['inst:marketplace', 'inst:bids', 'inst:bid_approval', 'inst:approvals'] },
  { label: 'Insights',    keys: ['inst:analytics', 'inst:notifications'] },
  { label: 'Manage',      keys: ['inst:dual_control', 'inst:team', 'inst:products', 'inst:settings', 'inst:benefits'] },
  { label: 'Operations',  keys: ['inst:pipeline', 'inst:audit', 'inst:documents', 'inst:esign', 'inst:doctemplates'] },
  { label: 'Admin',       keys: ['admin:users', 'admin:groups', 'admin:institutions', 'admin:dual_control'] },
  { label: 'System',      keys: ['admin:sessions', 'admin:audit', 'admin:system'] },
]

function Drawer({
  open, onClose, visibleModules, pendingCount, groupLoading, groupError, onRetry,
  userName, groupLabel, orgName,
}: {
  open:           boolean
  onClose:        () => void
  visibleModules: PortalModule[]
  pendingCount:   number
  groupLoading:   boolean
  groupError:     boolean
  onRetry:        () => void
  userName:       string
  groupLabel:     string
  orgName:        string
}) {
  // Esc to close
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Lock page scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const visibleKeys = new Set(visibleModules.map(m => m.key))
  const byKey       = Object.fromEntries(visibleModules.map(m => [m.key, m]))

  const sections = NAV_SECTIONS
    .map(s => {
      const mods: PortalModule[] = []
      const seenPaths = new Set<string>()
      for (const k of s.keys) {
        if (!visibleKeys.has(k)) continue
        const mod = byKey[k]
        if (!mod) continue
        if (seenPaths.has(mod.path)) continue
        seenPaths.add(mod.path)
        mods.push(mod)
      }
      return { ...s, modules: mods }
    })
    .filter(s => s.modules.length > 0)

  // Catch-all: any visible module not covered by a named section above
  // (e.g. a new module added to the catalogue before NAV_SECTIONS is
  // updated) still renders here instead of silently vanishing from nav.
  const namedKeys = new Set(NAV_SECTIONS.flatMap(s => s.keys))
  const seenPaths = new Set(sections.flatMap(s => s.modules.map(m => m.path)))
  const other = visibleModules.filter(m => !namedKeys.has(m.key) && !seenPaths.has(m.path))
  if (other.length > 0) sections.push({ label: 'Other', keys: [], modules: other })

  const empty = sections.length === 0

  // running index across sections drives the stagger
  let itemIndex = 0

  return (
    <>
      {/* Scrim */}
      <div
        className={[
          'fixed inset-0 z-70 bg-ink/35 backdrop-blur-[3px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <nav
        className={[
          'fixed top-0 left-0 bottom-0 z-80 w-[min(320px,86vw)]',
          'bg-white/92 backdrop-blur-2xl border-r border-line',
          'flex flex-col px-4 pt-5 pb-6 overflow-y-auto',
          'transition-transform duration-450 ease-swift',
          open ? 'translate-x-0' : 'translate-x-[-104%]',
        ].join(' ')}
        aria-label='Main navigation'
        inert={!open}
      >
        {/* Head */}
        <div className='flex items-center gap-2.5 px-2.5 pb-5'>
          <FiciumLogo heightPx={26} />
          <div>
            <div className='font-display font-bold tracking-display text-[19px] text-ink leading-none'>Ficium</div>
            <div className='text-[11px] font-medium text-muted mt-1 leading-none truncate max-w-[200px]'>{orgName}</div>
          </div>
          <button
            onClick={onClose}
            className='ml-auto w-9 h-9 rounded-xl grid place-items-center text-muted hover:bg-ink/4 hover:text-ink transition-colors'
            aria-label='Close menu'
          >
            <X className='w-5 h-5' aria-hidden />
          </button>
        </div>

        {/* Loading / error / empty */}
        {empty ? (
          <div className='flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center'>
            {groupLoading ? (
              <>
                <div className='w-7 h-7 rounded-full border-2 border-ficium border-t-transparent animate-spin' aria-hidden />
                <p className='text-[13px] text-muted'>Loading your modules…</p>
              </>
            ) : (
              <>
                <AlertTriangle className='w-7 h-7 text-amber-500' aria-hidden />
                <p className='text-[13px] font-semibold text-ink'>
                  {groupError ? "Couldn't load your module permissions" : 'No modules assigned to your account'}
                </p>
                <p className='text-[12px] text-muted'>
                  {groupError
                    ? 'The permissions service did not respond. Check your connection and try again.'
                    : 'Ask your administrator to assign you to a group with module access.'}
                </p>
                {groupError && (
                  <button onClick={onRetry}
                    className='mt-1 bg-ficium hover:bg-ficium-deep text-white text-[12px] font-bold px-4 py-2 rounded-xl transition-colors'>
                    Retry
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className='flex-1'>
            {sections.map(section => (
              <div key={section.label} className='mb-4'>
                <p className='text-[11px] font-semibold text-muted uppercase tracking-[0.09em] px-3 pb-2'>
                  {section.label}
                </p>
                {section.modules.map(mod => {
                  const Icon  = resolveIcon(mod.iconKey)
                  const badge = (mod.key === 'inst:bid_approval' || mod.key === 'inst:dual_control' || mod.key === 'admin:dual_control')
                    ? pendingCount : 0
                  const delay = 40 + itemIndex++ * 30
                  return (
                    <NavLink
                      key={mod.key}
                      to={mod.path}
                      onClick={onClose}
                      style={{
                        transitionDelay: open ? `${delay}ms, ${delay}ms, 0ms` : '0ms',
                        opacity: open ? 1 : 0,
                        transform: open ? 'translateX(0)' : 'translateX(-14px)',
                        transitionProperty: 'opacity, transform, background-color',
                        transitionDuration: '400ms, 450ms, 200ms',
                        transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
                      }}
                      className={({ isActive }) => [
                        'flex items-center gap-3 px-3 py-[11px] rounded-[14px] text-[14.5px]',
                        'motion-reduce:transition-none! motion-reduce:opacity-100! motion-reduce:transform-none!',
                        isActive
                          ? 'font-semibold text-ficium bg-[linear-gradient(90deg,rgba(30,108,245,.10),rgba(124,58,237,.10))]'
                          : 'font-medium text-ink hover:bg-[#F1F1F8]',
                      ].join(' ')}
                    >
                      <Icon className='w-5 h-5 shrink-0 opacity-75' aria-hidden />
                      <span className='flex-1 truncate'>{mod.label}</span>
                      {badge > 0 && (
                        <span
                          className='text-[11px] font-bold text-white rounded-pill px-2 py-0.5 shrink-0'
                          style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)' }}
                        >
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* Foot */}
        <div className='mt-auto pt-4 border-t border-line flex items-center gap-3 px-2'>
          <div
            className='w-9 h-9 rounded-full grid place-items-center shrink-0'
            style={{ background: 'linear-gradient(135deg,#1E6CF5,#7C3AED)' }}
            aria-hidden
          >
            <span className='text-[12.5px] font-bold text-white'>{(userName || 'U').charAt(0).toUpperCase()}</span>
          </div>
          <div className='min-w-0'>
            <div className='text-[13.5px] font-semibold text-ink truncate'>{userName || 'User'}</div>
            <div className='text-[11.5px] font-medium text-muted truncate'>{groupLabel}</div>
          </div>
        </div>
      </nav>
    </>
  )
}

// ─── Top bar ─────────────────────────────────────────────────
function TopBar({
  onMenuToggle, drawerOpen, subtitle, userName, pendingCount, connStatus, onSignOut,
}: {
  onMenuToggle:  () => void
  drawerOpen:    boolean
  subtitle:      string
  userName:      string
  pendingCount:  number
  connStatus:    ConnStatus
  onSignOut:     () => void
}) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!main) return
    const h = () => setScrolled(main.scrollTop > 8)
    main.addEventListener('scroll', h, { passive: true })
    return () => main.removeEventListener('scroll', h)
  }, [])

  const dotColor = connStatus === 'connected'    ? 'bg-emerald-500'
                 : connStatus === 'reconnecting' ? 'bg-amber-500'
                 :                                 'bg-red-500'

  return (
    <header
      className={[
        'flex items-center gap-3 px-4 lg:px-6 py-3 shrink-0',
        'bg-paper/82 backdrop-blur-xl border-b transition-colors duration-300',
        scrolled ? 'border-line' : 'border-transparent',
      ].join(' ')}
    >
      {/* Burger */}
      <button
        onClick={onMenuToggle}
        className='relative w-11 h-11 rounded-xl grid place-items-center hover:bg-[#EEEEF6] transition-colors
                   focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ficium focus-visible:outline-offset-2'
        aria-label='Toggle navigation menu'
        aria-expanded={drawerOpen}
      >
        {drawerOpen
          ? <X className='w-5 h-5 text-ink' aria-hidden />
          : <Menu className='w-5 h-5 text-ink' aria-hidden />}
      </button>

      {/* Brand */}
      <Link to='/dashboard' className='flex items-center gap-2.5' aria-label='Go to dashboard'>
        <FiciumLogo heightPx={26} />
        <div className='hidden sm:block'>
          <div className='font-display font-bold tracking-display text-[18px] text-ink leading-none'>Ficium</div>
          <div className='text-[9.5px] font-semibold text-muted uppercase tracking-[0.08em] leading-none mt-1'>
            {subtitle}
          </div>
        </div>
      </Link>

      <div className='flex-1' />

      {/* Connection */}
      <div className='hidden sm:flex items-center gap-1.5 text-[11px] text-muted'>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden />
        <span className='capitalize'>{connStatus}</span>
      </div>

      {/* Bell — navigates to notifications page */}
      <Link
        to='/notifications'
        className='relative w-[42px] h-[42px] rounded-xl hover:bg-[#EEEEF6] grid place-items-center transition-colors text-ink'
        aria-label={`Notifications${pendingCount > 0 ? ` — ${pendingCount} unread` : ''}`}
      >
        <Bell className='w-[18px] h-[18px]' aria-hidden />
        {pendingCount > 0 && (
          <span
            className='absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse-ring'
            style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)' }}
            aria-hidden
          />
        )}
      </Link>

      {/* Avatar */}
      <div
        className='w-[38px] h-[38px] rounded-full grid place-items-center shrink-0
                   transition-transform duration-300 ease-swift hover:scale-105'
        style={{ background: 'linear-gradient(135deg,#1E6CF5,#7C3AED)' }}
        aria-hidden
      >
        <span className='text-[13px] font-bold text-white'>{(userName || 'U').charAt(0).toUpperCase()}</span>
      </div>

      {/* Sign out */}
      <button
        onClick={onSignOut}
        className='flex items-center gap-1.5 text-[12.5px] text-muted hover:text-bad transition-colors p-2'
        aria-label='Sign out'
      >
        <LogOut className='w-4 h-4' aria-hidden />
        <span className='hidden lg:block font-medium'>Sign out</span>
      </button>
    </header>
  )
}

// ─── Status bar ───────────────────────────────────────────────
function StatusBar({ groupLabel, connStatus, idleWarning }: {
  groupLabel: string; connStatus: ConnStatus; idleWarning: boolean
}) {
  return (
    <div className='h-6 bg-ink/1.5 border-t border-line flex items-center px-4 gap-4 shrink-0 text-[10px] font-mono text-muted'
      role='status' aria-live='polite'>
      <span className={`flex items-center gap-1 font-semibold ${connStatus === 'connected' ? 'text-good' : connStatus === 'reconnecting' ? 'text-warn' : 'text-bad'}`}>
        {connStatus === 'connected'
          ? <Wifi className='w-3 h-3' aria-hidden />
          : <WifiOff className='w-3 h-3' aria-hidden />
        }
        {connStatus.toUpperCase()}
      </span>
      <span className='text-ink/20'>·</span>
      <span className='flex items-center gap-1'>
        <Shield className='w-3 h-3' aria-hidden />
        {groupLabel.toUpperCase()}
      </span>
      {idleWarning && (
        <>
          <span className='text-ink/20'>·</span>
          <span className='flex items-center gap-1 text-warn font-semibold animate-pulse'>
            <AlertTriangle className='w-3 h-3' aria-hidden />
            SESSION EXPIRING
          </span>
        </>
      )}
      <span className='ml-auto text-muted/40 hidden sm:block'>G+D Dashboard · G+M Marketplace</span>
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────
export default function PortalShell() {
  const navigate = useNavigate()
  const { data: myGroup, isLoading: groupLoading, isError: groupError, refetch: refetchGroup } = useMyGroup()

  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [userName,     setUserName]     = useState('')
  const { data: notifUnread = 0 } = usePortalUnreadCount()
  const pendingCount = notifUnread

  // User display name from the verified ficium-auth JWT payload (no network).
  useEffect(() => {
    const payload = getTokenPayload()
    const email = (payload?.email as string | undefined) ?? ''
    const display = (payload?.display_name as string | undefined)
      ?? (email ? (email.split('@')[0] ?? 'User') : 'User')
    setUserName(display)
  }, [])

  const qc = useQueryClient()

  const handleSignOut = useCallback(async () => {
    await ficiumSignOut()
    qc.clear()
    navigate('/login?signedout=1')
  }, [navigate, qc])

  const { idleWarning, reset: resetIdle } = useSessionGuard(handleSignOut)
  const connStatus = useConnStatus()

  // Institution-level module entitlement (pricing plan) — only relevant
  // for institution users; admin users have no institution_id.
  const { data: myInstitution } = useMyInstitution({ enabled: myGroup?.user_type === 'institution' })

  // Keyboard nav
  const permissions     = myGroup?.module_permissions ?? []
  const rbacModules     = allowedModules(MODULE_CATALOGUE, permissions, myGroup?.user_type)
  const visibleModules  = myGroup?.user_type === 'institution'
    ? filterByEntitlement(rbacModules, myInstitution?.modules ?? [])
    : rbacModules

  useEffect(() => {
    const routes = Object.fromEntries(
      visibleModules.filter(m => m.shortcut).map(m => [m.shortcut!.toLowerCase(), m.path])
    )
    const gRef = { pressed: false, timer: 0 as unknown as ReturnType<typeof setTimeout> }
    const h = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)) return
      if (e.key.toLowerCase() === 'g') {
        gRef.pressed = true; clearTimeout(gRef.timer)
        gRef.timer = setTimeout(() => { gRef.pressed = false }, 800); return
      }
      if (gRef.pressed) {
        gRef.pressed = false; clearTimeout(gRef.timer)
        const r = routes[e.key.toLowerCase()]; if (r) navigate(r)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [navigate, visibleModules])

  const isAdmin  = myGroup?.user_type === 'admin' || permissions.includes('*')
  const subtitle = isAdmin ? 'Internal portal' : 'Bank portal'
  const orgName  = isAdmin ? 'Platform administration' : (userName || 'Institution')

  return (
    <div className='flex flex-col h-screen bg-paper text-ink font-body overflow-hidden'>
      {idleWarning && <IdleWarningBanner onDismiss={resetIdle} onSignOut={handleSignOut} />}

      <TopBar
        onMenuToggle={() => setDrawerOpen(v => !v)}
        drawerOpen={drawerOpen}
        subtitle={subtitle}
        userName={userName}
        pendingCount={pendingCount}
        connStatus={connStatus}
        onSignOut={handleSignOut}
      />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        visibleModules={visibleModules}
        pendingCount={pendingCount}
        groupLoading={groupLoading}
        groupError={groupError}
        onRetry={() => refetchGroup()}
        userName={userName}
        groupLabel={myGroup?.label ?? 'Member'}
        orgName={orgName}
      />

      <main className='flex-1 overflow-auto' id='main-content'>
        <Outlet />
      </main>

      <StatusBar
        groupLabel={myGroup?.label ?? 'Member'}
        connStatus={connStatus}
        idleWarning={idleWarning}
      />
    </div>
  )
}
