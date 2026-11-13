/**
 * Institution applications through portal-api (POST /access-requests).
 * Applying creates NO account: it stores the application and emails a link to
 * confirm it. Ficium reviews confirmed applications; after the contract, two
 * Ficium admins create the institution and email its administrator an invitation.
 * Replaces self-registration (POST /auth/register, off since 2026-11-13).
 */
import { API_URL } from './portalApi'

export type InstitutionType =
  | 'commercial_bank' | 'fintech' | 'micro_credit' | 'leasing' | 'insurance' | 'cooperative' | 'other'

export interface AccessRequestInput {
  institution_name: string
  institution_type: InstitutionType
  country:          string
  reg_number?:      string
  regulator?:       string
  website?:         string
  contact_name:     string
  contact_email:    string
  contact_phone?:   string
  contact_role?:    string
  message?:         string
  company_fax?:     string   // honeypot: always empty from a person
}

type Fail = { ok: false; error: string }

function errorFrom(status: number, data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '')
  if (status === 429) return 'Too many attempts. Try again in an hour.'
  return fallback
}

async function post(path: string, body: unknown): Promise<{ status: number; data: unknown } | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: res.status, data: await res.json().catch(() => ({})) }
  } catch {
    return null
  }
}

const UNREACHABLE: Fail = { ok: false, error: 'Could not reach Ficium. Check your connection and try again.' }

export async function submitAccessRequest(input: AccessRequestInput): Promise<{ ok: true; message: string } | Fail> {
  const r = await post('/access-requests', input)
  if (!r) return UNREACHABLE
  if (r.status !== 202) return { ok: false, error: errorFrom(r.status, r.data, 'The application could not be sent. Please try again.') }
  return { ok: true, message: String((r.data as { message?: string }).message ?? '') }
}

export async function confirmAccessRequest(token: string): Promise<{ ok: true; reference: string; institution_name: string } | Fail> {
  const r = await post('/access-requests/verify', { token })
  if (!r) return UNREACHABLE
  if (r.status !== 200) return { ok: false, error: errorFrom(r.status, r.data, 'This link could not be confirmed.') }
  const d = r.data as { reference: string; institution_name: string }
  return { ok: true, reference: d.reference, institution_name: d.institution_name }
}
