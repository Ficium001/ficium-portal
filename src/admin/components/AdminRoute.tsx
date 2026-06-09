/**
 * @component AdminRoute
 * @description Route guard for all /admin/* protected pages.
 * @owner Ficium Engineering
 */
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import adminDb from '../lib/adminSupabase'

type State = 'loading' | 'ok' | 'unauthed' | 'no_admin' | 'locked'

function Spinner() {
  return (
    <div className='min-h-screen bg-[#0a0d14] flex items-center justify-center'>
      <div className='w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin' aria-label='Loading' />
    </div>
  )
}

export default function AdminRoute() {
  const location = useLocation()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session } } = await adminDb.auth.getSession()
      if (!session) { if (!cancelled) setState('unauthed'); return }

      const { data: admin } = await adminDb
        .from('admin_users')
        .select('id, status')
        .eq('auth_user_id', session.user.id)
        .single()

      if (!admin) { if (!cancelled) setState('no_admin'); return }
      if (['locked','suspended','deactivated'].includes(admin.status)) {
        if (!cancelled) setState('locked'); return
      }

      await adminDb
        .from('admin_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('admin_user_id', admin.id)
        .eq('is_active', true)

      if (!cancelled) setState('ok')
    }
    check()
    return () => { cancelled = true }
  }, [location.pathname])

  if (state === 'loading')  return <Spinner />
  if (state === 'unauthed') return <Navigate to='/admin/login' state={{ from: location }} replace />
  if (state === 'no_admin') return <Navigate to='/admin/login' replace />
  if (state === 'locked')   return (
    <div className='min-h-screen bg-[#0a0d14] flex items-center justify-center p-6'>
      <div className='bg-red-900/20 border border-red-800 rounded-2xl p-8 max-w-sm text-center'>
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
