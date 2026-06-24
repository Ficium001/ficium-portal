// =============================================================
// ficium-portal — ficium-auth API client
// Replaces Supabase Auth for authentication.
// ficium-auth issues RS256 JWTs that Supabase RLS trusts via
// the registered public key.
// =============================================================

const AUTH_URL = (import.meta.env.VITE_AUTH_URL as string | undefined)
  ?? 'https://ficium-auth-production.up.railway.app'

export interface AuthTokens {
  access_token:  string
  token_type:    string
  expires_in:    number
  mfa_required?: boolean
  mfa_token?:    string
}

export interface AuthError {
  error:   string
  message: string
}

// ── Login ─────────────────────────────────────────────────────
export async function signIn(
  username: string,
  password: string,
): Promise<{ tokens: AuthTokens; must_change_password: boolean; error: null } | { tokens: null; must_change_password: false; error: string }> {
  try {
    const res = await fetch(`${AUTH_URL}/auth/login`, {
      method:      'POST',
      credentials: 'include',          // receive httpOnly refresh cookie
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ username, password }),
    })
    const data = await res.json()
    console.log('[ficiumAuth.signIn] raw response:', JSON.stringify(data))
    if (!res.ok) {
      const msg = data?.message ?? data?.detail ?? 'Incorrect email or password.'
      return { tokens: null, must_change_password: false, error: msg }
    }
    // Store access token in memory (sessionStorage — never localStorage)
    sessionStorage.setItem('ficium_at', data.access_token)
    sessionStorage.setItem('ficium_at_exp', String(Date.now() + data.expires_in * 1000))
    console.log('[ficiumAuth.signIn] must_change_password:', data.must_change_password)
    return { tokens: data, must_change_password: !!data.must_change_password, error: null }
  } catch {
    return { tokens: null, must_change_password: false, error: 'Unable to reach the authentication service. Try again.' }
  }
}

// ── Logout ────────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  try {
    await fetch(`${AUTH_URL}/auth/logout`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Authorization': `Bearer ${getAccessToken()}` },
    })
  } catch { /* best effort */ }
  sessionStorage.removeItem('ficium_at')
  sessionStorage.removeItem('ficium_at_exp')
}

// ── Token refresh ─────────────────────────────────────────────
export async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${AUTH_URL}/auth/refresh`, {
      method:      'POST',
      credentials: 'include',   // sends httpOnly refresh cookie
    })
    if (!res.ok) return null
    const data = await res.json()
    sessionStorage.setItem('ficium_at', data.access_token)
    sessionStorage.setItem('ficium_at_exp', String(Date.now() + data.expires_in * 1000))
    return data.access_token
  } catch { return null }
}

// ── Get current access token (auto-refresh if near expiry) ────
export function getAccessToken(): string | null {
  return sessionStorage.getItem('ficium_at')
}

export async function getValidAccessToken(): Promise<string | null> {
  const token = sessionStorage.getItem('ficium_at')
  const exp   = Number(sessionStorage.getItem('ficium_at_exp') ?? 0)
  if (!token) return null
  // Refresh if less than 60s remaining
  if (Date.now() > exp - 60_000) return refreshToken()
  return token
}

// ── Check if session exists ───────────────────────────────────
export function hasSession(): boolean {
  return !!sessionStorage.getItem('ficium_at')
}

// ── Get current user from JWT payload (no network call) ───────
export function getTokenPayload(): Record<string, unknown> | null {
  const token = sessionStorage.getItem('ficium_at')
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}


// ── Authenticated fetch to ficium-auth ───────────────────────
// Used for endpoints that require a valid access token (e.g. force-change-password).
export async function ficiumAuthFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.detail ?? data?.message ?? `HTTP ${res.status}`)
  return data
}
