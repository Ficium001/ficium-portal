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

// ─── Auth / shared ────────────────────────────────────────────
const UnifiedLogin          = lazy(() => import('../shared/pages/UnifiedLogin'))
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
const InstitutionMarketplace = lazy(() => import('../institution/marketplace/pages/InstitutionMarketplace'))
const InstitutionBids        = lazy(() => import('../institution/bids/pages/InstitutionBids'))
const InstitutionApprovals   = lazy(() => import('../institution/approvals/pages/InstitutionApprovals'))
const InstitutionProducts    = lazy(() => import('../institution/products/pages/InstitutionProducts'))
const InstitutionWebhooks    = lazy(() => import('../institution/webhooks/pages/InstitutionWebhooks'))
const InstitutionAudit       = lazy(() => import('../institution/audit/pages/InstitutionAudit'))
const InstitutionSettings    = lazy(() => import('../institution/settings/pages/InstitutionSettings'))
const InstitutionUsers       = lazy(() => import('../institution/team/pages/InstitutionUsers'))

// ─── Admin pages ──────────────────────────────────────────────
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
import { useMyGroup } from '../admin/hooks/useAdmin'

function DashboardRouter() {
  const { data: myGroup, isLoading } = useMyGroup()
  if (isLoading) return <PageLoader />
  if (myGroup?.user_type === 'admin') return <S><AdminDashboard /></S>
  return <S><InstitutionDashboard /></S>
}

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────

export const router = createBrowserRouter([

  // ── Public ────────────────────────────────────────────────
  { path: '/',        element: <S><UnifiedLogin /></S> },
  { path: '/login',   element: <S><UnifiedLogin /></S> },
  { path: '/register',   element: <S><RegisterInstitution /></S>   },
  { path: '/pending',    element: <S><InstitutionPending /></S>    },
  { path: '/onboarding', element: <S><InstitutionOnboarding /></S> },

  // ── Protected — one shell for all user types ───────────────
  {
    element: <S><PortalRoute /></S>,
    children: [
      {
        element: <S><PortalShell /></S>,
        children: [
          // Shared entry point — resolves to correct dashboard
          { path: '/dashboard',    element: <DashboardRouter />               },

          // Institution pages
          { path: '/marketplace',  element: <S><InstitutionMarketplace /></S> },
          { path: '/bids',         element: <S><InstitutionBids /></S>        },
          { path: '/approvals',    element: <S><InstitutionApprovals /></S>   },
          { path: '/products',     element: <S><InstitutionProducts /></S>    },
          { path: '/webhooks',     element: <S><InstitutionWebhooks /></S>    },
          { path: '/audit',        element: <S><InstitutionAudit /></S>       },
          { path: '/settings',     element: <S><InstitutionSettings /></S>    },
          { path: '/team/users',   element: <S><InstitutionUsers /></S>      },

          // Admin pages
          { path: '/users',        element: <S><AdminUsers /></S>       },
          { path: '/groups',       element: <S><AdminGroups /></S>      },
          { path: '/institutions', element: <S><AdminInstitutions /></S> },
          { path: '/dual-control', element: <S><AdminDualControl /></S> },
          { path: '/sessions',     element: <S><AdminSessions /></S>    },
          { path: '/admin-audit',  element: <S><AdminAudit /></S>       },
          { path: '/system',       element: <S><AdminSystem /></S>      },
        ],
      },
    ],
  },

  // ── Legacy redirects ──────────────────────────────────────
  { path: '/admin/dashboard',    element: <Navigate to='/dashboard'    replace /> },
  { path: '/admin/users',        element: <Navigate to='/users'        replace /> },
  { path: '/admin/groups',       element: <Navigate to='/groups'       replace /> },
  { path: '/admin/roles',        element: <Navigate to='/groups'       replace /> },
  { path: '/admin/dual-control', element: <Navigate to='/dual-control' replace /> },
  { path: '/admin/sessions',     element: <Navigate to='/sessions'     replace /> },
  { path: '/admin/audit',        element: <Navigate to='/admin-audit'  replace /> },
  { path: '/admin/system',       element: <Navigate to='/system'       replace /> },
  { path: '/admin/login',        element: <Navigate to='/login'        replace /> },
])
