/**
 * @module app/routes
 * @description
 *   Single portal router. One shell, one route guard, flat paths.
 *   All user types (admin, institution) use the same PortalShell.
 *   Nav items are filtered from MODULE_CATALOGUE by group permissions.
 *
 *   / or /login  →  UnifiedLogin  →  detects user type  →  /dashboard
 *
 * @owner Ficium Engineering
 */

import { lazy, Suspense, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ROUTES } from './registry'

// ─── Auth / shared ────────────────────────────────────────────
const UnifiedLogin          = lazy(() => import('../shared/pages/UnifiedLogin'))
const ResetPassword         = lazy(() => import('../shared/pages/ResetPassword'))
const PortalRoute           = lazy(() => import('../shared/components/PortalRoute'))
const PortalShell           = lazy(() => import('../shared/components/PortalShell'))

// ─── Registration / onboarding ────────────────────────────────
const RegisterInstitution   = lazy(() => import('../institution/auth/pages/RegisterInstitution'))
const InstitutionPending    = lazy(() => import('../institution/auth/pages/InstitutionPending'))
const InstitutionOnboarding = lazy(() => import('../institution/auth/pages/InstitutionOnboarding'))

// ─── Dashboard ────────────────────────────────────────────────
// Admin and institution each have their own dashboard page.
// PortalShell renders the correct one based on group.user_type
// via the /dashboard route — AdminDashboard for admin users,
// InstitutionDashboard for institution users.
// Resolved by a thin DashboardRouter component below.
const AdminDashboard        = lazy(() => import('../admin/dashboard/pages/AdminDashboard'))
const InstitutionDashboard  = lazy(() => import('../institution/dashboard/pages/InstitutionDashboard'))

// ─── Institution pages ────────────────────────────────────────
const SignCeremony           = lazy(() => import('../public/esign/pages/SignCeremony'))

const AdminUsers       = lazy(() => import('../admin/users/pages/AdminUsers'))
const AdminGroups      = lazy(() => import('../admin/groups/pages/AdminGroups'))
const AdminInstitutions = lazy(() => import('../admin/institutions/pages/AdminInstitutions'))
const AdminDualControl = lazy(() => import('../admin/dual-control/pages/AdminDualControl'))
const AdminSessions    = lazy(() => import('../admin/sessions/pages/AdminSessions'))
const AdminAudit       = lazy(() => import('../admin/audit/pages/AdminAudit'))
const AdminSystem      = lazy(() => import('../admin/system/pages/AdminSystem'))

// ─────────────────────────────────────────────────────────────
// Infrastructure
// ─────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className='min-h-screen bg-[#f5f4f8] flex items-center justify-center'>
      <div className='w-8 h-8 rounded-full border-2 border-ficium border-t-transparent animate-spin' aria-label='Loading' />
    </div>
  )
}

class ChunkErrorBoundary extends Component<
  { children: ReactNode },
  { errored: boolean }
> {
  state = { errored: false }
  static getDerivedStateFromError() { return { errored: true } }
  componentDidCatch(err: Error, _info: ErrorInfo) {
    const isChunk =
      err.message.includes('Failed to fetch dynamically imported module') ||
      err.message.includes('Importing a module script failed') ||
      err.name === 'ChunkLoadError'
    if (isChunk && !sessionStorage.getItem('chunk_reload')) {
      sessionStorage.setItem('chunk_reload', '1')
      window.location.reload()
    }
  }
  render() {
    if (this.state.errored) {
      return (
        <div className='min-h-screen bg-[#f5f4f8] flex flex-col items-center justify-center gap-4 px-6 text-center'>
          <p className='text-ink font-semibold'>Something went wrong loading this page.</p>
          <button onClick={() => { sessionStorage.removeItem('chunk_reload'); window.location.reload() }}
            className='px-4 py-2 bg-ficium text-white rounded-xl text-sm font-semibold'>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function S({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}

// ─── Dashboard router — resolves correct dashboard by user type
import { useMyGroup } from '@/admin/hooks/useAdmin'
import { useModuleAccess } from '@/shared/hooks/useModuleAccess'

const InstitutionAdminDashboard = lazy(() => import('../institution/dashboard/pages/InstitutionAdminDashboard'))

function DashboardRouter() {
  const { data: myGroup, isLoading } = useMyGroup()
  if (isLoading) return <PageLoader />
  if (myGroup?.user_type === 'admin') return <S><AdminDashboard /></S>
  // Institution split — marketplace access = trading dashboard, otherwise admin dashboard
  const permissions    = myGroup?.module_permissions ?? []
  const hasMarketplace = permissions.includes('*') || permissions.includes('inst:marketplace')
  if (hasMarketplace) return <S><InstitutionDashboard /></S>
  return <S><InstitutionAdminDashboard /></S>
}

// ─── Route-level module permission guard ──────────────────────
// Checks that the user's group includes the required module key.
// If not, redirects to /dashboard silently.

function RequireModule({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  // Same rule as useModuleAccess (RBAC + pricing entitlement); this wrapper
  // just chooses the route-level response — redirect rather than hide.
  const { allowed, isLoading } = useModuleAccess(moduleKey)
  if (isLoading) return <PageLoader />
  if (!allowed) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────

export const router = createBrowserRouter([

  // ── Public ────────────────────────────────────────────────
  { path: '/',        element: <S><UnifiedLogin /></S> },
  { path: '/login',   element: <S><UnifiedLogin /></S> },
  { path: '/reset-password', element: <S><ResetPassword /></S> },
  { path: '/register',   element: <S><RegisterInstitution /></S>   },
  { path: '/pending',    element: <S><InstitutionPending /></S>    },
  { path: '/onboarding', element: <S><InstitutionOnboarding /></S> },
  { path: '/sign/:token', element: <S><SignCeremony /></S> },

  // ── Protected — one shell for all user types ───────────────
  {
    element: <S><PortalRoute /></S>,
    children: [
      {
        element: <S><PortalShell /></S>,
        children: [
          // Shared entry point — resolves to correct dashboard
          { path: '/dashboard',    element: <DashboardRouter />               },

          // Institution pages — contributed by modules (app/registry)
          ...ROUTES.map(({ path, moduleKey, element }) => ({
            path,
            element: moduleKey
              ? <RequireModule moduleKey={moduleKey}><S>{element}</S></RequireModule>
              : <S>{element}</S>,
          })),

          // Admin pages
          { path: '/users',        element: <RequireModule moduleKey="admin:users"><S><AdminUsers /></S></RequireModule> },
          { path: '/groups',       element: <RequireModule moduleKey="admin:groups"><S><AdminGroups /></S></RequireModule> },
          { path: '/institutions', element: <RequireModule moduleKey="admin:institutions"><S><AdminInstitutions /></S></RequireModule> },
          { path: '/dual-control', element: <RequireModule moduleKey="admin:dual_control"><S><AdminDualControl /></S></RequireModule> },
          { path: '/sessions',     element: <RequireModule moduleKey="admin:sessions"><S><AdminSessions /></S></RequireModule> },
          { path: '/admin-audit',  element: <RequireModule moduleKey="admin:audit"><S><AdminAudit /></S></RequireModule> },
          { path: '/system',       element: <RequireModule moduleKey="admin:system"><S><AdminSystem /></S></RequireModule> },
        ],
      },
    ],
  },
])
