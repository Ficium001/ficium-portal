/**
 * @component PortalShell
 * @description
 *   Unified portal shell. One nav, one shell, all user types.
 *   Nav items driven entirely by group.module_permissions.
 *   Admin modules and institution modules live in the same sidebar.
 *
 *   Features:
 *     - Dark sidebar with grouped nav sections
 *     - Top bar: institution/platform name + bell + avatar
 *     - Session guard (4 min warn, 5 min logout)
 *     - Connection monitor
 *     - Vim-style keyboard nav (G+key)
 *     - Collapsible sidebar (Ctrl+B)
 *     - Status bar
 *
 * @owner Ficium Engineering
 */

import {
  useEffect, useRef, useState, useCallback,
} from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Store, FileText, Clock,
  Webhook, Package, ScrollText, Settings,
  LogOut, Bell, Wifi, WifiOff, AlertTriangle, Shield,
  ChevronDown, Menu, X, Users, GitMerge, Radio, MonitorDot,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMyGroup } from '../../admin/hooks/useAdmin'
import { MODULE_CATALOGUE, allowedModules, type PortalModule } from '../lib/modules'
import type { UserGroup } from '../lib/groups'

// ─── Constants ───────────────────────────────────────────────
const IDLE_WARN_MS   = 4 * 60 * 1000
const IDLE_LOGOUT_MS = 5 * 60 * 1000
const PING_MS        = 30 * 1000

// ─── Icon resolver ───────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Store, FileText, Clock, Package,
  Webhook, ScrollText, Settings, Shield, Users,
  GitMerge, Radio, MonitorDot,
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
    const ping = async () => {
      try {
        const { error } = await supabase.from('auth').select('*').limit(0).maybeSingle()
        if (!stale) setStatus(error ? 'reconnecting' : 'connected')
      } catch { if (!stale) setStatus('offline') }
    }
    ping()
    const id = setInterval(ping, PING_MS)
    const onOnline  = () => { setStatus('reconnecting'); ping() }
    const onOffline = () => setStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { stale = true; clearInterval(id); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])
  return status
}

// ─── Nav section config ───────────────────────────────────────
// Sections group modules visually. Order matters.
const NAV_SECTIONS = [
  { key: 'main',       label: '',            moduleKeys: ['inst:dashboard', 'admin:dashboard'] },
  { key: 'market',     label: 'Marketplace', moduleKeys: ['inst:marketplace', 'inst:bids', 'inst:bid_approval'] },
  { key: 'manage',     label: 'Manage',      moduleKeys: ['inst:products', 'inst:webhooks', 'inst:settings'] },
  { key: 'admin',      label: 'Admin',       moduleKeys: ['admin:users', 'admin:groups', 'admin:dual_control'] },
  { key: 'ops',        label: 'Operations',  moduleKeys: ['admin:sessions', 'inst:audit', 'admin:audit'] },
  { key: 'system',     label: 'System',      moduleKeys: ['admin:system'] },
]

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

