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

// ─────────────────────────────────────────────────────────────────────────────
// Logo
// ─────────────────────────────────────────────────────────────────────────────

function FLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox='0 0 100 100' fill='none' aria-hidden>
      <path
        d='M28 18 H72 C75 18 76 21 74 24 L62 38 H44 V52 H58 C61 52 62 55 60 58 L52 68 H44 V82 C44 85 41 86 38 84 L26 76 C24 75 24 73 24 71 V22 C24 19 26 18 28 18 Z'
        fill='currentColor'
      />
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
    <div className='hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col relative overflow-hidden'>
      <div className='absolute inset-0 bg-gradient-to-br from-[#0a0f1e] via-[#0f1929] to-[#0b1628]' />
      <div
        className='absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.4) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.25) 0%, transparent 50%)',
        }}
      />
      <div className='absolute top-1/3 -left-10 w-72 h-72 rounded-full bg-blue-600/20 blur-[80px] animate-pulse' />
      <div
        className='absolute bottom-1/4 right-0 w-64 h-64 rounded-full bg-ficium/15 blur-[80px] animate-pulse'
        style={{ animationDelay: '1.5s' }}
      />

      <div className='relative z-10 flex flex-col h-full p-10 xl:p-14'>
        {/* Logo */}
        <div className='flex items-center gap-3 text-white mb-auto'>
          <FLogo size={28} />
          <span className='font-display font-bold text-[20px] tracking-tight'>Ficium</span>
        </div>

        {/* Headline */}
        <div className='mb-auto'>
          <h1 className='text-white font-display font-bold text-[36px] xl:text-[42px] leading-[1.1] tracking-tight mb-4'>
            The reverse<br />banking<br />marketplace.
          </h1>
          <p className='text-white/50 text-[15px] leading-relaxed max-w-xs'>
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
              <div className='w-8 h-8 rounded-lg bg-ficium/[0.06] flex items-center justify-center flex-shrink-0'>
                <Icon className='w-4 h-4 text-white/70' aria-hidden />
              </div>
              <span className='text-white/60 text-[13px]'>{label}</span>
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

  // Handle invite links — token arrives in the URL hash
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('type=invite')) return
    const p = new URLSearchParams(hash.replace('#', ''))
    const at = p.get('access_token')
    const rt = p.get('refresh_token')
    if (at && rt) {
      supabase.auth.setSession({ access_token: at, refresh_token: rt }).then(() => {
        window.history.replaceState(null, '', window.location.pathname)
        setShowSetPassword(true)
      })
    }
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
      <div className='min-h-screen bg-cream flex items-center justify-center'>
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
        <div className='flex-1 flex items-center justify-center p-8 bg-cream'>
          <div className='w-full max-w-[400px]'>
            <div className='flex items-center gap-3 mb-8'>
              <div className='w-9 h-9 rounded-xl bg-ficium text-white flex items-center justify-center'><FLogo size={20} /></div>
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
                  className='w-full py-2.5 rounded-xl bg-ficium text-white text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-ficium/90 transition-colors'
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
      <div className='flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-cream'>
        <div className='w-full max-w-[400px]'>
          {/* Mobile logo */}
          <div className='flex items-center gap-2.5 mb-8 lg:hidden'>
            <FLogo size={24} />
            <span className='font-display font-bold text-[18px] text-ink'>Ficium</span>
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
              className='w-full bg-ficium hover:bg-ficium-deep disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-[15px] transition-colors flex items-center justify-center gap-2'
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
