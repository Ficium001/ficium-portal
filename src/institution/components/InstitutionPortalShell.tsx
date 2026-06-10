/**
 * @component InstitutionPortalShell
 * @description
 *   Root layout for the institution portal. Wraps all protected pages.
 *   Renders the persistent sidebar, top bar, and a status bar strip.
 *
 *   Bank-grade additions vs v1:
 *     - SessionGuard: tracks idle time, warns at 4 min, forces sign-out
 *       at 5 min. Resets on any mousemove/keydown.
 *     - ConnectionIndicator: polls Supabase realtime ping; shows
 *       CONNECTED / RECONNECTING / OFFLINE in the status bar.
 *     - Status bar: always-visible strip showing session time remaining,
 *       role, institution ID, and connection state.
 *     - Keyboard shortcuts: G+D → Dashboard, G+M → Marketplace,
 *       G+B → Bids, G+A → Approvals (vim-style two-key navigation).
 *     - Sidebar collapse (Ctrl+B) for dense analyst workflow.
 *     - Pending-action badge auto-polls every 60 s.
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import {
  useEffect, useRef, useState, useCallback,
} from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Store, FileText, Clock,
  Webhook, Package, ScrollText, Settings,
  LogOut, ChevronRight, Bell, PanelLeftClose, PanelLeftOpen,
  Wifi, WifiOff, AlertTriangle, Shield,
} from "lucide-react";
import {
  useMyInstitution, useMyRole, usePendingActions,
} from "../hooks/useInstitution";
import institutionSupabase from "../lib/institutionSupabase";
import type { PortalSection } from "../types/institution";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Idle warning threshold (ms). */
const IDLE_WARN_MS   = 4 * 60 * 1000;   // 4 minutes
/** Forced sign-out threshold (ms). */
const IDLE_LOGOUT_MS = 5 * 60 * 1000;   // 5 minutes
/** Connection ping interval (ms). */
const PING_MS        = 30 * 1000;        // 30 seconds

const DEPLOY_LABELS: Record<string, string> = {
  saas:    "SaaS",
  paas:    "PaaS",
  on_prem: "On-Prem",
};

// ─────────────────────────────────────────────────────────────────────────────
// Ficium logo
// ─────────────────────────────────────────────────────────────────────────────

function FLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M28 18 H72 C75 18 76 21 74 24 L62 38 H44 V52 H58 C61 52 62 55 60 58 L52 68 H44 V82 C44 85 41 86 38 84 L26 76 C24 75 24 73 24 71 V22 C24 19 26 18 28 18 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// useSessionGuard — idle timeout with warn + force sign-out
// ─────────────────────────────────────────────────────────────────────────────

function useSessionGuard(onSignOut: () => void) {
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivity = useRef(Date.now());

  const reset = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleWarning(false);
  }, []);

  useEffect(() => {
    const events = ["mousemove", "keydown", "pointerdown", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LOGOUT_MS) {
        onSignOut();
      } else if (idle >= IDLE_WARN_MS) {
        setIdleWarning(true);
      } else {
        setIdleWarning(false);
      }
    }, 10_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      clearInterval(tick);
    };
  }, [onSignOut, reset]);

  return { idleWarning, reset };
}

// ─────────────────────────────────────────────────────────────────────────────
// useConnectionStatus — pings Supabase to detect network issues
// ─────────────────────────────────────────────────────────────────────────────

type ConnStatus = "connected" | "reconnecting" | "offline";

function useConnectionStatus(): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>("connected");

  useEffect(() => {
    let stale = false;

    const ping = async () => {
      try {
        const { error } = await institutionSupabase
          .from("institutions")
          .select("id")
          .limit(1)
          .maybeSingle();
        if (!stale) setStatus(error ? "reconnecting" : "connected");
      } catch {
        if (!stale) setStatus("offline");
      }
    };

    ping();
    const id = setInterval(ping, PING_MS);
    const onOnline  = () => { setStatus("reconnecting"); ping(); };
    const onOffline = () => setStatus("offline");
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      stale = true;
      clearInterval(id);
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return status;
}

// ─────────────────────────────────────────────────────────────────────────────
// useKeyboardNav — vim-style two-key navigation
// ─────────────────────────────────────────────────────────────────────────────

function useKeyboardNav(navigate: ReturnType<typeof useNavigate>) {
  const gPressed = useRef(false);
  const timer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in an input
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === "g" || e.key === "G") {
        gPressed.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { gPressed.current = false; }, 800);
        return;
      }

      if (gPressed.current) {
        gPressed.current = false;
        clearTimeout(timer.current);
        const routes: Record<string, string> = {
          d: "/dashboard",
          m: "/marketplace",
          b: "/bids",
          a: "/approvals",
          p: "/products",
          w: "/webhooks",
          l: "/audit",
          s: "/settings",
        };
        const route = routes[e.key.toLowerCase()];
        if (route) navigate(route);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}

// ─────────────────────────────────────────────────────────────────────────────
// ConnectionBar — fixed bottom strip
// ─────────────────────────────────────────────────────────────────────────────

