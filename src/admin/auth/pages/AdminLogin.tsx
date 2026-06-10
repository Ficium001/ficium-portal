/**
 * @page AdminLogin
 * @route /admin/login
 * @access public
 * @description
 *   Hardened admin login. Separate from institution login.
 *   Features:
 *     - Email + password authentication via Supabase auth
 *     - TOTP MFA step (enforced for all admin accounts)
 *     - Failed attempt counter display (locked after 5)
 *     - Force-password-reset redirect
 *     - Session recording on successful login
 *     - No "remember me" — session expires on browser close
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useCallback } from 'react'
import { useNavigate }  from 'react-router-dom'
import { Shield, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import adminDb from '../../lib/adminSupabase'

// ─────────────────────────────────────────────────────────────────────────────
// Ficium admin logo
// ─────────────────────────────────────────────────────────────────────────────

function AdminLogo() {
  return (
    <div className='flex items-center justify-center gap-3 mb-2'>
      <div className='w-10 h-10 bg-ficium/10 border border-ficium/30 rounded-xl flex items-center justify-center'>
        <Shield className='w-5 h-5 text-ficium' aria-hidden />
      </div>
      <div>
        <div className='text-white font-black text-[18px] tracking-tight'>Ficium</div>
        <div className='text-ficium text-[10px] font-bold uppercase tracking-widest'>Admin Portal</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Step = 'credentials' | 'mfa'

export default function AdminLogin() {
  const navigate = useNavigate()

  const [step,         setStep]       = useState<Step>('credentials')
  const [email,        setEmail]      = useState('')
  const [password,     setPassword]   = useState('')
  const [totp,         setTotp]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]    = useState(false)
  const [error,        setError]      = useState<string | null>(null)
  const [attempts,     setAttempts]   = useState(0)

  const inputCls = (err?: boolean) => [
    'w-full bg-ink/95 border rounded-xl px-4 py-3 text-[13px] text-ink/90 outline-none',
    'focus:ring-2 focus:ring-ficium/30 transition-all placeholder:text-ink/30 font-mono',
    err ? 'border-red-700' : 'border-ficium/[0.20] focus:border-ficium',
  ].join(' ')

  const handleCredentials = useCallback(async () => {
    if (!email.trim() || !password) return
    setLoading(true)
    setError(null)

    const { data, error: authErr } = await adminDb.auth.signInWithPassword({
      email, password,
    })

    if (authErr) {
      setAttempts(a => a + 1)
      setError(authErr.message)
      setLoading(false)
      return
    }

    // Verify this is a recognised admin user
    const { data: adminUser, error: adminErr } = await adminDb
      .from('admin_users')
      .select('id, status, mfa_enabled, force_password_reset, role_slug')
      .eq('auth_user_id', data.user?.id ?? '')
      .single()

    if (adminErr || !adminUser) {
      await adminDb.auth.signOut()
      setError('This account does not have admin access.')
      setLoading(false)
      return
    }

    if (adminUser.status === 'locked') {
      await adminDb.auth.signOut()
      setError('Account is locked. Contact your system administrator.')
      setLoading(false)
      return
    }

    if (adminUser.status === 'suspended' || adminUser.status === 'deactivated') {
      await adminDb.auth.signOut()
      setError('Account is suspended. Contact your system administrator.')
      setLoading(false)
      return
    }

    // Record failed_login_count reset on success
    await adminDb
      .from('admin_users')
      .update({ failed_login_count: 0, last_login_at: new Date().toISOString() })
      .eq('id', adminUser.id)

    // Force password reset
    if (adminUser.force_password_reset) {
      navigate('/admin/reset-password')
      return
    }

    // MFA check
    if (adminUser.mfa_enabled) {
      setStep('mfa')
      setLoading(false)
      return
    }

    // No MFA configured — go to MFA setup
    navigate('/admin/setup-mfa')
  }, [email, password, navigate])

  const handleMfa = useCallback(async () => {
    if (totp.length !== 6) return
    setLoading(true)
    setError(null)

    // Verify TOTP via Supabase MFA
    const { data: factors } = await adminDb.auth.mfa.listFactors()
    const totpFactor = factors?.totp?.[0]

    if (!totpFactor) {
      setError('MFA not configured.')
      setLoading(false)
      return
    }

    const { data: challenge } = await adminDb.auth.mfa.challenge({ factorId: totpFactor.id })
    if (!challenge) { setError('MFA challenge failed.'); setLoading(false); return }

    const { error: verifyErr } = await adminDb.auth.mfa.verify({
      factorId:    totpFactor.id,
      challengeId: challenge.id,
      code:        totp,
    })

    if (verifyErr) {
      setAttempts(a => a + 1)
      setError('Invalid MFA code. Try again.')
      setTotp('')
      setLoading(false)
      return
    }

    navigate('/admin/dashboard')
  }, [totp, navigate])

  const locked = attempts >= 5

  return (
    <div className='min-h-screen bg-ink flex items-center justify-center p-4'>
      {/* Security warning bar */}
      <div className='fixed top-0 inset-x-0 bg-amber-900/40 border-b border-amber-800 px-4 py-1.5 text-center'>
        <p className='text-[10px] text-amber-400 font-bold uppercase tracking-widest'>
          Authorised access only · All activity is monitored and logged · Unauthorised access is a criminal offence
        </p>
      </div>

      <div className='w-full max-w-[380px] mt-8'>
        <div className='text-center mb-8'>
          <AdminLogo />
          <p className='text-[12px] text-ink/45 mt-3 font-mono'>
            Ficium Internal Administration System
          </p>
        </div>

        <div className='bg-ink/80 rounded-2xl border border-ficium/[0.12] shadow-2xl overflow-hidden'>
          {/* Step indicator */}
          <div className='flex border-b border-ficium/[0.12]'>
            {(['credentials', 'mfa'] as const).map((s, i) => (
              <div
                key={s}
                className={[
                  'flex-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest transition-colors',
                  step === s ? 'bg-ficium/10 text-ficium border-b-2 border-ficium' : 'text-ink/30',
                ].join(' ')}
              >
                {i + 1}. {s === 'credentials' ? 'Credentials' : 'MFA'}
              </div>
            ))}
          </div>

          <div className='p-6'>
            {locked && (
              <div className='bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 mb-5 text-center'>
                <Lock className='w-5 h-5 text-red-400 mx-auto mb-1.5' aria-hidden />
                <p className='text-[12px] text-red-300 font-semibold'>Too many failed attempts</p>
                <p className='text-[11px] text-red-500 mt-0.5'>Contact your system administrator to unlock</p>
              </div>
            )}

            {step === 'credentials' && (
              <div className='space-y-4'>
                <div>
                  <label className='block text-[10px] font-bold text-ink/45 uppercase tracking-widest mb-1.5'>
                    Admin email
                  </label>
                  <div className='relative'>
                    <Mail className='w-3.5 h-3.5 text-ink/30 absolute left-3.5 top-1/2 -translate-y-1/2' aria-hidden />
                    <input
                      type='email'
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCredentials()}
                      placeholder='admin@ficium.mu'
                      disabled={locked}
                      autoComplete='username'
                      className={`${inputCls()} pl-9`}
                      aria-label='Admin email'
                    />
                  </div>
                </div>
                <div>
                  <label className='block text-[10px] font-bold text-ink/45 uppercase tracking-widest mb-1.5'>
                    Password
                  </label>
                  <div className='relative'>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCredentials()}
                      placeholder='••••••••••••'
                      disabled={locked}
                      autoComplete='current-password'
                      className={`${inputCls()} pr-9`}
                      aria-label='Password'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword(v => !v)}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60'
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className='text-[11px] text-red-400 bg-red-900/20 border border-red-900 rounded-lg px-3 py-2 font-mono'>
                    {error}
                    {attempts > 0 && ` (${attempts}/5 attempts)`}
                  </p>
                )}

                <button
                  onClick={handleCredentials}
                  disabled={loading || locked || !email || !password}
                  className='w-full bg-ficium hover:bg-ficium-deep disabled:opacity-40 text-white font-bold py-3 rounded-xl text-[13px] transition-colors flex items-center justify-center gap-2'
                >
                  {loading
                    ? <><span className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> Verifying…</>
                    : 'Continue to MFA'
                  }
                </button>
              </div>
            )}

            {step === 'mfa' && (
              <div className='space-y-4'>
                <div className='text-center mb-4'>
                  <div className='w-12 h-12 bg-ficium/10 border border-ficium/30 rounded-xl flex items-center justify-center mx-auto mb-3'>
                    <Shield className='w-6 h-6 text-ficium' aria-hidden />
                  </div>
                  <p className='text-[13px] text-ink/75 font-semibold'>Enter your authenticator code</p>
                  <p className='text-[11px] text-ink/45 mt-1'>6-digit TOTP from your authenticator app</p>
                </div>
                <input
                  type='text'
                  inputMode='numeric'
                  maxLength={6}
                  value={totp}
                  onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleMfa()}
                  placeholder='000000'
                  autoFocus
                  className={`${inputCls()} text-center text-[24px] tracking-[0.5em] py-4`}
                  aria-label='TOTP code'
                />

                {error && (
                  <p className='text-[11px] text-red-400 bg-red-900/20 border border-red-900 rounded-lg px-3 py-2 font-mono text-center'>
                    {error}
                  </p>
                )}

                <button
                  onClick={handleMfa}
                  disabled={loading || totp.length !== 6}
                  className='w-full bg-ficium hover:bg-ficium-deep disabled:opacity-40 text-white font-bold py-3 rounded-xl text-[13px] transition-colors flex items-center justify-center gap-2'
                >
                  {loading
                    ? <><span className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> Verifying…</>
                    : 'Verify & access admin'
                  }
                </button>
                <button
                  onClick={() => { setStep('credentials'); setTotp(''); setError(null) }}
                  className='w-full text-[11px] text-ink/30 hover:text-ink/60 transition-colors py-1'
                >
                  ← Back to credentials
                </button>
              </div>
            )}
          </div>
        </div>

        <p className='text-center text-[10px] text-ink/20 mt-6 font-mono'>
          FICIUM INTERNAL SYSTEM · v{import.meta.env.VITE_APP_VERSION ?? '0.0.0'} ·{' '}
          <a href='mailto:security@ficium.mu' className='text-ink/30 hover:text-ink/60'>
            security@ficium.mu
          </a>
        </p>
      </div>
    </div>
  )
}
