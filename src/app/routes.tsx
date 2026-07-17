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
const InstitutionPipelines   = lazy(() => import('../institution/pipeline/pages/InstitutionPipelines').then(m => ({ default: m.InstitutionPipelines })))
const PipelineDetail         = lazy(() => import('../institution/pipeline/pages/PipelineDetail').then(m => ({ default: m.PipelineDetail })))
const InstitutionApprovals   = lazy(() => import('../institution/approvals/pages/InstitutionApprovals'))
const ApprovalChainsInbox    = lazy(() => import('../institution/approval-chains/pages/ApprovalChainsInbox'))
const EsignEnvelopes         = lazy(() => import('../institution/esign/pages/EsignEnvelopes'))
const SignCeremony           = lazy(() => import('../public/esign/pages/SignCeremony'))
const InstitutionProducts    = lazy(() => import('../institution/products/pages/InstitutionProducts'))
const InstitutionAudit       = lazy(() => import('../institution/audit/pages/InstitutionAudit'))
const InstitutionSettings    = lazy(() => import('../institution/settings/pages/InstitutionSettings'))
const InstitutionUsers       = lazy(() => import('../institution/team/pages/InstitutionUsers'))
const InstitutionDualControl = lazy(() => import('../institution/dual-control/pages/InstitutionDualControl'))

const InstitutionAnalytics     = lazy(() => import('../institution/analytics/pages/InstitutionAnalytics'))
const InstitutionNotifications = lazy(() => import('../institution/notifications/pages/InstitutionNotifications'))
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
import { useMyInstitution } from '@/institution/hooks/useInstitution'
import { MODULE_ENTITLEMENT_KEY } from '@/shared/lib/modules'

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
  const { data: myGroup, isLoading: groupLoading } = useMyGroup()
  const category         = moduleKey.startsWith('admin:') ? 'admin' : 'institution'
  const entitlementKey   = MODULE_ENTITLEMENT_KEY[moduleKey]
  const { data: myInstitution, isLoading: instLoading } = useMyInstitution({
    enabled: category === 'institution' && !!entitlementKey,
  })
  if (groupLoading || (category === 'institution' && !!entitlementKey && instLoading)) return <PageLoader />
  const permissions = myGroup?.module_permissions ?? []
  const isWildcard  = permissions.includes('*') && myGroup?.user_type === category
  const rbacAllowed = isWildcard || permissions.includes(moduleKey)
  // Institution-level pricing entitlement — separate from RBAC above.
  // A licensed module can still be off for this institution's plan.
  const entitled    = !entitlementKey || (myInstitution?.modules ?? []).includes(entitlementKey)
  if (!rbacAllowed || !entitled) return <Navigate to="/dashboard" replace />
  return <>{children}</>
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

          // Institution pages
          { path: '/marketplace',  element: <RequireModule moduleKey="inst:marketplace"><S><InstitutionMarketplace /></S></RequireModule> },
          { path: '/bids',         element: <RequireModule moduleKey="inst:bids"><S><InstitutionBids /></S></RequireModule> },
          { path: '/pipelines',    element: <RequireModule moduleKey="inst:pipeline"><S><InstitutionPipelines /></S></RequireModule> },
          { path: '/pipelines/:id',element: <RequireModule moduleKey="inst:pipeline"><S><PipelineDetail /></S></RequireModule> },
          { path: '/approvals',    element: <RequireModule moduleKey="inst:bid_approval"><S><InstitutionApprovals /></S></RequireModule> },
          { path: '/approval-chains', element: <RequireModule moduleKey="inst:approvals"><S><ApprovalChainsInbox /></S></RequireModule> },
          { path: '/esign',        element: <RequireModule moduleKey="inst:esign"><S><EsignEnvelopes /></S></RequireModule> },
          { path: '/products',     element: <RequireModule moduleKey="inst:products"><S><InstitutionProducts /></S></RequireModule> },
          { path: '/audit',        element: <RequireModule moduleKey="inst:audit"><S><InstitutionAudit /></S></RequireModule> },
          { path: '/settings',     element: <RequireModule moduleKey="inst:settings"><S><InstitutionSettings /></S></RequireModule> },
          { path: '/team/users',        element: <RequireModule moduleKey="inst:team"><S><InstitutionUsers /></S></RequireModule> },
          { path: '/inst-dual-control', element: <RequireModule moduleKey="inst:dual_control"><S><InstitutionDualControl /></S></RequireModule> },

          { path: '/analytics',    element: <RequireModule moduleKey="inst:analytics"><S><InstitutionAnalytics /></S></RequireModule> },
          { path: '/notifications',element: <RequireModule moduleKey="inst:notifications"><S><InstitutionNotifications /></S></RequireModule> },

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
