// =============================================================
// Ficium 3 — Institution Portal Shell
// Matches the individual app design system:
//   cream background, ink text, ficium brand colour,
//   Ficium logo, Inter Tight + Bricolage Grotesque fonts.
// =============================================================
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Store, FileText, Clock,
  Webhook, Package, ScrollText, Settings,
  LogOut, ChevronRight, Bell,
} from "lucide-react";
import { useMyInstitution, useMyRole, usePendingActions } from "../hooks/useInstitution";
import institutionSupabase from "../lib/institutionSupabase";
import type { PortalSection } from "../types/institution";

interface NavItem {
  section: PortalSection;
  label:   string;
  path:    string;
  icon:    React.ElementType;
  module?: string;
  badge?:  number;
}

const DEPLOY_LABELS: Record<string, string> = {
  saas:    "SaaS",
  paas:    "PaaS",
  on_prem: "On-Prem",
};

export default function InstitutionPortalShell() {
  const navigate = useNavigate();
  const { data: institution }    = useMyInstitution();
  const { data: role }           = useMyRole();
  const { data: pendingActions } = usePendingActions();

  const modules:      string[] = institution?.modules ?? [];
  const pendingCount: number   = pendingActions?.length ?? 0;

  const NAV_ITEMS: NavItem[] = [
    { section: "dashboard",       label: "Dashboard",   path: "/dashboard",             icon: LayoutDashboard },
    { section: "marketplace",     label: "Marketplace", path: "/marketplace",  icon: Store,    module: "marketplace" },
    { section: "my-bids",         label: "My bids",     path: "/bids",         icon: FileText, module: "marketplace" },
    { section: "pending-actions", label: "Approvals",   path: "/approvals",    icon: Clock,    badge: pendingCount   },
    { section: "products",        label: "Products",    path: "/products",     icon: Package   },
    { section: "webhooks",        label: "Webhooks",    path: "/webhooks",     icon: Webhook   },
    { section: "audit",           label: "Audit log",   path: "/audit",        icon: ScrollText },
    { section: "settings",        label: "Settings",    path: "/settings",     icon: Settings  },
  ];

  const visibleNav = NAV_ITEMS.filter(
    item => !item.module || modules.includes(item.module)
  );

  const handleSignOut = async () => {
    await institutionSupabase.auth.signOut();
    navigate("/login");
  };

  const deployLabel =
    DEPLOY_LABELS[institution?.deployment_model ?? "saas"] ?? "SaaS";

  return (
    <div className="flex h-screen bg-cream text-ink font-body overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-60 bg-white border-r border-ink/[0.07] flex flex-col flex-shrink-0 shadow-sm">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-ink/[0.07]">
          <div className="flex items-center gap-3">
            <FLogo size={26} className="text-ficium" />
            <div className="min-w-0">
              <span className="font-display text-[15px] font-bold text-ink tracking-tight">
                Ficium
              </span>
              <div className="text-[11px] font-semibold text-ficium truncate mt-0.5">
                {institution?.name ?? "Institution"}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-3 mb-1">
            <p className="text-[9px] font-bold text-ink/25 uppercase tracking-[0.12em] px-2 mb-1">
              Portal
            </p>
          </div>
          {visibleNav.map(item => (
            <NavLink
              key={item.section}
              to={item.path}
              end={item.path === "/dashboard"}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-ficium/10 text-ficium font-semibold"
                    : "text-ink/50 hover:text-ink hover:bg-ink/[0.04]"
                }`
              }
            >
              <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="bg-ficium text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-ink/[0.07] p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-ficium flex items-center justify-center flex-shrink-0">
              <span className="text-[12px] font-bold text-white">
                {(institution?.primary_contact_name ?? institution?.name ?? "I")[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink truncate">
                {institution?.primary_contact_name ?? institution?.name ?? "User"}
              </div>
              <div className="text-[10px] text-muted capitalize">{role?.role ?? "member"}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-[12px] text-muted hover:text-red-500 transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="h-14 bg-white border-b border-ink/[0.07] flex items-center justify-between px-6 flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[13px] text-muted">
            <FLogo size={14} className="text-ficium" />
            <span>Ficium</span>
            <ChevronRight className="w-3.5 h-3.5 text-ink/20" />
            <span className="text-ink font-medium">
              {institution?.name ?? "Institution portal"}
            </span>
            <span className="ml-2 text-[10px] bg-ficium/10 text-ficium font-semibold px-2 py-0.5 rounded-full">
              {deployLabel}
            </span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {institution?.approved && (
              <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Active
              </span>
            )}
            {/* Notification bell */}
            <button className="relative w-8 h-8 rounded-xl hover:bg-ink/[0.04] flex items-center justify-center transition-colors text-muted hover:text-ink">
              <Bell className="w-4 h-4" />
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1 bg-ficium text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-cream">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ── Ficium Logo — same SVG as main app ── */
function FLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M28 18 H72 C75 18 76 21 74 24 L62 38 H44 V52 H58 C61 52 62 55 60 58 L52 68 H44 V82 C44 85 41 86 38 84 L26 76 C24 75 24 73 24 71 V22 C24 19 26 18 28 18 Z"
        fill="currentColor"
      />
    </svg>
  );
}
