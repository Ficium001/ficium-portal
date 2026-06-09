// =============================================================
// Ficium 3 — Institution Route Guard
// Wraps all /institution/* routes.
// Checks:
//   1. User is authenticated
//   2. User has institution_user JWT claim
//   3. Institution is approved + not suspended
//   4. Module flag check for sub-routes (optional)
// =============================================================
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useMyInstitution, useMyRole } from '../hooks/useInstitution'
import institutionSupabase from '../lib/institutionSupabase'
import { useEffect, useState } from 'react'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function InstitutionRoute() {
  const location = useLocation()
  const [authState, setAuthState] = useState<AuthState>('loading')

  useEffect(() => {
    institutionSupabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState(session ? 'authenticated' : 'unauthenticated')
    })
  }, [])

  const { data: institution, isLoading: instLoading } = useMyInstitution()
  const { data: role, isLoading: roleLoading } = useMyRole()

  // ── Loading state
  if (authState === 'loading' || instLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-[#070a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-mono">Loading portal...</p>
        </div>
      </div>
    )
  }

  // ── Not authenticated
  if (authState === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // ── No institution membership
  if (!institution || !role) {
    return <Navigate to="/onboarding" replace />
  }

  // ── Institution suspended
  if (institution.suspended_at) {
    return (
      <div className="min-h-screen bg-[#070a0f] flex items-center justify-center p-6">
        <div className="bg-[#1c0000] border border-red-900 rounded-xl p-8 max-w-md text-center">
          <div className="text-red-400 text-4xl mb-4">⊘</div>
          <h2 className="text-red-300 font-mono font-bold text-lg mb-2">Institution suspended</h2>
          <p className="text-red-700 text-sm">
            {institution.suspension_reason || 'Your institution has been suspended. Contact support@ficium.mu'}
          </p>
        </div>
      </div>
    )
  }

  // ── Institution not yet approved — show onboarding status
  if (!institution.approved) {
    return <Navigate to="/pending" replace />
  }

  // ── All checks passed — render portal
  return <Outlet />
}
