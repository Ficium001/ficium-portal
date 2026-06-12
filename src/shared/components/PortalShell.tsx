/**
 * @component PortalShell
 * @description
 *   Unified portal shell. No persistent sidebar — all navigation
 *   lives in a mega-menu opened by the hamburger in the top bar.
 *   Nav items driven entirely by group.module_permissions.
 *
 *   Features:
 *     - Top bar: hamburger + logo + institution/platform name + bell + avatar + sign out
 *     - Mega-menu module launcher (hamburger toggle, Esc to close)
 *     - Session guard (4 min warn, 5 min logout)
 *     - Connection monitor
 *     - Vim-style keyboard nav (G+key)
 *     - Status bar
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
  Webhook, Package, ScrollText, Settings,
  LogOut, Bell, Wifi, WifiOff, AlertTriangle, Shield,
  ChevronDown, Menu, X, Users, GitMerge, Radio, MonitorDot, Building2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMyGroup } from '../../admin/hooks/useAdmin'
import { MODULE_CATALOGUE, allowedModules, type PortalModule } from '../lib/modules'

// ─── Constants ───────────────────────────────────────────────
const IDLE_WARN_MS   = 4 * 60 * 1000
const IDLE_LOGOUT_MS = 5 * 60 * 1000

// ─── Icon resolver ───────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Store, FileText, Clock, Package,
  Webhook, ScrollText, Settings, Shield, Users,
  GitMerge, Radio, MonitorDot, Building2,
}
function resolveIcon(key: string): React.ElementType {
  return ICON_MAP[key] ?? LayoutDashboard
}

// ─── Ficium logo ──────────────────────────────────────────────
function FLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox='0 0 100 100' fill='none'
      xmlns='http://www.w3.org/2000/svg' className={className} aria-hidden>
      <path d='M28 18 H72 C75 18 76 21 74 24 L62 38 H44 V52 H58 C61 52 62 55 60 58 L52 68 H44 V82 C44 85 41 86 38 84 L26 76 C24 75 24 73 24 71 V22 C24 19 26 18 28 18 Z'
        fill='currentColor' />
    </svg>
  )
}

// ─── Hooks ───────────────────────────────────────────────────
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
      try {
        const { error } = await supabase.auth.getSession()
        if (!stale) setStatus(error ? 'reconnecting' : 'connected')
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
    <div className='fixed inset-0 bg-ink/30 backdrop-blur-sm flex items-center justify-center z-[100] p-4'
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
            className='flex-1 border border-ink/[0.12] text-muted font-semibold py-2.5 rounded-xl hover:bg-ink/[0.03] transition-colors text-[13px]'>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mega menu ────────────────────────────────────────────────
// Section layout for the launcher. 'Home' deduped by path so
// wildcard users don't see Dashboard twice.
const MEGA_SECTIONS = [
  { label: 'Home',        keys: ['inst:dashboard', 'admin:dashboard'] },
  { label: 'Marketplace', keys: ['inst:marketplace', 'inst:bids', 'inst:bid_approval'] },
  { label: 'Manage',      keys: ['inst:products', 'inst:webhooks', 'inst:settings'] },
  { label: 'Operations',  keys: ['inst:audit'] },
  { label: 'Admin',       keys: ['admin:users', 'admin:groups', 'admin:institutions', 'admin:dual_control'] },
  { label: 'System',      keys: ['admin:sessions', 'admin:audit', 'admin:system'] },
]

function MegaMenu({
  open, onClose, visibleModules, pendingCount, groupLoading, groupError, onRetry,
}: {
  open:           boolean
  onClose:        () => void
  visibleModules: PortalModule[]
  pendingCount:   number
  groupLoading:   boolean
  groupError:     boolean
  onRetry:        () => void
}) {
  // Esc to close
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const visibleKeys = new Set(visibleModules.map(m => m.key))
  const byKey       = Object.fromEntries(visibleModules.map(m => [m.key, m]))

  const sections = MEGA_SECTIONS
    .map(s => {
      const mods: PortalModule[] = []
      const seenPaths = new Set<string>()
      for (const k of s.keys) {
        if (!visibleKeys.has(k)) continue
        const mod = byKey[k]
        if (seenPaths.has(mod.path)) continue
        seenPaths.add(mod.path)
        mods.push(mod)
      }
      return { ...s, modules: mods }
    })
    .filter(s => s.modules.length > 0)

  const empty = sections.length === 0

  return (
    <>
      <div className='fixed inset-0 bg-ink/20 z-40' onClick={onClose} aria-hidden />
      <div
        className='absolute top-full left-0 right-0 z-50 bg-white border-b border-ink/[0.09] shadow-xl overflow-x-auto'
        role='dialog'
        aria-label='Module navigation'
      >
        {empty ? (
          <div className='flex flex-col items-center justify-center py-12 gap-3 px-6 text-center'>
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
                <p className='text-[12px] text-muted max-w-sm'>
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
        <div
          className='grid divide-x divide-ink/[0.07] min-w-[720px]'
          style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
        >
          {sections.map(section => (
            <div key={section.label}>
              <div className='px-4 pt-4 pb-2 border-b border-ink/[0.06]'>
                <p className='text-[10px] font-bold text-muted uppercase tracking-[0.1em]'>
                  {section.label}
                </p>
              </div>
              <div className='p-2'>
                {section.modules.map(mod => {
                  const Icon  = resolveIcon(mod.iconKey)
                  const badge = (mod.key === 'inst:bid_approval' || mod.key === 'admin:dual_control')
                    ? pendingCount : 0
                  return (
                    <NavLink
                      key={mod.key}
                      to={mod.path}
                      onClick={onClose}
                      className={({ isActive }) => [
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group',
                        isActive ? 'bg-ficium/[0.07]' : 'hover:bg-ink/[0.03]',
                      ].join(' ')}
                    >
                      <div className='w-8 h-8 rounded-lg bg-ink/[0.05] flex items-center justify-center flex-shrink-0 group-hover:bg-ficium/[0.08] transition-colors'>
                        <Icon className='w-4 h-4 text-muted group-hover:text-ficium transition-colors' aria-hidden />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='text-[13px] font-semibold text-ink group-hover:text-ficium transition-colors leading-tight'>
                          {mod.label}
                        </div>
                        <div className='text-[11px] text-muted truncate leading-tight mt-0.5'>
                          {mod.description}
                        </div>
                      </div>
                      {badge > 0 && (
                        <span className='bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0'>
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </>
  )
}

// ─── Top bar ─────────────────────────────────────────────────
function TopBar({
  onMenuToggle, megaOpen, platformName, subtitle, userName, pendingCount, connStatus, onSignOut,
}: {
  onMenuToggle:  () => void
  megaOpen:      boolean
  platformName:  string
  subtitle:      string
  userName:      string
  pendingCount:  number
  connStatus:    ConnStatus
  onSignOut:     () => void
}) {
  const dotColor = connStatus === 'connected'    ? 'bg-emerald-500'
                 : connStatus === 'reconnecting' ? 'bg-amber-500'
                 :                                 'bg-red-500'

  return (
    <header className='h-14 bg-[#0f0e1a] flex items-center justify-between px-4 lg:px-5 flex-shrink-0'>
      <div className='flex items-center gap-3'>
        <button
          onClick={onMenuToggle}
          className={[
            'p-2 rounded-lg transition-colors',
            megaOpen
              ? 'bg-ficium text-white'
              : 'text-white/60 hover:text-white hover:bg-white/[0.08]',
          ].join(' ')}
          aria-label='Toggle navigation menu'
          aria-expanded={megaOpen}
        >
          {megaOpen ? <X className='w-5 h-5' aria-hidden /> : <Menu className='w-5 h-5' aria-hidden />}
        </button>

        <Link to='/dashboard' className='flex items-center gap-2.5 group' aria-label='Go to dashboard'>
          <div className='w-8 h-8 rounded-lg bg-ficium flex items-center justify-center flex-shrink-0'>
            <FLogo size={16} className='text-white' />
          </div>
          <div className='hidden sm:block'>
            <div className='font-display font-bold text-[13px] text-white tracking-tight leading-none'>FICIUM</div>
            <div className='text-[9px] font-bold text-ficium uppercase tracking-wider leading-none mt-1'>
              {subtitle}
            </div>
          </div>
        </Link>

        <div className='hidden md:flex items-center gap-2 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-1.5 ml-2'>
          <span className='text-[12px] font-semibold text-white/80 max-w-[200px] truncate'>{platformName}</span>
          <ChevronDown className='w-3.5 h-3.5 text-white/40 flex-shrink-0' aria-hidden />
        </div>
      </div>

      <div className='flex items-center gap-2'>
        <div className='hidden sm:flex items-center gap-1.5 text-[11px] text-white/40'>
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden />
          <span className='capitalize'>{connStatus}</span>
        </div>
        <button className='relative w-9 h-9 rounded-xl hover:bg-white/[0.08] flex items-center justify-center transition-colors text-white/50 hover:text-white'
          aria-label={`Notifications${pendingCount > 0 ? ` — ${pendingCount} pending` : ''}`}>
          <Bell className='w-4 h-4' aria-hidden />
          {pendingCount > 0 && <span className='absolute top-1.5 right-1.5 w-2 h-2 bg-ficium rounded-full' aria-hidden />}
        </button>
        <div className='w-8 h-8 rounded-full bg-ficium flex items-center justify-center flex-shrink-0'
          aria-hidden>
          <span className='text-[12px] font-bold text-white'>{(userName || 'U')[0].toUpperCase()}</span>
        </div>
        <button onClick={onSignOut}
          className='flex items-center gap-1.5 text-[12px] text-white/40 hover:text-red-400 transition-colors p-2'
          aria-label='Sign out'>
          <LogOut className='w-4 h-4' aria-hidden />
          <span className='hidden lg:block'>Sign out</span>
        </button>
      </div>
    </header>
  )
}

// ─── Status bar ───────────────────────────────────────────────
function StatusBar({ groupLabel, connStatus, idleWarning }: {
  groupLabel: string; connStatus: ConnStatus; idleWarning: boolean
}) {
  return (
    <div className='h-6 bg-ink/[0.015] border-t border-ink/[0.06] flex items-center px-4 gap-4 flex-shrink-0 text-[10px] font-mono text-muted'
      role='status' aria-live='polite'>
      <span className={`flex items-center gap-1 font-semibold ${connStatus === 'connected' ? 'text-emerald-600' : connStatus === 'reconnecting' ? 'text-amber-600' : 'text-red-600'}`}>
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
          <span className='flex items-center gap-1 text-amber-600 font-semibold animate-pulse'>
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

  const [megaOpen,     setMegaOpen]     = useState(false)
  const [userName,     setUserName]     = useState('')
  const [pendingCount] = useState(0)

  // Fetch user display name
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserName(data.user?.user_metadata?.display_name ?? data.user?.email?.split('@')[0] ?? 'User')
    })
  }, [])

  const qc = useQueryClient()

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    qc.clear()
    navigate('/login?signedout=1')
  }, [navigate, qc])

  const { idleWarning, reset: resetIdle } = useSessionGuard(handleSignOut)
  const connStatus = useConnStatus()

  // Keyboard nav
  const permissions    = myGroup?.module_permissions ?? []
  const visibleModules = allowedModules(MODULE_CATALOGUE, permissions)

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

  const isAdmin      = myGroup?.user_type === 'admin' || permissions.includes('*')
  const platformName = isAdmin ? 'Ficium Admin' : (userName || 'Institution')
  const subtitle     = isAdmin ? 'Internal Portal' : 'Bank Portal'

  return (
    <div className='flex flex-col h-screen bg-[#f5f4f8] text-ink font-body overflow-hidden'>
      {idleWarning && <IdleWarningBanner onDismiss={resetIdle} onSignOut={handleSignOut} />}

      <div className='relative flex-shrink-0 z-50'>
        <TopBar
          onMenuToggle={() => setMegaOpen(v => !v)}
          megaOpen={megaOpen}
          platformName={platformName}
          subtitle={subtitle}
          userName={userName}
          pendingCount={pendingCount}
          connStatus={connStatus}
          onSignOut={handleSignOut}
        />
        <MegaMenu
          open={megaOpen}
          onClose={() => setMegaOpen(false)}
          visibleModules={visibleModules}
          pendingCount={pendingCount}
          groupLoading={groupLoading}
          groupError={groupError}
          onRetry={() => refetchGroup()}
        />
      </div>

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
