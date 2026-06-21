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
  email: string,
  password: string,
): Promise<{ tokens: AuthTokens; error: null } | { tokens: null; error: string }> {
  try {
    const res = await fetch(`${AUTH_URL}/auth/login`, {
      method:      'POST',
      credentials: 'include',          // receive httpOnly refresh cookie
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = data?.message ?? data?.detail ?? 'Incorrect email or password.'
      return { tokens: null, error: msg }
    }
    // Store access token in memory (sessionStorage — never localStorage)
    sessionStorage.setItem('ficium_at', data.access_token)
    sessionStorage.setItem('ficium_at_exp', String(Date.now() + data.expires_in * 1000))
    return { tokens: data, error: null }
  } catch {
    return { tokens: null, error: 'Unable to reach the authentication service. Try again.' }
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
