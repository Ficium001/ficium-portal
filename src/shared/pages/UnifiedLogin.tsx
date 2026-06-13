/**
 * @page UnifiedLogin
 * @route / and /login
 * @access public
 * @description
 *   Single entry point for all portal users — institution analysts,
 *   institution admins, and Ficium internal admins.
 *
 *   Auth flow after credentials verified:
 *     1. Look up admin_users (portal_admin schema) → route to /admin/dashboard
 *     2. Look up institution_members (institution schema) → route to /dashboard
 *     3. Neither found → show "access not provisioned" error
 *
 *   The user never chooses their portal type. The system detects it.
 *   One URL: portal.ficium.net
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Shield, ArrowRight, Building2, Zap } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import FiciumLogo from '../ui/FiciumLogo'
import { GradText } from '../ui/dashboard/Hero'

// ─────────────────────────────────────────────────────────────────────────────
// Drifting background blade (matches the dashboard hero)
// ─────────────────────────────────────────────────────────────────────────────

function Blade({ className, both = true }: { className: string; both?: boolean }) {
  return (
    <svg
      viewBox='0 0 310 153'
      className={`absolute opacity-50 blur-[2px] motion-safe:animate-drift will-change-transform pointer-events-none ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id='loginBladeB' x1='85' y1='79' x2='266' y2='20' gradientUnits='userSpaceOnUse'>
          <stop offset='0' stopColor='#3536DC' />
          <stop offset='0.5' stopColor='#356EF4' />
          <stop offset='1' stopColor='#4C90F6' />
        </linearGradient>
        <linearGradient id='loginBladeP' x1='85' y1='141' x2='238' y2='91' gradientUnits='userSpaceOnUse'>
          <stop offset='0' stopColor='#3A148F' />
          <stop offset='1' stopColor='#8231EC' />
        </linearGradient>
      </defs>
      {both && (
        <path d='M 121.78,31.83 Q 131,20 146,20 L 251,20 Q 266,20 257.28,32.21 L 244.72,49.79 Q 236,62 221.09,63.68 L 99.91,77.32 Q 85,79 94.22,67.17 Z' fill='url(#loginBladeB)' />
      )}
      <path d='M 108.10,103.75 Q 116,91 131,91 L 223,91 Q 238,91 230.12,103.77 L 216.88,125.23 Q 209,138 194,138.36 L 100,140.64 Q 85,141 92.90,128.25 Z' fill='url(#loginBladeP)' />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// User type detection
// ─────────────────────────────────────────────────────────────────────────────

type UserType = 'admin' | 'institution' | 'unknown'

async function detectUserType(authUserId: string): Promise<UserType> {
  // Use a SECURITY DEFINER RPC to bypass RLS — direct table queries 403
  // because the anon key can't read cross-schema tables before the session
  // is fully established as a known user type.
  const { data, error } = await supabase
    .rpc('detect_portal_user_type', { p_auth_user_id: authUserId })

  if (error) {
    console.error('detectUserType error:', error.message)
    return 'unknown'
  }

  return (data as UserType) ?? 'unknown'
}

// ─────────────────────────────────────────────────────────────────────────────
// Left panel — marketing/brand
// ─────────────────────────────────────────────────────────────────────────────

function LeftPanel() {
  return (
    <div className='hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col relative overflow-hidden text-white'>
      <div
        className='absolute inset-0'
        style={{ background: 'radial-gradient(120% 160% at 8% 0%, #181842 0%, #0B0B1E 55%)' }}
      />
      <Blade className='w-[420px] -top-20 -right-16 [animation-delay:-2s]' />
      <Blade className='w-[320px] bottom-[12%] -right-10 [animation-duration:18s]' both={false} />

      <div className='relative z-10 flex flex-col h-full p-10 xl:p-14'>
        {/* Logo */}
        <div className='mb-auto'>
          <FiciumLogo size={30} withWordmark wordmarkClassName='text-[20px] text-white' />
        </div>

        {/* Headline */}
        <div className='mb-auto'>
          <h1 className='font-display font-bold tracking-display text-[36px] xl:text-[44px] leading-[1.08] mb-4'>
            The reverse<br />banking<br /><GradText>marketplace.</GradText>
          </h1>
          <p className='text-[#A6A6C8] text-[15px] leading-relaxed max-w-xs'>
            Clients post their needs. Providers compete. Everyone wins.
          </p>
        </div>

        {/* Feature pills */}
        <div className='space-y-3 mb-10'>
          {[
            { icon: Building2, label: 'Institution portal — bid on client requests'      },
            { icon: Shield,    label: 'Maker-checker dual control on every action'       },
            { icon: Zap,       label: 'Live marketplace with real-time intelligence'     },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className='flex items-center gap-3'>
              <div
                className='w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0'
                style={{ background: 'linear-gradient(135deg,rgba(30,108,245,.16),rgba(124,58,237,.16))' }}
              >
                <Icon className='w-4 h-4 text-white/80' aria-hidden />
              </div>
              <span className='text-[#8E8EB4] text-[13px]'>{label}</span>
            </div>
          ))}
        </div>

        <p className='text-white/20 text-[11px]'>
          © {new Date().getFullYear()} Ficium Ltd · portal.ficium.net
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function UnifiedLogin() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = (location.state as { from?: Location })?.from?.pathname

  const [email,        setEmail]       = useState('')
  const [password,     setPassword]    = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]     = useState(false)
  const [detecting,    setDetecting]   = useState(false)
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [newPassword,   setNewPassword]   = useState('')
  const [pwConfirm,     setPwConfirm]     = useState('')
  const [pwError,       setPwError]       = useState<string | null>(null)
  const [pwSuccess,     setPwSuccess]     = useState(false)
  const [pwLoading,     setPwLoading]     = useState(false)
  const [error,        setError]       = useState<string | null>(null)

  const inputCls = (invalid?: boolean) => [
    'w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-all bg-white text-ink',
    'placeholder:text-ink/30',
    invalid
      ? 'border-red-400 focus:ring-2 focus:ring-red-200'
      : 'border-ink/[0.12] focus:border-ficium focus:ring-2 focus:ring-ficium/20',
  ].join(' ')

  // Handle invite links — Supabase v2 auto-consumes the hash token via
  // detectSessionInUrl, then fires onAuthStateChange with event='SIGNED_IN'
  // and a session where user.email_confirmed_at is null (invite not yet
  // accepted). We catch it here to show the set-password form instead of
  // redirecting to the dashboard.
  useEffect(() => {
    // Also catch the case where the hash is still present (some browsers)
    const hash = window.location.hash
    if (hash.includes('type=invite')) {
      window.history.replaceState(null, '', window.location.pathname)
      setShowSetPassword(true)
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // If the user has no password set yet (fresh invite), show set-password
        const meta = session.user.user_metadata ?? {}
        const isInvite = meta.onboarding === 'institution_member' && !session.user.email_confirmed_at
        if (isInvite) {
          setShowSetPassword(true)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // If already signed in, detect and redirect
  useEffect(() => {
    // Don't auto-redirect if user explicitly signed out
    const params = new URLSearchParams(window.location.search)
    if (params.get('signedout') === '1') return

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      setDetecting(true)
      const userType = await detectUserType(session.user.id)
      if (userType === 'admin') navigate('/dashboard', { replace: true })
      else if (userType === 'institution') navigate(from ?? '/dashboard', { replace: true })
      else setDetecting(false)
    })
  }, [navigate, from])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setLoading(true)

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authErr || !data.user) {
      setError('Incorrect email or password.')
      setLoading(false)
      return
    }

    setDetecting(true)
    const userType = await detectUserType(data.user.id)

    if (userType === 'admin') {
      navigate('/dashboard', { replace: true })
    } else if (userType === 'institution') {
      navigate(from ?? '/dashboard', { replace: true })
    } else {
      await supabase.auth.signOut()
      setError('Your account has not been provisioned for portal access. Contact your administrator.')
      setDetecting(false)
      setLoading(false)
    }
  }

  if (detecting) {
    return (
      <div className='min-h-screen bg-paper flex items-center justify-center'>
        <div className='text-center'>
          <div className='w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin mx-auto mb-3' />
          <p className='text-[13px] text-muted font-mono'>Detecting portal access…</p>
        </div>
      </div>
    )
  }

  if (showSetPassword) {
    const handleSetPassword = async () => {
      if (!newPassword || newPassword !== pwConfirm) {
        setPwError('Passwords do not match'); return
      }
      if (newPassword.length < 8) {
        setPwError('Password must be at least 8 characters'); return
      }
      setPwLoading(true); setPwError(null)
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      setPwLoading(false)
      if (error) { setPwError(error.message); return }
      setPwSuccess(true)
      setTimeout(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const userType = await detectUserType(session.user.id)
          if (userType === 'admin') navigate('/dashboard', { replace: true })
          else navigate('/dashboard', { replace: true })
        }
      }, 1500)
    }

    return (
      <div className='min-h-screen flex overflow-hidden'>
        <LeftPanel />
        <div className='flex-1 flex items-center justify-center p-8 bg-paper'>
          <div className='w-full max-w-[400px]'>
            <div className='flex items-center gap-3 mb-8'>
              <div className='w-9 h-9 rounded-xl bg-white border border-line flex items-center justify-center'><FiciumLogo size={20} /></div>
              <span className='font-display font-bold text-[18px] text-ink'>Set your password</span>
            </div>
            <p className='text-[13px] text-muted mb-6'>Choose a secure password to access your institution portal.</p>
            {pwSuccess ? (
              <div className='text-center py-8'>
                <div className='w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3'>
                  <Shield className='w-6 h-6 text-emerald-600' />
                </div>
                <p className='font-semibold text-ink'>Password set — redirecting…</p>
              </div>
            ) : (
              <div className='space-y-4'>
                {pwError && <div className='text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2'>{pwError}</div>}
                <div>
                  <label className='block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5'>New password</label>
                  <input
                    type='password'
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder='Min. 8 characters'
                    className='w-full px-3.5 py-2.5 rounded-xl border border-ink/[0.12] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-ficium/30 focus:border-ficium'
                  />
                </div>
                <div>
                  <label className='block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5'>Confirm password</label>
                  <input
                    type='password'
                    value={pwConfirm}
                    onChange={e => setPwConfirm(e.target.value)}
                    placeholder='Repeat password'
                    className='w-full px-3.5 py-2.5 rounded-xl border border-ink/[0.12] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-ficium/30 focus:border-ficium'
                  />
                </div>
                <button
                  onClick={handleSetPassword}
                  disabled={pwLoading || !newPassword || !pwConfirm}
                  className='w-full py-2.5 rounded-xl text-white text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-300 ease-swift hover:-translate-y-0.5 hover:shadow-ficium'
                  style={{ background: 'linear-gradient(92deg,#1E6CF5,#7C3AED 90%)' }}
                >
                  {pwLoading ? <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> : <><ArrowRight className='w-4 h-4' />Activate account</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen flex overflow-hidden'>
      <LeftPanel />

      {/* Right panel */}
      <div className='flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-paper'>
        <div className='w-full max-w-[400px]'>
          {/* Mobile logo */}
          <div className='flex items-center gap-2.5 mb-8 lg:hidden'>
            <FiciumLogo size={26} withWordmark wordmarkClassName='text-[18px] text-ink' />
          </div>

          <div className='mb-8'>
            <h2 className='font-display text-[28px] font-bold text-ink tracking-tight mb-1'>
              Sign in
            </h2>
            <p className='text-[14px] text-muted'>
              Access the Ficium portal with your credentials.
            </p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-4' noValidate>
            <div>
              <label htmlFor='email' className='block text-[13px] font-semibold text-ink mb-1.5'>
                Email address
              </label>
              <input
                id='email'
                type='email'
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder='you@yourinstitution.mu'
                autoComplete='username'
                required
                className={inputCls()}
              />
            </div>

            <div>
              <label htmlFor='password' className='block text-[13px] font-semibold text-ink mb-1.5'>
                Password
              </label>
              <div className='relative'>
                <input
                  id='password'
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder='••••••••••'
                  autoComplete='current-password'
                  required
                  className={`${inputCls()} pr-11`}
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(v => !v)}
                  className='absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors'
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </button>
              </div>
            </div>

            {error && (
              <p className='text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3'>
                {error}
              </p>
            )}

            <button
              type='submit'
              disabled={loading || !email || !password}
              className='w-full disabled:opacity-50 text-white font-bold py-3.5 rounded-[14px] text-[15px] transition-all duration-300 ease-swift hover:-translate-y-0.5 hover:shadow-ficium active:scale-[.98] flex items-center justify-center gap-2'
              style={{ background: 'linear-gradient(92deg,#1E6CF5,#7C3AED 90%)' }}
            >
              {loading ? (
                <><span className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> Signing in…</>
              ) : (
                <>Sign in <ArrowRight className='w-4 h-4' /></>
              )}
            </button>
          </form>

          <div className='mt-6 pt-5 border-t border-ink/[0.08] space-y-3'>
            <p className='text-[13px] text-muted text-center'>
              Not yet registered?{' '}
              <Link to='/register' className='text-ficium font-semibold hover:underline'>
                Apply for institution access
              </Link>
            </p>
            <p className='text-[11px] text-muted/60 text-center font-mono'>
              Your portal type (institution / admin) is determined automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
