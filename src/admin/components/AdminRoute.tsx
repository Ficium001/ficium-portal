/**
 * @component AdminRoute
 * @description Route guard for all /admin/* protected pages.
 * Uses the same detect_portal_user_type RPC as UnifiedLogin
 * to avoid RLS 403s on cross-schema table queries.
 * @owner Ficium Engineering
 */
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../../shared/lib/supabase'

type State = 'loading' | 'ok' | 'unauthed' | 'no_admin' | 'locked'

function Spinner() {
  return (
    <div className='min-h-screen bg-ink flex items-center justify-center'>
      <div className='w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin' aria-label='Loading' />
    </div>
  )
}

export default function AdminRoute() {
  const location = useLocation()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let cancelled = false
    async function check() {
      // Get session from shared auth client
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (!cancelled) setState('unauthed'); return }

      // Use RPC to check user type — avoids RLS 403 on direct table queries
      const { data: userType } = await supabase
        .rpc('detect_portal_user_type', { p_auth_user_id: session.user.id })

      if (userType !== 'admin') {
        if (!cancelled) setState('no_admin')
        return
      }

      if (!cancelled) setState('ok')
    }
    check()
    return () => { cancelled = true }
  }, [location.pathname])

  if (state === 'loading')  return <Spinner />
  // Redirect to unified login — not /admin/login (which would loop)
  if (state === 'unauthed') return <Navigate to='/login' state={{ from: location }} replace />
  if (state === 'no_admin') return <Navigate to='/login' replace />
  if (state === 'locked')   return (
    <div className='min-h-screen bg-ink flex items-center justify-center p-6'>
      <div className='bg-white border border-red-200 rounded-2xl p-8 max-w-sm text-center shadow-card'>
        <div className='text-red-400 text-4xl mb-4'>⊘</div>
        <h2 className='text-red-300 font-black text-[18px] mb-2'>Account locked</h2>
        <p className='text-red-600 text-[12px]'>
          Contact <a href='mailto:security@ficium.mu' className='underline text-red-400'>security@ficium.mu</a>
        </p>
      </div>
    </div>
  )

  return <Outlet />
}