function StatusBar({
  role,
  institutionId,
  connStatus,
  idleWarning,
}: {
  role:          string;
  institutionId: string;
  connStatus:    ConnStatus;
  idleWarning:   boolean;
}) {
  const connColor = connStatus === "connected"    ? "text-emerald-600"
                  : connStatus === "reconnecting" ? "text-amber-600"
                  :                                 "text-red-600";
  const ConnIcon  = connStatus === "connected"    ? Wifi
                  :                                 WifiOff;

  return (
    <div
      className="h-6 bg-ink/[0.015] border-t border-ink/[0.06] flex items-center px-4 gap-4 flex-shrink-0 text-[10px] font-mono text-muted"
      role="status"
      aria-live="polite"
      aria-label="Session status bar"
    >
      {/* Connection */}
      <span className={`flex items-center gap-1 font-semibold ${connColor}`}>
        <ConnIcon className="w-3 h-3" aria-hidden />
        {connStatus.toUpperCase()}
      </span>

      <span className="text-ink/20">·</span>

      {/* Role */}
      <span className="flex items-center gap-1">
        <Shield className="w-3 h-3" aria-hidden />
        {role.toUpperCase()}
      </span>

      <span className="text-ink/20">·</span>

      {/* Institution ref */}
      <span className="text-muted/60">
        {institutionId.slice(0, 8)}
      </span>

      {/* Idle warning */}
      {idleWarning && (
        <>
          <span className="text-ink/20">·</span>
          <span className="flex items-center gap-1 text-amber-600 font-semibold animate-pulse">
            <AlertTriangle className="w-3 h-3" aria-hidden />
            SESSION EXPIRING — move mouse to continue
          </span>
        </>
      )}

      {/* Keyboard hint */}
      <span className="ml-auto text-muted/40">
        G+D Dashboard · G+M Marketplace · G+A Approvals
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IdleWarningBanner — modal-style warning before forced sign-out
// ─────────────────────────────────────────────────────────────────────────────

function IdleWarningBanner({
  onDismiss,
  onSignOut,
}: {
  onDismiss: () => void;
  onSignOut: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-ink/30 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      role="alertdialog"
      aria-labelledby="idle-title"
      aria-describedby="idle-desc"
    >
      <div className="bg-white rounded-2xl border border-amber-200 shadow-2xl p-7 max-w-sm w-full text-center">
        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-amber-600" aria-hidden />
        </div>
        <h2 id="idle-title" className="font-display font-bold text-[18px] text-ink mb-2">
          Session expiring
        </h2>
        <p id="idle-desc" className="text-[13px] text-muted mb-5">
          You've been inactive for 4 minutes. You will be signed out in 1 minute
          to protect your account.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 bg-ficium hover:bg-ficium-deep text-white font-bold py-2.5 rounded-xl transition-colors text-[13px]"
            autoFocus
          >
            Continue session
          </button>
          <button
            onClick={onSignOut}
            className="flex-1 border border-ink/[0.12] text-muted font-semibold py-2.5 rounded-xl hover:bg-ink/[0.03] transition-colors text-[13px]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  section: PortalSection;
  label:   string;
  path:    string;
  icon:    React.ElementType;
  module?: string;
  badge?:  number;
  key?:    string; // keyboard shortcut hint (after G+)
}

function Sidebar({
  collapsed,
  institution,
  role,
  pendingCount,
  modules,
  onSignOut,
}: {
  collapsed:    boolean;
  institution?: { name: string; deployment_model: string; primary_contact_name?: string };
  role?:        { role: string };
  pendingCount: number;
  modules:      string[];
  onSignOut:    () => void;
}) {
  const NAV: NavItem[] = [
    { section: "dashboard",       label: "Dashboard",   path: "/dashboard",  icon: LayoutDashboard, key: "D" },
    { section: "marketplace",     label: "Marketplace", path: "/marketplace",icon: Store,   module: "marketplace", key: "M" },
    { section: "my-bids",         label: "My bids",     path: "/bids",       icon: FileText,module: "marketplace", key: "B" },
    { section: "pending-actions", label: "Approvals",   path: "/approvals",  icon: Clock,   badge: pendingCount,   key: "A" },
    { section: "products",        label: "Products",    path: "/products",   icon: Package,                         key: "P" },
    { section: "webhooks",        label: "Webhooks",    path: "/webhooks",   icon: Webhook,                         key: "W" },
    { section: "audit",           label: "Audit log",   path: "/audit",      icon: ScrollText,                      key: "L" },
    { section: "settings",        label: "Settings",    path: "/settings",   icon: Settings,                        key: "S" },
  ];

  const visible = NAV.filter((item) => !item.module || modules.includes(item.module));

  return (
    <aside
      className={[
        "bg-white border-r border-ink/[0.07] flex flex-col flex-shrink-0 shadow-sm transition-all duration-200",
        collapsed ? "w-14" : "w-60",
      ].join(" ")}
      aria-label="Portal navigation"
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 border-b border-ink/[0.07] ${collapsed ? "px-3 py-4 justify-center" : "px-5 py-5"}`}>
        <FLogo size={24} className="text-ficium flex-shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-display text-[15px] font-bold text-ink tracking-tight">Ficium</span>
            <div className="text-[11px] font-semibold text-ficium truncate mt-0.5">
              {institution?.name ?? "Institution"}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto" aria-label="Primary navigation">
        {!collapsed && (
          <p className="text-[9px] font-bold text-ink/25 uppercase tracking-[0.12em] px-5 mb-1">
            Portal
          </p>
        )}
        {visible.map((item) => (
          <NavLink
            key={item.section}
            to={item.path}
            end={item.path === "/dashboard"}
            title={collapsed ? `${item.label} (G+${item.key})` : undefined}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 mx-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all",
                collapsed ? "justify-center" : "",
                isActive
                  ? "bg-ficium/10 text-ficium font-semibold"
                  : "text-ink/50 hover:text-ink hover:bg-ink/[0.04]",
              ].join(" ")
            }
            aria-label={item.label}
          >
            <item.icon className="w-[15px] h-[15px] flex-shrink-0" aria-hidden />
            {!collapsed && (
              <>
                <span className="flex-1">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span
                    className="bg-ficium text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    aria-label={`${item.badge} pending`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
            {collapsed && item.badge && item.badge > 0 ? (
              <span className="absolute top-1 right-1 w-2 h-2 bg-ficium rounded-full" aria-hidden />
            ) : null}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className={`border-t border-ink/[0.07] ${collapsed ? "p-3" : "p-4"}`}>
        {!collapsed && (
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
        )}
        <button
          onClick={onSignOut}
          title="Sign out"
          className={[
            "flex items-center gap-2 text-[12px] text-muted hover:text-red-500 transition-colors",
            collapsed ? "justify-center w-full" : "w-full",
          ].join(" ")}
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────────────────────

function TopBar({
  collapsed,
  onToggleCollapse,
  institution,
  pendingCount,
}: {
  collapsed:        boolean;
  onToggleCollapse: () => void;
  institution?:     { name: string; deployment_model: string; approved: boolean };
  pendingCount:     number;
}) {
  const deployLabel = DEPLOY_LABELS[institution?.deployment_model ?? "saas"] ?? "SaaS";

  return (
    <header className="h-13 bg-white border-b border-ink/[0.07] flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: collapse + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-muted hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-ink/[0.04]"
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" aria-hidden />
            : <PanelLeftClose className="w-4 h-4" aria-hidden />
          }
        </button>
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <FLogo size={13} className="text-ficium" />
          <span>Ficium</span>
          <ChevronRight className="w-3.5 h-3.5 text-ink/20" aria-hidden />
          <span className="text-ink font-medium truncate max-w-[200px]">
            {institution?.name ?? "Institution portal"}
          </span>
          <span className="text-[10px] bg-ficium/10 text-ficium font-semibold px-2 py-0.5 rounded-full ml-1">
            {deployLabel}
          </span>
        </div>
      </div>

      {/* Right: status + bell */}
      <div className="flex items-center gap-3">
        {institution?.approved && (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" aria-hidden />
            Live
          </span>
        )}
        <button
          className="relative w-8 h-8 rounded-xl hover:bg-ink/[0.04] flex items-center justify-center transition-colors text-muted hover:text-ink"
          aria-label={`Notifications${pendingCount > 0 ? ` — ${pendingCount} pending approvals` : ""}`}
        >
          <Bell className="w-4 h-4" aria-hidden />
          {pendingCount > 0 && (
            <span
              className="absolute top-1 right-1 bg-ficium text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center"
              aria-hidden
            >
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell — root layout orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionPortalShell() {
  const navigate = useNavigate();

  const { data: institution }    = useMyInstitution();
  const { data: role }           = useMyRole();
  const { data: pendingActions } = usePendingActions();

  const [collapsed, setCollapsed] = useState(false);

  const modules      = institution?.modules ?? [];
  const pendingCount = pendingActions?.length ?? 0;

  const handleSignOut = useCallback(async () => {
    await institutionSupabase.auth.signOut();
    navigate("/login?signedout=1");
  }, [navigate]);

  // Session guard
  const { idleWarning, reset: resetIdle } = useSessionGuard(handleSignOut);

  // Connection status
  const connStatus = useConnectionStatus();

  // Keyboard navigation
  useKeyboardNav(navigate);

  // Ctrl+B → toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-cream text-ink font-body overflow-hidden">
      {/* Idle warning overlay */}
      {idleWarning && (
        <IdleWarningBanner
          onDismiss={resetIdle}
          onSignOut={handleSignOut}
        />
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={collapsed}
          institution={institution ?? undefined}
          role={role ?? undefined}
          pendingCount={pendingCount}
          modules={modules}
          onSignOut={handleSignOut}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
            institution={institution ?? undefined}
            pendingCount={pendingCount}
          />

          {/* Page content */}
          <main className="flex-1 overflow-auto bg-cream" id="main-content">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Always-visible status bar */}
      <StatusBar
        role={role?.role ?? "member"}
        institutionId={institution?.id ?? ""}
        connStatus={connStatus}
        idleWarning={idleWarning}
      />
    </div>
  );
}
