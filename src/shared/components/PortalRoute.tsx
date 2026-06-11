/**
 * @component PortalRoute
 * @description
 *   Route guard — checks ficium-auth session (sessionStorage token).
 *   Decodes JWT claims for role/institution without a network call.
 *   Falls back to /login if no valid token found.
 *
 * @owner Ficium Engineering
 */

import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { hasSession, getTokenPayload, getValidAccessToken } from '../lib/ficiumAuth'

type State = 'loading' | 'ok' | 'unauthed'

function Spinner() {
  return (
    <div className='min-h-screen bg-[#f5f4f8] flex items-center justify-center'>
      <div className='text-center'>
        <div className='w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin mx-auto mb-3' aria-label='Loading' />
        <p className='text-[13px] text-muted font-mono'>Loading portal…</p>
      </div>
    </div>
  )
}

export default function PortalRoute() {
  const location = useLocation()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let cancelled = false
    async function check() {
      // Quick check — token in sessionStorage
      if (!hasSession()) {
        if (!cancelled) setState('unauthed')
        return
      }
      // Validate/refresh token
      const token = await getValidAccessToken()
      if (!token) {
        if (!cancelled) setState('unauthed')
        return
      }
      // Decode claims
      const payload = getTokenPayload()
      if (!payload || !payload.sub) {
        if (!cancelled) setState('unauthed')
        return
      }
      if (!cancelled) setState('ok')
    }
    check()
    return () => { cancelled = true }
  }, [location.pathname])

  if (state === 'loading')  return <Spinner />
  if (state === 'unauthed') return <Navigate to='/login' state={{ from: location }} replace />

  return <Outlet />
}
