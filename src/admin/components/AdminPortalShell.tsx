/**
 * @component AdminPortalShell
 * @description
 *   Root layout for all /admin/* protected pages.
 *   Dark navy theme — visually distinct from institution portal.
 *
 *   Features:
 *     - Sidebar nav with role-gated items (hide if no permission)
 *     - Always-visible security status bar
 *     - Session heartbeat (pings every 60 s)
 *     - Idle timeout: warn at 8 min, force sign-out at 10 min
 *     - Keyboard shortcuts: G+key navigation
 *     - Pending dual-control badge auto-polls every 30 s
 *     - Connection indicator
 *
 * @owner Ficium Engineering
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Shield, GitMerge, ScrollText,
  MonitorDot, Radio, LogOut, ChevronRight, Bell,
  Wifi, WifiOff, Clock, ShieldCheck,
} from 'lucide-react'
import { useAdminMe, useDualControlActions } from '../hooks/useAdmin'
import adminDb from '../lib/adminSupabase'
import type { AdminSection } from '../types/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const IDLE_WARN_MS   = 8  * 60 * 1000
const IDLE_LOGOUT_MS = 10 * 60 * 1000
const HEARTBEAT_MS   = 60 * 1000
const PING_MS        = 30 * 1000

interface NavItem {
  section:    AdminSection
  label:      string
  path:       string
  icon:       React.ElementType
  permission?: string
  key:        string
}

const NAV: NavItem[] = [
  { section: 'dashboard',    label: 'Dashboard',      path: '/admin/dashboard',    icon: LayoutDashboard, key: 'D' },
  { section: 'users',        label: 'Users',          path: '/admin/users',        icon: Users,     permission: 'users:view',         key: 'U' },
  { section: 'roles',        label: 'Roles',          path: '/admin/roles',        icon: Shield,    permission: 'roles:view',         key: 'R' },
  { section: 'dual-control', label: 'Dual Control',   path: '/admin/dual-control', icon: GitMerge,  permission: 'dual_control:view',  key: 'Q' },
  { section: 'sessions',     label: 'Sessions',       path: '/admin/sessions',     icon: Radio,     permission: 'sessions:view',      key: 'S' },
  { section: 'audit',        label: 'Audit Log',      path: '/admin/audit',        icon: ScrollText, permission: 'audit:view',        key: 'L' },
  { section: 'system',       label: 'System',         path: '/admin/system',       icon: MonitorDot, permission: 'system:view',       key: 'Y' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Connection indicator
// ─────────────────────────────────────────────────────────────────────────────

type Conn = 'connected' | 'reconnecting' | 'offline'

function useConn(): Conn {
  const [status, setStatus] = useState<Conn>('connected')
  useEffect(() => {
    let dead = false
    const ping = async () => {
      try {
        const { error } = await adminDb.from('admin_users').select('id').limit(1).maybeSingle()
        if (!dead) setStatus(error ? 'reconnecting' : 'connected')
      } catch { if (!dead) setStatus('offline') }
    }
    ping()
    const id = setInterval(ping, PING_MS)
    const on  = () => { setStatus('reconnecting'); ping() }
    const off = () => setStatus('offline')
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { dead = true; clearInterval(id); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return status
}

// ─────────────────────────────────────────────────────────────────────────────
// Idle guard
// ─────────────────────────────────────────────────────────────────────────────

function useIdleGuard(onSignOut: () => void) {
  const [warning, setWarning] = useState(false)
  const last = useRef(Date.now())
  const reset = useCallback(() => { last.current = Date.now(); setWarning(false) }, [])
  useEffect(() => {
    const events = ['mousemove', 'keydown', 'pointerdown']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    const t = setInterval(() => {
      const idle = Date.now() - last.current
      if (idle >= IDLE_LOGOUT_MS) onSignOut()
      else setWarning(idle >= IDLE_WARN_MS)
    }, 15_000)
    return () => { events.forEach(e => window.removeEventListener(e, reset)); clearInterval(t) }
  }, [onSignOut, reset])
  return { warning, reset }
}

// ─────────────────────────────────────────────────────────────────────────────
// Idle warning overlay
// ─────────────────────────────────────────────────────────────────────────────

function IdleWarning({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className='fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4'
      role='alertdialog' aria-labelledby='idle-title'>
      <div className='bg-[#111827] border border-amber-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl'>
        <Clock className='w-10 h-10 text-amber-400 mx-auto mb-4' aria-hidden />
        <h2 id='idle-title' className='text-white font-black text-[18px] mb-2'>Session expiring</h2>
        <p className='text-slate-400 text-[12px] mb-6'>
          Inactive for 8 minutes. You will be signed out in 2 minutes to protect admin access.
        </p>
        <div className='flex gap-3'>
          <button onClick={onStay} autoFocus
            className='flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2.5 rounded-xl text-[13px] transition-colors'>
            Stay signed in
          </button>
          <button onClick={onLeave}
            className='flex-1 border border-[#374151] text-slate-400 font-semibold py-2.5 rounded-xl text-[13px] hover:bg-white/5'>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────────────────────

function StatusBar({
  conn, role, adminId, warning, pendingDc,
}: {
  conn: Conn; role: string; adminId: string; warning: boolean; pendingDc: number
}) {
  const connColor = conn === 'connected' ? 'text-emerald-400' : conn === 'reconnecting' ? 'text-amber-400' : 'text-red-400'
  const ConnIcon  = conn === 'connected' ? Wifi : WifiOff
  return (
    <div className='h-6 bg-[#0d1117] border-t border-[#1f2937] flex items-center px-4 gap-4 flex-shrink-0 text-[9px] font-mono'
      role='status' aria-live='polite' aria-label='Admin session status'>
      <span className={`flex items-center gap-1 font-bold ${connColor}`}>
        <ConnIcon className='w-2.5 h-2.5' aria-hidden />{conn.toUpperCase()}
      </span>
      <span className='text-[#2d3748]'>·</span>
      <span className='flex items-center gap-1 text-slate-600'>
        <ShieldCheck className='w-2.5 h-2.5' aria-hidden />{role.toUpperCase()}
      </span>
      <span className='text-[#2d3748]'>·</span>
      <span className='text-slate-700'>{adminId.slice(0, 8)}</span>
      {pendingDc > 0 && (
        <><span className='text-[#2d3748]'>·</span>
        <span className='text-indigo-400 font-bold'>{pendingDc} DUAL-CTRL PENDING</span></>
      )}
      {warning && (
        <><span className='text-[#2d3748]'>·</span>
        <span className='text-amber-400 font-bold animate-pulse'>SESSION EXPIRING</span></>
      )}
      <span className='ml-auto text-slate-700'>G+D Dashboard · G+U Users · G+Q Dual Control · G+L Audit</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPortalShell() {
  const navigate  = useNavigate()
  const { data: me } = useAdminMe()
  const { data: dcPending = [] } = useDualControlActions('pending')

  const signOut = useCallback(async () => {
    await adminDb.auth.signOut(); navigate('/admin/login')
  }, [navigate])

  const { warning, reset } = useIdleGuard(signOut)
  const conn = useConn()

  // Keyboard nav
  useEffect(() => {
    const gRef = { pressed: false, timer: 0 as unknown as ReturnType<typeof setTimeout> }
    const routes: Record<string, string> = {
      d: '/admin/dashboard', u: '/admin/users', r: '/admin/roles',
      q: '/admin/dual-control', s: '/admin/sessions', l: '/admin/audit', y: '/admin/system',
    }
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
  }, [navigate])

  // Heartbeat
  useEffect(() => {
    if (!me) return
    const t = setInterval(async () => {
      await adminDb.from('admin_sessions').update({ last_active_at: new Date().toISOString() })
        .eq('admin_user_id', me.id).eq('is_active', true)
    }, HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [me])

  const permissions: string[] = me?.permissions ?? []
  const isSuperAdmin = me?.role_slug === 'super_admin'

  const visible = NAV.filter(item =>
    !item.permission || isSuperAdmin || permissions.includes(item.permission)
  )

  const pendingCount = dcPending.length
  const urgentCount  = dcPending.filter(a =>
    new Date(a.expires_at).getTime() - Date.now() < 2 * 3_600_000
  ).length

  return (
    <div className='flex flex-col h-screen bg-[#0a0d14] text-slate-200 overflow-hidden'>
      {warning && <IdleWarning onStay={reset} onLeave={signOut} />}

      <div className='flex flex-1 overflow-hidden'>
        {/* Sidebar */}
        <aside className='w-56 bg-[#0d1117] border-r border-[#1f2937] flex flex-col flex-shrink-0' aria-label='Admin navigation'>
          {/* Logo */}
          <div className='px-4 py-4 border-b border-[#1f2937] flex items-center gap-3'>
            <div className='w-7 h-7 bg-indigo-500/20 border border-indigo-500/30 rounded-lg flex items-center justify-center flex-shrink-0'>
              <Shield className='w-3.5 h-3.5 text-indigo-400' aria-hidden />
            </div>
            <div>
              <div className='text-white font-black text-[13px]'>Ficium Admin</div>
              <div className='text-indigo-500 text-[9px] font-bold uppercase tracking-widest'>Internal Portal</div>
            </div>
          </div>

          {/* Nav */}
          <nav className='flex-1 py-3 overflow-y-auto' aria-label='Primary navigation'>
            <p className='text-[8px] font-bold text-slate-700 uppercase tracking-[0.15em] px-4 mb-2'>Navigation</p>
            {visible.map(item => (
              <NavLink
                key={item.section}
                to={item.path}
                title={`${item.label} (G+${item.key})`}
                className={({ isActive }) => [
                  'flex items-center gap-3 mx-2 px-3 py-2 rounded-xl text-[12px] font-medium transition-all',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/20'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5',
                ].join(' ')}
                aria-label={item.label}
              >
                <item.icon className='w-3.5 h-3.5 flex-shrink-0' aria-hidden />
                <span className='flex-1'>{item.label}</span>
                {item.section === 'dual-control' && pendingCount > 0 && (
                  <span className='bg-indigo-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center'>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className='border-t border-[#1f2937] p-3'>
            <div className='flex items-center gap-2.5 mb-2.5 px-1'>
              <div className='w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0'>
                <span className='text-[11px] font-bold text-indigo-400'>
                  {(me?.display_name ?? 'A')[0].toUpperCase()}
                </span>
              </div>
              <div className='min-w-0'>
                <div className='text-[11px] font-semibold text-slate-300 truncate'>{me?.display_name ?? 'Admin'}</div>
                <div className='text-[9px] text-slate-600 truncate font-mono'>{me?.role_slug ?? '—'}</div>
              </div>
            </div>
            <button onClick={signOut}
              className='flex items-center gap-2 text-[11px] text-slate-600 hover:text-red-400 transition-colors w-full px-1'
              aria-label='Sign out'>
              <LogOut className='w-3.5 h-3.5' aria-hidden />Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className='flex-1 flex flex-col overflow-hidden'>
          {/* Top bar */}
          <header className='h-12 bg-[#0d1117] border-b border-[#1f2937] flex items-center justify-between px-5 flex-shrink-0'>
            <div className='flex items-center gap-1.5 text-[12px] text-slate-500'>
              <Shield className='w-3.5 h-3.5 text-indigo-500' aria-hidden />
              <span>Ficium Admin</span>
              <ChevronRight className='w-3 h-3 text-slate-700' aria-hidden />
              <span className='text-slate-300 font-medium'>{me?.display_name ?? 'Admin'}</span>
            </div>
            <div className='flex items-center gap-3'>
              {urgentCount > 0 && (
                <span className='flex items-center gap-1.5 bg-red-900/40 border border-red-800 text-red-400 text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest'>
                  {urgentCount} URGENT
                </span>
              )}
              <button
                className='relative w-8 h-8 rounded-xl hover:bg-white/5 flex items-center justify-center transition-colors text-slate-500 hover:text-slate-200'
                aria-label={`Notifications${pendingCount > 0 ? ` — ${pendingCount} pending` : ''}`}
              >
                <Bell className='w-4 h-4' aria-hidden />
                {pendingCount > 0 && (
                  <span className='absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full' aria-hidden />
                )}
              </button>
            </div>
          </header>

          <main className='flex-1 overflow-auto bg-[#0a0d14]' id='admin-main'>
            <Outlet />
          </main>
        </div>
      </div>

      <StatusBar
        conn={conn}
        role={me?.role_slug ?? '—'}
        adminId={me?.id ?? ''}
        warning={warning}
        pendingDc={pendingCount}
      />
    </div>
  )
}
