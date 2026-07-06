/**
 * @module public/esign/api/signerApi
 * @description
 *   Unauthenticated client for the public signing ceremony. Auth is
 *   the single-use token in the signing link (hashed server-side) plus
 *   an emailed one-time code — deliberately no JWT, since the borrower
 *   has no portal account. Kept separate from portalApi so the
 *   ceremony can never leak a staff session or trigger its 401 logout.
 *
 * @owner Ficium Engineering
 */
import { API_URL } from '@/shared/lib/portalApi'

export class SignerApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SignerApiError'
    this.status = status
  }
}

export interface CeremonyState {
  title: string
  party: 'borrower' | 'institution'
  display_name: string
  signer_status: 'pending' | 'viewed' | 'signed' | 'declined'
  envelope_status: string
  expires_at: string
  document_url: string
  otp_verified: boolean
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json() as { detail?: string; message?: string }
      message = body?.detail ?? body?.message ?? message
    } catch { /* ignore parse errors */ }
    throw new SignerApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export const signerApi = {
  state: (token: string) =>
    request<CeremonyState>(`/esign/public/${encodeURIComponent(token)}`),

  requestOtp: (token: string) =>
    request<{ ok: boolean }>(`/esign/public/${encodeURIComponent(token)}/otp`, { method: 'POST' }),

  verifyOtp: (token: string, otp: string) =>
    request<{ ok: boolean }>(`/esign/public/${encodeURIComponent(token)}/otp/verify`, {
      method: 'POST', body: JSON.stringify({ otp }),
    }),

  sign: (token: string) =>
    request<{ envelope_status: string }>(`/esign/public/${encodeURIComponent(token)}/sign`, {
      method: 'POST', body: JSON.stringify({}),
    }),

  decline: (token: string, reason: string) =>
    request<{ ok: boolean }>(`/esign/public/${encodeURIComponent(token)}/decline`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
}
