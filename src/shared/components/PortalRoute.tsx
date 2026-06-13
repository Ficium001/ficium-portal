import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getValidAccessToken, getTokenPayload } from '../lib/ficiumAuth'
import { supabase } from '../lib/supabase'

type State = 'loading' | 'ok' | 'unauthed' | 'no_access' | 'suspended' | 'pending'

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
  const [suspendReason, setSuspendReason] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      const token = await getValidAccessToken()
      if (!token) { if (!cancelled) setState('unauthed'); return }

      const payload = getTokenPayload()
      if (!payload) { if (!cancelled) setState('unauthed'); return }

      const role       = payload['user_role'] as string | undefined
      const instId     = payload['institution_id'] as string | undefined

      // Ficium admin — full access
      if (role === 'admin' && !instId) {
        if (!cancelled) setState('ok')
        return
      }

      // Institution user — check approval + suspension via Supabase DB
      if (instId) {
        const { data: inst } = await supabase
          .schema('institution')
          .from('institutions')
          .select('approved, suspended_at, suspension_reason')
          .eq('id', instId)
          .maybeSingle()

        if (!inst) { if (!cancelled) setState('no_access'); return }
        if (inst.suspended_at) {
          if (!cancelled) { setSuspendReason(inst.suspension_reason ?? ''); setState('suspended') }
          return
        }
        if (!inst.approved) { if (!cancelled) setState('pending'); return }
        if (!cancelled) setState('ok')
        return
      }

      if (!cancelled) setState('no_access')
    }
    check()
    return () => { cancelled = true }
  }, [location.pathname])

  if (state === 'loading')   return <Spinner />
  if (state === 'unauthed')  return <Navigate to='/login' state={{ from: location }} replace />
  if (state === 'pending')   return <Navigate to='/pending' replace />
  if (state === 'no_access') return <Navigate to='/login' replace />

  if (state === 'suspended') return (
    <div className='min-h-screen bg-[#f5f4f8] flex items-center justify-center p-6'>
      <div className='bg-white border border-red-200 rounded-2xl p-8 max-w-sm text-center shadow-card'>
        <div className='text-4xl mb-4'>⊘</div>
        <h2 className='font-display font-bold text-[18px] text-red-600 mb-2'>Institution suspended</h2>
        <p className='text-[13px] text-muted'>
          {suspendReason || 'Your institution has been suspended. Contact support@ficium.mu'}
        </p>
      </div>
    </div>
  )

  return <Outlet />
}
