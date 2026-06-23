/**
 * @page UnifiedLogin
 * @route / and /login
 * @access public
 * @description
 *   Single entry point for all portal users — institution analysts,
 *   institution admins, and Ficium internal admins.
 *
 *   Auth flow (ficium-auth, RS256):
 *     1. POST /auth/login → RS256 access token stored in sessionStorage
 *     2. GET /institutions/me (portal-api) → resolves admin vs institution
 *     3. Route accordingly; unprovisioned users are signed out with an error
 *
 *   The user never chooses their portal type. The system detects it.
 *   One URL: portal.ficium.net
 *
 * @owner Ficium Engineering
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Shield, ArrowRight, Building2, Zap } from 'lucide-react'
import { signIn as ficiumSignIn, getTokenPayload, hasSession, signOut as ficiumSignOut } from '../lib/ficiumAuth'
import { portalApi, PortalApiError } from '../lib/portalApi'
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
// User type detection — from the verified JWT payload (no network) with a
// portal-api fallback for the institution status gate.
// ─────────────────────────────────────────────────────────────────────────────

type UserType = 'admin' | 'institution' | 'unknown'

interface MeResponse {
  user_type: 'admin' | 'institution'
}

async function detectUserType(): Promise<UserType> {
  // Trust the JWT payload entirely — zero network call on redirect.
  // The token is RS256-signed by ficium-auth; role is set at login time
  // and is authoritative for routing. The portal-api enforces real
  // permissions on every protected endpoint anyway.
  const payload = getTokenPayload()
  const role = payload?.user_role as string | undefined
  // Ficium internal admins
  if (role === 'admin' || role === 'super_admin') return 'admin'
  // Institution users: all institution_* roles route to institution portal
  if (role?.startsWith('institution_')) return 'institution'
  // Fallback: any token with an institution_id is an institution user
  if (payload?.institution_id) return 'institution'
  return 'unknown'
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
        <div className='mb-auto'>
          <FiciumLogo heightPx={22} withWordmark wordmarkClassName='text-[20px] text-white' />
        </div>

        <div className='mb-auto'>
          <h1 className='font-display font-bold tracking-display text-[36px] xl:text-[44px] leading-[1.08] mb-4'>
            The reverse<br />banking<br /><GradText>marketplace.</GradText>
          </h1>
          <p className='text-[#A6A6C8] text-[15px] leading-relaxed max-w-xs'>
            Clients post their needs. Providers compete. Everyone wins.
          </p>
        </div>

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

  const [username,     setUsername]    = useState('')
  const [password,     setPassword]    = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]     = useState(false)
  const [detecting,    setDetecting]   = useState(false)
  const [error,        setError]       = useState<string | null>(null)

  const inputCls = (invalid?: boolean) => [
    'w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-all bg-white text-ink',
    'placeholder:text-ink/30',
    invalid
      ? 'border-red-400 focus:ring-2 focus:ring-red-200'
      : 'border-ink/[0.12] focus:border-ficium focus:ring-2 focus:ring-ficium/20',
  ].join(' ')

  // If already signed in (valid ficium-auth token), detect and redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('signedout') === '1') return
    if (!hasSession()) return

    let cancelled = false
    setDetecting(true)
    detectUserType().then(userType => {
      if (cancelled) return
      if (userType === 'admin' || userType === 'institution') {
        navigate(from ?? '/dashboard', { replace: true })
      } else {
        setDetecting(false)
      }
    })
    return () => { cancelled = true }
  }, [navigate, from])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError(null)
    setLoading(true)

    const { tokens, error: authErr } = await ficiumSignIn(
      username.trim().toLowerCase(),
      password,
    )

    if (authErr || !tokens) {
      setError(authErr ?? 'Incorrect username or password.')
      setLoading(false)
      return
    }

    setDetecting(true)
    const userType = await detectUserType()

    if (userType === 'admin' || userType === 'institution') {
      navigate(from ?? '/dashboard', { replace: true })
    } else {
      await ficiumSignOut()
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

  return (
    <div className='min-h-screen flex overflow-hidden'>
      <LeftPanel />

      <div className='flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-paper'>
        <div className='w-full max-w-[400px]'>
          <div className='flex items-center gap-2.5 mb-8 lg:hidden'>
            <FiciumLogo heightPx={20} withWordmark wordmarkClassName='text-[18px] text-ink' />
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
              <label htmlFor='username' className='block text-[13px] font-semibold text-ink mb-1.5'>
                Username
              </label>
              <input
                id='username'
                type='text'
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder='jane_smith'
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
              disabled={loading || !username || !password}
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
