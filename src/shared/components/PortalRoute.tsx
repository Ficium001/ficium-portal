import { useEffect, useState } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { getValidAccessToken } from "../lib/ficiumAuth"
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
  const [state, setState]               = useState<State>("loading")
  const [suspendReason, setSuspendReason] = useState("")

  useEffect(() => {
    let cancelled = false

    async function check() {
      // 1. Fast local check — no network if token is absent
      const token = await getValidAccessToken()
      if (!token) {
        if (!cancelled) setState("unauthed")
        return
      }

      // 2. Single API call replaces: detect_portal_user_type RPC +
      //    institution_members query + institutions query
      try {
        const me = await portalApi.get<MeResponse>("/institutions/me")

        if (cancelled) return

        if (me.user_type === "admin") {
          setState("ok")
          return
        }

        // institution user
        if (!me.institution_id) { setState("no_access"); return }
        if (me.suspended_at)    { setSuspendReason(me.suspension_reason ?? ""); setState("suspended"); return }
        if (!me.approved)       { setState("pending"); return }
        setState("ok")
      } catch (err) {
        if (cancelled) return
        if (err instanceof PortalApiError && err.status === 401) {
          setState("unauthed")
        } else if (err instanceof PortalApiError && err.status === 403) {
          setState("no_access")
        } else {
          // Network error or unexpected — do not expose internals,
          // treat as unauthed to force re-login safely
          setState("unauthed")
        }
      }
    }

    check()
    return () => { cancelled = true }
  }, [location.pathname])

  if (state === "loading")   return <Spinner />
  if (state === "unauthed")  return <Navigate to="/login" state={{ from: location }} replace />
  if (state === "pending")   return <Navigate to="/pending" replace />
  if (state === "no_access") return <Navigate to="/login" replace />

  if (state === "suspended") return (
    <div className="min-h-screen bg-[#f5f4f8] flex items-center justify-center p-6">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-sm text-center shadow-card">
        <div className="text-4xl mb-4">\u2298</div>
        <h2 className="font-display font-bold text-[18px] text-red-600 mb-2">Institution suspended</h2>
        <p className="text-[13px] text-muted">
          {suspendReason || "Your institution has been suspended. Contact support@ficium.mu"}
        </p>
      </div>
    </div>
  )

  return <Outlet />
}
