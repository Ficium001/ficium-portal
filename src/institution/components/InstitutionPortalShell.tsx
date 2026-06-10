/**
 * @component InstitutionPortalShell
 * @description
 *   Root layout for the institution portal.
 *   Nav: left sidebar with icon + label, expandable sections.
 *   Top bar: institution selector + notification bell + user avatar.
 *   Nav items driven by group.module_permissions via MODULE_CATALOGUE.
 *   Session guard, connection monitor, keyboard navigation preserved.
 *
 * @owner Ficium Engineering
 */

import {
  useEffect, useRef, useState, useCallback,
} from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Store, FileText, Clock,
  Webhook, Package, ScrollText, Settings,
  LogOut, Bell, Wifi, WifiOff, AlertTriangle,
  Shield, ChevronDown, ChevronRight, Menu, X,
  Users,
} from "lucide-react";
import {
  useMyInstitution, useMyRole, usePendingActions,
} from "../hooks/useInstitution";
import { useMyGroup } from "../../admin/hooks/useAdmin";
import institutionSupabase from "../lib/institutionSupabase";
import { INSTITUTION_MODULE_LIST, allowedModules } from "../../shared/lib/modules";

// ─── Constants ───────────────────────────────────────────────
const IDLE_WARN_MS   = 4 * 60 * 1000;
const IDLE_LOGOUT_MS = 5 * 60 * 1000;
const PING_MS        = 30 * 1000;

// ─── Icon resolver ───────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Store, FileText, Clock, Package,
  Webhook, ScrollText, Settings, Shield, Users,
};
function resolveIcon(key: string): React.ElementType {
  return ICON_MAP[key] ?? LayoutDashboard;
}

// ─── Ficium F logo ───────────────────────────────────────────
function FLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M28 18 H72 C75 18 76 21 74 24 L62 38 H44 V52 H58 C61 52 62 55 60 58 L52 68 H44 V82 C44 85 41 86 38 84 L26 76 C24 75 24 73 24 71 V22 C24 19 26 18 28 18 Z"
        fill="currentColor" />
    </svg>
  );
}

// ─── Hooks ───────────────────────────────────────────────────
function useSessionGuard(onSignOut: () => void) {
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const reset = useCallback(() => { lastActivity.current = Date.now(); setIdleWarning(false); }, []);
  useEffect(() => {
    const events = ["mousemove", "keydown", "pointerdown", "scroll"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LOGOUT_MS) onSignOut();
      else if (idle >= IDLE_WARN_MS) setIdleWarning(true);
      else setIdleWarning(false);
    }, 10_000);
    return () => { events.forEach(e => window.removeEventListener(e, reset)); clearInterval(tick); };
  }, [onSignOut, reset]);
  return { idleWarning, reset };
}

