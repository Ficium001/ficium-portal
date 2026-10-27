/**
 * @page ResetPassword
 * @route /reset-password?token=…
 * @access public (the single-use token is the credential)
 * @description
 *   Landing page for the reset link that ficium-auth emails. There is still no
 *   public "Forgot password" form in the portal: institution members are reset
 *   by their admins under dual control. This page only completes a reset that
 *   ficium-auth has already sent to the account's own email.
 *
 *   The token is moved out of the address bar on load (history, screenshots,
 *   shoulder-surfing) and kept in memory; ficium-auth enforces the password
 *   policy, single use, expiry, and signs out every existing session.
 * @owner Ficium Engineering
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, CheckCircle } from 'lucide-react'
import { AUTH_URL } from '@/shared/lib/ficiumAuth'

const RULES = 'At least 12 characters, with upper and lower case letters, a number and a symbol.'

export default function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => { if (window.location.search) window.history.replaceState(null, '', '/reset-password') }, [])

  const strongEnough = pw.length >= 12 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const res = await fetch(`${AUTH_URL}/auth/password/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pw }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'The link is invalid or has expired. Ask for a new one.')
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  return (
    <div className='min-h-screen bg-cream flex items-center justify-center p-6'>
      <div className='bg-white rounded-2xl shadow-card p-10 max-w-md w-full'>
        {done ? (
          <div className='text-center'>
            <div className='w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
              <CheckCircle className='w-8 h-8 text-green-600' aria-hidden />
            </div>
            <h1 className='font-display text-2xl font-bold text-ink mb-2'>Password set</h1>
            <p className='text-muted mb-6'>You've been signed out everywhere. Sign in with your new password.</p>
            <Link to='/login' className='inline-block bg-ficium text-white font-bold py-3 px-6 rounded-xl hover:bg-ficium-deep transition-colors'>Go to sign in</Link>
          </div>
        ) : !token ? (
          <div className='text-center'>
            <h1 className='font-display text-2xl font-bold text-ink mb-2'>Link incomplete</h1>
            <p className='text-muted'>Open the link from your email exactly as sent, or ask for a new one.</p>
          </div>
        ) : (
          <form onSubmit={submit} className='space-y-4'>
            <div className='w-14 h-14 bg-ficium/10 rounded-2xl flex items-center justify-center mx-auto'>
              <KeyRound className='w-7 h-7 text-ficium' aria-hidden />
            </div>
            <h1 className='font-display text-2xl font-bold text-ink text-center'>Choose a new password</h1>
            <p className='text-sm text-muted text-center'>{RULES}</p>
            <div>
              <label htmlFor='pw' className='block text-sm font-semibold text-ink mb-1'>New password</label>
              <input id='pw' type='password' autoComplete='new-password' value={pw} onChange={(e) => setPw(e.target.value)}
                className='w-full border border-line rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-ficium' required autoFocus />
            </div>
            <div>
              <label htmlFor='pw2' className='block text-sm font-semibold text-ink mb-1'>Repeat it</label>
              <input id='pw2' type='password' autoComplete='new-password' value={pw2} onChange={(e) => setPw2(e.target.value)}
                className='w-full border border-line rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-ficium' required />
              {pw2 && pw !== pw2 && <p className='text-sm text-bad mt-1'>The passwords don't match.</p>}
            </div>
            {err && <p className='text-sm text-bad' role='alert'>{err}</p>}
            <button disabled={busy || !strongEnough || pw !== pw2}
              className='w-full bg-ficium text-white font-bold py-3 rounded-xl hover:bg-ficium-deep transition-colors disabled:opacity-50'>
              {busy ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
