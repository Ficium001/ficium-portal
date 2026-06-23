import { useEffect, useRef, useState } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { getTokenPayload, getValidAccessToken } from "../lib/ficiumAuth"
import { portalApi, PortalApiError } from "../lib/portalApi"

// Shape returned by GET /institutions/me
interface MeResponse {
  user_type:          "admin" | "institution"
  institution_id:     string | null
  approved:           boolean
  suspended_at:       string | null
  suspension_reason:  string | null
}

type State = "loading" | "ok" | "unauthed" | "no_access" | "suspended" | "pending"

// Module-level cache — survives re-renders and route changes for the session.
// Keyed by the JWT sub so a new login always re-checks.
let _cachedSub: string | null = null
let _cachedState: State | null = null
let _cachedSuspendReason = ""

function clearCache() {
  _cachedSub = null
  _cachedState = null
  _cachedSuspendReason = ""
}

function Spinner() {
  return (
    <div className="min-h-screen bg-[#f5f4f8] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-label="Loading" />
        <p className="text-[13px] text-muted font-mono">Loading portal…</p>
      </div>
    </div>
  )
}

export default function PortalRoute() {
  const location   = useLocation()
  const [state, setState]                 = useState<State>(_cachedState ?? "loading")
  const [suspendReason, setSuspendReason] = useState(_cachedSuspendReason)
  const checking = useRef(false)

  useEffect(() => {
    // Get current JWT sub to detect user switches
    const payload = getTokenPayload()
    const currentSub = payload?.sub as string | undefined ?? null

    // Cache hit — same user, result already known, skip network call entirely
    if (_cachedState && _cachedSub === currentSub) {
      setState(_cachedState)
      setSuspendReason(_cachedSuspendReason)
      return
    }

    // Prevent duplicate in-flight checks on rapid navigation
    if (checking.current) return
    checking.current = true

    let cancelled = false

    async function check() {
      // 1. Fast local check — no network if token is absent
      const token = await getValidAccessToken()
      if (!token) {
        clearCache()
        if (!cancelled) setState("unauthed")
        checking.current = false
        return
      }

      // 2. Try to resolve from JWT claims first — avoids network for clear cases
      const p = getTokenPayload()
      const role = p?.user_role as string | undefined
      const institutionId = p?.institution_id as string | undefined

      // For admin roles, no need to hit the network
      if (role === "admin" || role === "super_admin") {
        _cachedSub   = currentSub
        _cachedState = "ok"
        if (!cancelled) setState("ok")
        checking.current = false
        return
      }

      // 3. Institution users: must verify approval/suspension status once per session
      try {
        const me = await portalApi.get<MeResponse>("/institutions/me")
        if (cancelled) { checking.current = false; return }

        let resolved: State = "ok"
        let reason = ""

        if (me.user_type === "admin") {
          resolved = "ok"
        } else if (!me.institution_id) {
          resolved = "no_access"
        } else if (me.suspended_at) {
          resolved = "suspended"
          reason = me.suspension_reason ?? ""
        } else if (!me.approved) {
          resolved = "pending"
        }

        // Cache the result for subsequent route changes
        _cachedSub          = currentSub
        _cachedState        = resolved
        _cachedSuspendReason = reason

        setSuspendReason(reason)
        setState(resolved)
      } catch (err) {
        if (cancelled) { checking.current = false; return }
        clearCache()
        if (err instanceof PortalApiError && err.status === 401) {
          setState("unauthed")
        } else if (err instanceof PortalApiError && err.status === 403) {
          setState("no_access")
        } else {
          setState("unauthed")
        }
      }
      checking.current = false
    }

    check()
    return () => { cancelled = true }
  // Only re-run when the JWT sub changes (new login), NOT on every route change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state === "loading")   return <Spinner />
  if (state === "unauthed")  return <Navigate to="/login" state={{ from: location }} replace />
  if (state === "pending")   return <Navigate to="/pending" replace />
  if (state === "no_access") return <Navigate to="/login" replace />

  if (state === "suspended") return (
    <div className="min-h-screen bg-[#f5f4f8] flex items-center justify-center p-6">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-sm text-center shadow-card">
        <div className="text-4xl mb-4">⊘</div>
        <h2 className="font-display font-bold text-[18px] text-red-600 mb-2">Institution suspended</h2>
        <p className="text-[13px] text-muted">
          {suspendReason || "Your institution has been suspended. Contact support@ficium.mu"}
        </p>
      </div>
    </div>
  )

  return <Outlet />
}