type ConnStatus = "connected" | "reconnecting" | "offline";
function useConnectionStatus(): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>("connected");
  useEffect(() => {
    let stale = false;
    const ping = async () => {
      try {
        const { error } = await institutionSupabase.from("institutions").select("id").limit(1).maybeSingle();
        if (!stale) setStatus(error ? "reconnecting" : "connected");
      } catch { if (!stale) setStatus("offline"); }
    };
    ping();
    const id = setInterval(ping, PING_MS);
    const onOnline  = () => { setStatus("reconnecting"); ping(); };
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { stale = true; clearInterval(id); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  return status;
}

// ─── Idle warning modal ──────────────────────────────────────
function IdleWarningBanner({ onDismiss, onSignOut }: { onDismiss: () => void; onSignOut: () => void }) {
  return (
    <div className="fixed inset-0 bg-ink/30 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      role="alertdialog" aria-labelledby="idle-title">
      <div className="bg-white rounded-2xl border border-amber-200 shadow-2xl p-7 max-w-sm w-full text-center">
        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-amber-600" aria-hidden />
        </div>
        <h2 id="idle-title" className="font-display font-bold text-[18px] text-ink mb-2">Session expiring</h2>
        <p className="text-[13px] text-muted mb-5">
          You've been inactive for 4 minutes. You'll be signed out in 1 minute.
        </p>
        <div className="flex gap-3">
          <button onClick={onDismiss} autoFocus
            className="flex-1 bg-ficium hover:bg-ficium-deep text-white font-bold py-2.5 rounded-xl transition-colors text-[13px]">
            Continue session
          </button>
          <button onClick={onSignOut}
            className="flex-1 border border-ink/[0.12] text-muted font-semibold py-2.5 rounded-xl hover:bg-ink/[0.03] transition-colors text-[13px]">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nav section config ───────────────────────────────────────
interface NavSection {
  key:   string;
  label: string;
  items: string[]; // module keys
}

const NAV_SECTIONS: NavSection[] = [
  { key: "main",       label: "",           items: ["inst:dashboard"] },
  { key: "marketplace",label: "Market",     items: ["inst:marketplace", "inst:bids", "inst:bid_approval"] },
  { key: "manage",     label: "Manage",     items: ["inst:products", "inst:webhooks"] },
  { key: "compliance", label: "Compliance", items: ["inst:audit", "inst:settings"] },
];

// ─── Sidebar ─────────────────────────────────────────────────
function Sidebar({
  open,
  institution,
  role,
  pendingCount,
  modulePermissions,
  onSignOut,
  onClose,
}: {
  open:               boolean;
  institution?:       { name: string; deployment_model?: string };
  role?:              { role: string };
  pendingCount:       number;
  modulePermissions:  string[];
  onSignOut:          () => void;
  onClose:            () => void;
}) {
  const location         = useLocation();
  const visibleModules   = allowedModules(INSTITUTION_MODULE_LIST, modulePermissions);
  const visibleKeys      = new Set(visibleModules.map(m => m.key));
  const moduleByKey      = Object.fromEntries(visibleModules.map(m => [m.key, m]));

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-ink/40 z-30 lg:hidden" onClick={onClose} aria-hidden />
      )}

      <aside className={[
        "fixed lg:static inset-y-0 left-0 z-40 lg:z-auto",
        "w-64 bg-[#0f0e1a] flex flex-col flex-shrink-0",
        "transition-transform duration-200",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")} aria-label="Portal navigation">

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-ficium flex items-center justify-center flex-shrink-0">
              <FLogo size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-[15px] text-white tracking-tight">FICIUM</div>
              <div className="text-[10px] font-semibold text-ficium/70 uppercase tracking-wider">Bank Portal</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white" aria-label="Close nav">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Primary navigation">
          {NAV_SECTIONS.map(section => {
            const sectionMods = section.items
              .filter(k => visibleKeys.has(k))
              .map(k => moduleByKey[k])
              .filter(Boolean);
            if (sectionMods.length === 0) return null;
            return (
              <div key={section.key} className="mb-4">
                {section.label && (
                  <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.15em] px-3 mb-1">
                    {section.label}
                  </p>
                )}
                {sectionMods.map(mod => {
                  const Icon       = resolveIcon(mod.iconKey);
                  const isApprovals= mod.key === "inst:bid_approval";
                  const isActive   = location.pathname === mod.path ||
                                     (mod.path !== "/dashboard" && location.pathname.startsWith(mod.path));
                  return (
                    <NavLink key={mod.key} to={mod.path}
                      className={[
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all mb-0.5",
                        isActive
                          ? "bg-ficium text-white font-semibold"
                          : "text-white/50 hover:text-white hover:bg-white/[0.06]",
                      ].join(" ")}
                      aria-label={mod.label}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
                      <span className="flex-1">{mod.label}</span>
                      {isApprovals && pendingCount > 0 && (
                        <span className="bg-white text-ficium text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {pendingCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.06] p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-ficium/30 border border-ficium/40 flex items-center justify-center flex-shrink-0">
              <span className="text-[12px] font-bold text-white">
                {(institution?.name ?? "I")[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-white truncate">
                {institution?.name ?? "Institution"}
              </div>
              <div className="text-[10px] text-white/40 capitalize">
                {role?.role ?? "member"}
              </div>
            </div>
          </div>
          <button onClick={onSignOut}
            className="flex items-center gap-2 w-full text-[12px] text-white/30 hover:text-red-400 transition-colors"
            aria-label="Sign out">
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Top bar ─────────────────────────────────────────────────
function TopBar({
  onMenuOpen,
  institution,
  pendingCount,
  connStatus,
}: {
  onMenuOpen:   () => void;
  institution?: { name: string; approved?: boolean };
  pendingCount: number;
  connStatus:   ConnStatus;
}) {
  const connDot = connStatus === "connected"    ? "bg-emerald-500"
                : connStatus === "reconnecting" ? "bg-amber-500"
                :                                 "bg-red-500";

  return (
    <header className="h-14 bg-white border-b border-ink/[0.07] flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button onClick={onMenuOpen}
          className="lg:hidden p-2 rounded-lg hover:bg-ink/[0.05] text-muted hover:text-ink transition-colors"
          aria-label="Open navigation">
          <Menu className="w-5 h-5" />
        </button>
        {/* Institution selector — static for now, expandable later */}
        <div className="flex items-center gap-2 bg-ink/[0.03] border border-ink/[0.08] rounded-xl px-3 py-2 cursor-pointer hover:bg-ink/[0.06] transition-colors">
          <div className="w-5 h-5 rounded bg-ficium/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-ficium">
              {(institution?.name ?? "I")[0].toUpperCase()}
            </span>
          </div>
          <span className="text-[13px] font-semibold text-ink max-w-[180px] truncate">
            {institution?.name ?? "Institution"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted flex-shrink-0" aria-hidden />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Connection dot */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${connDot}`} aria-hidden />
          <span className="hidden sm:block capitalize">{connStatus}</span>
        </div>

        {/* Notifications */}
        <button
          className="relative w-9 h-9 rounded-xl hover:bg-ink/[0.05] flex items-center justify-center transition-colors text-muted hover:text-ink"
          aria-label={`Notifications${pendingCount > 0 ? ` — ${pendingCount} pending` : ""}`}>
          <Bell className="w-4 h-4" aria-hidden />
          {pendingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-ficium rounded-full" aria-hidden />
          )}
        </button>

        {/* User avatar */}
        <div className="w-9 h-9 rounded-xl bg-ficium flex items-center justify-center cursor-pointer hover:bg-ficium-deep transition-colors">
          <span className="text-[13px] font-bold text-white">
            {(institution?.name ?? "U")[0].toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  );
}

// ─── Status bar ───────────────────────────────────────────────
function StatusBar({
  role, institutionId, connStatus, idleWarning,
}: {
  role: string; institutionId: string; connStatus: ConnStatus; idleWarning: boolean;
}) {
  return (
    <div className="h-6 bg-ink/[0.015] border-t border-ink/[0.06] flex items-center px-4 gap-4 flex-shrink-0 text-[10px] font-mono text-muted"
      role="status" aria-live="polite">
      <span className={`flex items-center gap-1 font-semibold ${connStatus === "connected" ? "text-emerald-600" : connStatus === "reconnecting" ? "text-amber-600" : "text-red-600"}`}>
        {connStatus === "connected" ? <Wifi className="w-3 h-3" aria-hidden /> : <WifiOff className="w-3 h-3" aria-hidden />}
        {connStatus.toUpperCase()}
      </span>
      <span className="text-ink/20">·</span>
      <span className="flex items-center gap-1"><Shield className="w-3 h-3" aria-hidden />{role.toUpperCase()}</span>
      <span className="text-ink/20">·</span>
      <span className="text-muted/60">{institutionId.slice(0, 8)}</span>
      {idleWarning && (
        <>
          <span className="text-ink/20">·</span>
          <span className="flex items-center gap-1 text-amber-600 font-semibold animate-pulse">
            <AlertTriangle className="w-3 h-3" aria-hidden />
            SESSION EXPIRING
          </span>
        </>
      )}
      <span className="ml-auto text-muted/40 hidden sm:block">G+D Dashboard · G+M Marketplace · G+A Approvals</span>
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────
export default function InstitutionPortalShell() {
  const navigate = useNavigate();

  const { data: institution }    = useMyInstitution();
  const { data: role }           = useMyRole();
  const { data: pendingActions } = usePendingActions();
  const { data: myGroup }        = useMyGroup();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const modulePermissions = myGroup?.module_permissions ?? [];
  const pendingCount      = pendingActions?.length ?? 0;

  const handleSignOut = useCallback(async () => {
    await institutionSupabase.auth.signOut();
    navigate("/login?signedout=1");
  }, [navigate]);

  const { idleWarning, reset: resetIdle } = useSessionGuard(handleSignOut);
  const connStatus = useConnectionStatus();

  // Keyboard nav
  useEffect(() => {
    const visibleModules = allowedModules(INSTITUTION_MODULE_LIST, modulePermissions);
    const routes = Object.fromEntries(
      visibleModules.filter(m => m.shortcut).map(m => [m.shortcut!.toLowerCase(), m.path])
    );
    const gRef = { pressed: false, timer: 0 as unknown as ReturnType<typeof setTimeout> };
    const h = (e: KeyboardEvent) => {
      if (["INPUT","TEXTAREA","SELECT"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key.toLowerCase() === "g") {
        gRef.pressed = true; clearTimeout(gRef.timer);
        gRef.timer = setTimeout(() => { gRef.pressed = false; }, 800); return;
      }
      if (gRef.pressed) {
        gRef.pressed = false; clearTimeout(gRef.timer);
        const r = routes[e.key.toLowerCase()]; if (r) navigate(r);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [navigate, modulePermissions]);

  // Close sidebar on nav
  useEffect(() => { setSidebarOpen(false); }, [navigate]);

  return (
    <div className="flex flex-col h-screen bg-[#f5f4f8] text-ink font-body overflow-hidden">
      {idleWarning && <IdleWarningBanner onDismiss={resetIdle} onSignOut={handleSignOut} />}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          institution={institution ?? undefined}
          role={role ?? undefined}
          pendingCount={pendingCount}
          modulePermissions={modulePermissions}
          onSignOut={handleSignOut}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopBar
            onMenuOpen={() => setSidebarOpen(true)}
            institution={institution ?? undefined}
            pendingCount={pendingCount}
            connStatus={connStatus}
          />
          <main className="flex-1 overflow-auto" id="main-content">
            <Outlet />
          </main>
          <StatusBar
            role={role?.role ?? "member"}
            institutionId={institution?.id ?? ""}
            connStatus={connStatus}
            idleWarning={idleWarning}
          />
        </div>
      </div>
    </div>
  );
}
