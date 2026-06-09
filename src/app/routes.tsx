import { lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { createBrowserRouter } from "react-router-dom";

// ── Auth ──────────────────────────────────────────────────────
const InstitutionLogin      = lazy(() => import("../institution/auth/pages/InstitutionLogin"));
const RegisterInstitution   = lazy(() => import("../institution/auth/pages/RegisterInstitution"));
const InstitutionPending    = lazy(() => import("../institution/auth/pages/InstitutionPending"));
const InstitutionOnboarding = lazy(() => import("../institution/auth/pages/InstitutionOnboarding"));

// ── Portal shell + pages ──────────────────────────────────────
const InstitutionPortalShell  = lazy(() => import("../institution/components/InstitutionPortalShell"));
const InstitutionDashboard    = lazy(() => import("../institution/dashboard/pages/InstitutionDashboard"));
const InstitutionMarketplace  = lazy(() => import("../institution/marketplace/pages/InstitutionMarketplace"));
const InstitutionBids         = lazy(() => import("../institution/bids/pages/InstitutionBids"));
const InstitutionApprovals    = lazy(() => import("../institution/approvals/pages/InstitutionApprovals"));
const InstitutionProducts     = lazy(() => import("../institution/products/pages/InstitutionProducts"));
const InstitutionWebhooks     = lazy(() => import("../institution/webhooks/pages/InstitutionWebhooks"));
const InstitutionAudit        = lazy(() => import("../institution/audit/pages/InstitutionAudit"));
const InstitutionSettings     = lazy(() => import("../institution/settings/pages/InstitutionSettings"));

// ── Route guard ───────────────────────────────────────────────
const InstitutionRoute = lazy(() => import("../institution/components/InstitutionRoute"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-ficium border-t-transparent animate-spin" />
    </div>
  );
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { errored: boolean }> {
  state = { errored: false };
  static getDerivedStateFromError() { return { errored: true }; }
  componentDidCatch(err: Error, _info: ErrorInfo) {
    const isChunk = err.message.includes("Failed to fetch dynamically imported module")
      || err.message.includes("Importing a module script failed")
      || err.name === "ChunkLoadError";
    if (isChunk && !sessionStorage.getItem("chunk_reload")) {
      sessionStorage.setItem("chunk_reload", "1");
      window.location.reload();
    }
  }
  render() {
    if (this.state.errored) {
      return (
        <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-ink font-semibold">Something went wrong loading this page.</p>
          <button
            onClick={() => { sessionStorage.removeItem("chunk_reload"); window.location.reload(); }}
            className="px-4 py-2 bg-ficium text-white rounded-xl text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function S({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}

export const router = createBrowserRouter([
  // ── Public auth ─────────────────────────────────────────────
  { path: "/",           element: <S><InstitutionLogin /></S> },
  { path: "/login",      element: <S><InstitutionLogin /></S> },
  { path: "/register",   element: <S><RegisterInstitution /></S> },
  { path: "/pending",    element: <S><InstitutionPending /></S> },
  { path: "/onboarding", element: <S><InstitutionOnboarding /></S> },

  // ── Protected portal ────────────────────────────────────────
  {
    element: <S><InstitutionRoute /></S>,
    children: [
      {
        element: <S><InstitutionPortalShell /></S>,
        children: [
          { path: "/dashboard",   element: <S><InstitutionDashboard /></S>   },
          { path: "/marketplace", element: <S><InstitutionMarketplace /></S> },
          { path: "/bids",        element: <S><InstitutionBids /></S>        },
          { path: "/approvals",   element: <S><InstitutionApprovals /></S>   },
          { path: "/products",    element: <S><InstitutionProducts /></S>    },
          { path: "/webhooks",    element: <S><InstitutionWebhooks /></S>    },
          { path: "/audit",       element: <S><InstitutionAudit /></S>       },
          { path: "/settings",    element: <S><InstitutionSettings /></S>    },
        ],
      },
    ],
  },
]);