// ─── Sidebar ─────────────────────────────────────────────────
function Sidebar({
  open, collapsed, group, userName, pendingCount, onSignOut, onClose, onToggleCollapse,
}: {
  open:             boolean
  collapsed:        boolean
  group?:           UserGroup
  userName?:        string
  pendingCount:     number
  onSignOut:        () => void
  onClose:          () => void
  onToggleCollapse: () => void
}) {
  const permissions    = group?.module_permissions ?? []
  const visibleModules = allowedModules(MODULE_CATALOGUE, permissions)
  const byKey          = Object.fromEntries(visibleModules.map(m => [m.key, m]))
  const visibleKeys    = new Set(visibleModules.map(m => m.key))

  const isAdmin = group?.user_type === 'admin' || permissions.includes('*')
  const platformName = isAdmin ? 'Ficium Admin' : (userName ?? 'Institution')

  return (
    <>
      {open && <div className='fixed inset-0 bg-ink/40 z-30 lg:hidden' onClick={onClose} aria-hidden />}

      <aside className={[
        'fixed lg:static inset-y-0 left-0 z-40 lg:z-auto',
        'bg-[#0f0e1a] flex flex-col flex-shrink-0',
        'transition-all duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        collapsed ? 'w-[60px]' : 'w-64',
      ].join(' ')} aria-label='Portal navigation'>

        {/* Logo */}
        <div className={`flex items-center border-b border-white/[0.06] flex-shrink-0 ${collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-5 gap-3 justify-between'}`}>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='w-9 h-9 rounded-xl bg-ficium flex items-center justify-center flex-shrink-0'>
              <FLogo size={18} className='text-white' />
            </div>
            {!collapsed && (
              <div className='min-w-0'>
                <div className='font-display font-bold text-[14px] text-white tracking-tight truncate'>FICIUM</div>
                <div className='text-[9px] font-bold text-ficium/60 uppercase tracking-wider truncate'>
                  {isAdmin ? 'Internal Portal' : 'Bank Portal'}
                </div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={onClose} className='lg:hidden text-white/40 hover:text-white flex-shrink-0' aria-label='Close nav'>
              <X className='w-4 h-4' />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className='flex-1 overflow-y-auto py-3 px-2' aria-label='Primary navigation'>
          {NAV_SECTIONS.map(section => {
            const sectionMods = section.moduleKeys
              .filter(k => visibleKeys.has(k))
              .map(k => byKey[k])
              .filter(Boolean) as PortalModule[]
            if (sectionMods.length === 0) return null
            return (
              <div key={section.key} className='mb-3'>
                {section.label && !collapsed && (
                  <p className='text-[9px] font-bold text-white/20 uppercase tracking-[0.15em] px-3 mb-1'>
                    {section.label}
                  </p>
                )}
                {sectionMods.map(mod => {
                  const Icon         = resolveIcon(mod.iconKey)
                  const isDualCtrl   = mod.key === 'admin:dual_control'
                  const isApprovals  = mod.key === 'inst:bid_approval'
                  const badge        = (isDualCtrl || isApprovals) ? pendingCount : 0
                  return (
                    <NavLink key={mod.key} to={mod.path}
                      title={collapsed ? `${mod.label} (G+${mod.shortcut})` : undefined}
                      className={({ isActive }) => [
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all mb-0.5',
                        collapsed ? 'justify-center' : '',
                        isActive
                          ? 'bg-ficium text-white font-semibold'
                          : 'text-white/50 hover:text-white hover:bg-white/[0.06]',
                      ].join(' ')}
                      aria-label={mod.label}
                    >
                      <Icon className='w-4 h-4 flex-shrink-0' aria-hidden />
                      {!collapsed && (
                        <>
                          <span className='flex-1'>{mod.label}</span>
                          {badge > 0 && (
                            <span className='bg-white text-ficium text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center'>
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && badge > 0 && (
                        <span className='absolute top-1 right-1 w-2 h-2 bg-ficium rounded-full' aria-hidden />
                      )}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/[0.06] flex-shrink-0 ${collapsed ? 'p-3' : 'p-4'}`}>
          {!collapsed && (
            <div className='flex items-center gap-2.5 mb-3'>
              <div className='w-8 h-8 rounded-full bg-ficium/30 border border-ficium/40 flex items-center justify-center flex-shrink-0'>
                <span className='text-[12px] font-bold text-white'>
                  {(userName ?? 'U')[0].toUpperCase()}
                </span>
              </div>
              <div className='min-w-0 flex-1'>
                <div className='text-[13px] font-semibold text-white truncate'>{userName ?? 'User'}</div>
                <div className='text-[10px] text-white/40'>{group?.label ?? 'Member'}</div>
              </div>
            </div>
          )}
          <div className={`flex ${collapsed ? 'flex-col gap-2 items-center' : 'items-center justify-between'}`}>
            <button onClick={onToggleCollapse}
              className='text-white/30 hover:text-white transition-colors p-1'
              title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed
                ? <PanelLeftOpen className='w-3.5 h-3.5' aria-hidden />
                : <PanelLeftClose className='w-3.5 h-3.5' aria-hidden />
              }
            </button>
            <button onClick={onSignOut}
              className='flex items-center gap-2 text-[12px] text-white/30 hover:text-red-400 transition-colors'
              aria-label='Sign out'>
              <LogOut className='w-3.5 h-3.5' aria-hidden />
              {!collapsed && 'Sign out'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Top bar ─────────────────────────────────────────────────
function TopBar({
  onMenuOpen, platformName, pendingCount, connStatus, collapsed,
}: {
  onMenuOpen:    () => void
  platformName:  string
  pendingCount:  number
  connStatus:    ConnStatus
  collapsed:     boolean
}) {
  const dotColor = connStatus === 'connected'    ? 'bg-emerald-500'
                 : connStatus === 'reconnecting' ? 'bg-amber-500'
                 :                                 'bg-red-500'

  return (
    <header className='h-14 bg-white border-b border-ink/[0.07] flex items-center justify-between px-4 lg:px-6 flex-shrink-0'>
      <div className='flex items-center gap-3'>
        <button onClick={onMenuOpen}
          className='lg:hidden p-2 rounded-lg hover:bg-ink/[0.05] text-muted hover:text-ink transition-colors'
          aria-label='Open navigation'>
          <Menu className='w-5 h-5' aria-hidden />
        </button>
        <div className='flex items-center gap-2 bg-ink/[0.03] border border-ink/[0.08] rounded-xl px-3 py-2 cursor-pointer hover:bg-ink/[0.05] transition-colors'>
          <div className='w-5 h-5 rounded bg-ficium/10 flex items-center justify-center flex-shrink-0'>
            <span className='text-[10px] font-bold text-ficium'>{platformName[0].toUpperCase()}</span>
          </div>
          <span className='text-[13px] font-semibold text-ink max-w-[180px] truncate'>{platformName}</span>
          <ChevronDown className='w-3.5 h-3.5 text-muted flex-shrink-0' aria-hidden />
        </div>
      </div>

      <div className='flex items-center gap-2'>
        <div className='flex items-center gap-1.5 text-[11px] text-muted'>
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden />
          <span className='hidden sm:block capitalize'>{connStatus}</span>
        </div>
        <button className='relative w-9 h-9 rounded-xl hover:bg-ink/[0.05] flex items-center justify-center transition-colors text-muted hover:text-ink'
          aria-label={`Notifications${pendingCount > 0 ? ` — ${pendingCount} pending` : ''}`}>
          <Bell className='w-4 h-4' aria-hidden />
          {pendingCount > 0 && <span className='absolute top-1.5 right-1.5 w-2 h-2 bg-ficium rounded-full' aria-hidden />}
        </button>
        <div className='w-9 h-9 rounded-xl bg-ficium flex items-center justify-center cursor-pointer hover:bg-ficium-deep transition-colors'
          aria-label='Account menu'>
          <span className='text-[13px] font-bold text-white'>{platformName[0].toUpperCase()}</span>
        </div>
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
  const { data: myGroup } = useMyGroup()

  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [collapsed,    setCollapsed]    = useState(false)
  const [userName,     setUserName]     = useState('')
  const [pendingCount, setPendingCount] = useState(0)

  // Fetch user display name
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserName(data.user?.user_metadata?.display_name ?? data.user?.email?.split('@')[0] ?? 'User')
    })
  }, [])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    navigate('/login?signedout=1')
  }, [navigate])

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

  // Ctrl+B collapse
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); setCollapsed(v => !v) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const isAdmin     = myGroup?.user_type === 'admin' || permissions.includes('*')
  const platformName = isAdmin ? 'Ficium Admin' : (userName || 'Institution')

  return (
    <div className='flex flex-col h-screen bg-[#f5f4f8] text-ink font-body overflow-hidden'>
      {idleWarning && <IdleWarningBanner onDismiss={resetIdle} onSignOut={handleSignOut} />}

      <div className='flex flex-1 overflow-hidden'>
        <Sidebar
          open={sidebarOpen}
          collapsed={collapsed}
          group={myGroup ?? undefined}
          userName={userName}
          pendingCount={pendingCount}
          onSignOut={handleSignOut}
          onClose={() => setSidebarOpen(false)}
          onToggleCollapse={() => setCollapsed(v => !v)}
        />

        <div className='flex-1 flex flex-col overflow-hidden min-w-0'>
          <TopBar
            onMenuOpen={() => setSidebarOpen(true)}
            platformName={platformName}
            pendingCount={pendingCount}
            connStatus={connStatus}
            collapsed={collapsed}
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
      </div>
    </div>
  )
}
