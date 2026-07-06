// =============================================================
// Ficium Portal — Portal API client
// Thin fetch wrapper for ficium-portal-api (FastAPI backend).
// Attaches the ficium-auth RS256 JWT from sessionStorage and
// auto-refreshes the token if near expiry.
// =============================================================
import { getValidAccessToken, signOut } from "./ficiumAuth"

export const API_URL = (import.meta.env.VITE_PORTAL_API_URL as string | undefined)
  ?? "https://ficium-portal-api-production.up.railway.app"

export class PortalApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "PortalApiError"
    this.status = status
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getValidAccessToken()
  if (!token) {
    // No valid token — force logout rather than 401 loop
    await signOut()
    throw new PortalApiError(401, "Session expired")
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })

  if (res.status === 401) {
    // Token was rejected by the API itself (not just locally expired).
    // Force a clean logout rather than letting callers retry against
    // a dead token.
    await signOut()
    throw new PortalApiError(401, "Session expired")
  }

  if (!res.ok) {
    let message = `Portal API error ${res.status}`
    try {
      const body = await res.json()
      message = body?.detail ?? body?.message ?? message
    } catch { /* ignore parse errors */ }
    throw new PortalApiError(res.status, message)
  }

  return res.json() as Promise<T>
}

export const portalApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}
