/**
 * @module app/routes
 * @description
 *   Single-page application router for Ficium Portal.
 *
 *   One URL (portal.ficium.net), multiple user types:
 *     / or /login  →  UnifiedLogin  →  detects user type  →  redirects
 *     institution analyst/admin  →  /dashboard, /marketplace, etc.
 *     Ficium internal admin      →  /admin/dashboard, /admin/users, etc.
 *
 *   Route guards:
 *     InstitutionRoute  — checks auth + institution membership + approval status
 *     AdminRoute        — checks auth + admin_users record + account status
 *
 *   All routes are code-split (lazy). A ChunkErrorBoundary handles
 *   stale-chunk errors on deploy by reloading once.
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { lazy, Suspense, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'

// ─── Shared / unified ─────────────────────────────────────────
const UnifiedLogin = lazy(() => import('../shared/pages/UnifiedLogin'))

// ─── Institution auth ─────────────────────────────────────────
const RegisterInstitution   = lazy(() => import('../institution/auth/pages/RegisterInstitution'))
const InstitutionPending    = lazy(() => import('../institution/auth/pages/InstitutionPending'))
const InstitutionOnboarding = lazy(() => import('../institution/auth/pages/InstitutionOnboarding'))

// ─── Institution portal ───────────────────────────────────────
const InstitutionRoute       = lazy(() => import('../institution/components/InstitutionRoute'))
const InstitutionPortalShell = lazy(() => import('../institution/components/InstitutionPortalShell'))
const InstitutionDashboard   = lazy(() => import('../institution/dashboard/pages/InstitutionDashboard'))
const InstitutionMarketplace = lazy(() => import('../institution/marketplace/pages/InstitutionMarketplace'))
const InstitutionBids        = lazy(() => import('../institution/bids/pages/InstitutionBids'))
const InstitutionApprovals   = lazy(() => import('../institution/approvals/pages/InstitutionApprovals'))
const InstitutionProducts    = lazy(() => import('../institution/products/pages/InstitutionProducts'))
const InstitutionWebhooks    = lazy(() => import('../institution/webhooks/pages/InstitutionWebhooks'))
const InstitutionAudit       = lazy(() => import('../institution/audit/pages/InstitutionAudit'))
const InstitutionSettings    = lazy(() => import('../institution/settings/pages/InstitutionSettings'))

// ─── Admin portal ─────────────────────────────────────────────
const AdminRoute       = lazy(() => import('../admin/components/AdminRoute'))
const AdminPortalShell = lazy(() => import('../admin/components/AdminPortalShell'))
const AdminDashboard   = lazy(() => import('../admin/dashboard/pages/AdminDashboard'))
const AdminUsers       = lazy(() => import('../admin/users/pages/AdminUsers'))
const AdminGroups      = lazy(() => import('../admin/groups/pages/AdminGroups'))
const AdminDualControl = lazy(() => import('../admin/dual-control/pages/AdminDualControl'))
const AdminSessions    = lazy(() => import('../admin/sessions/pages/AdminSessions'))
const AdminAudit       = lazy(() => import('../admin/audit/pages/AdminAudit'))
const AdminSystem      = lazy(() => import('../admin/system/pages/AdminSystem'))

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure
// ─────────────────────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className='min-h-screen bg-cream flex items-center justify-center'>
      <div className='w-8 h-8 rounded-full border-2 border-ficium border-t-transparent animate-spin' aria-label='Loading' />
    </div>
  )
}

class ChunkErrorBoundary extends Component<
  { children: ReactNode },
  { errored: boolean }
> {
  state = { errored: false }

  static getDerivedStateFromError() {
    return { errored: true }
  }

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
        <div className='min-h-screen bg-cream flex flex-col items-center justify-center gap-4 px-6 text-center'>
          <p className='text-ink font-semibold'>Something went wrong loading this page.</p>
          <button
            onClick={() => {
              sessionStorage.removeItem('chunk_reload')
              window.location.reload()
            }}
            className='px-4 py-2 bg-ficium text-white rounded-xl text-sm font-semibold'
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/** Wraps every route in lazy + error boundary. */
function S({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([

  // ── Unified entry point ────────────────────────────────────────────────────
  // One login page for all user types. After auth, detects role and redirects.
  { path: '/',      element: <S><UnifiedLogin /></S> },
  { path: '/login', element: <S><UnifiedLogin /></S> },

  // Legacy admin login redirect → unified login
  { path: '/admin/login', element: <Navigate to='/login' replace /> },
  // Legacy roles redirect → groups
  { path: '/admin/roles', element: <Navigate to='/admin/groups' replace /> },

  // ── Institution public ─────────────────────────────────────────────────────
  { path: '/register',   element: <S><RegisterInstitution /></S>   },
  { path: '/pending',    element: <S><InstitutionPending /></S>    },
  { path: '/onboarding', element: <S><InstitutionOnboarding /></S> },

  // ── Institution protected ──────────────────────────────────────────────────
  // InstitutionRoute checks: auth + institution membership + approved status
  {
    element: <S><InstitutionRoute /></S>,
    children: [
      {
        element: <S><InstitutionPortalShell /></S>,
        children: [
          { path: '/dashboard',   element: <S><InstitutionDashboard /></S>   },
          { path: '/marketplace', element: <S><InstitutionMarketplace /></S> },
          { path: '/bids',        element: <S><InstitutionBids /></S>        },
          { path: '/approvals',   element: <S><InstitutionApprovals /></S>   },
          { path: '/products',    element: <S><InstitutionProducts /></S>    },
          { path: '/webhooks',    element: <S><InstitutionWebhooks /></S>    },
          { path: '/audit',       element: <S><InstitutionAudit /></S>       },
          { path: '/settings',    element: <S><InstitutionSettings /></S>    },
        ],
      },
    ],
  },

  // ── Admin protected ────────────────────────────────────────────────────────
  // AdminRoute checks: auth + admin_users record + account status
  {
    element: <S><AdminRoute /></S>,
    children: [
      {
        element: <S><AdminPortalShell /></S>,
        children: [
          { path: '/admin/dashboard',    element: <S><AdminDashboard /></S>   },
          { path: '/admin/users',        element: <S><AdminUsers /></S>       },
          { path: '/admin/groups',       element: <S><AdminGroups /></S>      },
          { path: '/admin/dual-control', element: <S><AdminDualControl /></S> },
          { path: '/admin/sessions',     element: <S><AdminSessions /></S>    },
          { path: '/admin/audit',        element: <S><AdminAudit /></S>       },
          { path: '/admin/system',       element: <S><AdminSystem /></S>      },
        ],
      },
    ],
  },
])
