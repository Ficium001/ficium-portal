/**
 * Institution self-registration through portal-api (POST /auth/register).
 * One server-side transaction creates the institution (unapproved), the
 * ficium-auth login and the primary admin. The browser never talks to the
 * database or Supabase Auth (replaces signUpInstitution, removed 2026-10).
 */
import { API_URL } from './portalApi'

export interface RegisterInput {
  institution_name: string
  institution_type: 'commercial_bank' | 'fintech' | 'micro_credit' | 'leasing'
                  | 'insurance' | 'cooperative' | 'other'
  country:     string
  reg_number?: string
  regulator?:  string
  first_name:  string
  last_name:   string
  email:       string
  phone?:      string
  password:    string
}

export type RegisterResult = { ok: true; email: string } | { ok: false; error: string }

export async function registerInstitution(input: RegisterInput): Promise<RegisterResult> {
  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
          ? String(detail[0].msg).replace(/^Value error, /, '')
          : res.status === 429
            ? 'Too many registration attempts. Try again in an hour.'
            : 'Registration failed. Please try again.'
      return { ok: false, error: msg }
    }
    return { ok: true, email: data.email as string }
  } catch {
    return { ok: false, error: 'Could not reach Ficium. Check your connection and try again.' }
  }
}
