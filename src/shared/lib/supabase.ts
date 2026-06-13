import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "./ficiumAuth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = ReturnType<typeof createClient<any, any, any>>;

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!URL || !KEY) {
  const msg = "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY";
  if (import.meta.env.DEV) throw new Error(msg);
  else console.error(msg);
}

const url = URL ?? "";
const key = KEY ?? "";

// ─────────────────────────────────────────────────────────────
// Auth is owned by ficium-auth now, not Supabase GoTrue.
// Every PostgREST request must carry the ficium-auth access token
// (RS256 JWT) so Supabase RLS evaluates policies as the authenticated
// institution user instead of the anonymous publishable role.
// getValidAccessToken() also refreshes the token when near expiry,
// so long-lived tabs don't send an expired JWT to Supabase.
// ─────────────────────────────────────────────────────────────
const ficiumFetch: typeof fetch = async (input, init) => {
  const token = await getValidAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

const nullStorage = {
  getItem:    (_key: string) => null,
  setItem:    (_key: string, _val: string) => {},
  removeItem: (_key: string) => {},
};

// GoTrue no longer owns the session — disable persistence/refresh so it
// doesn't run background work or fight the ficium-auth token.
const sharedAuthOpts = {
  persistSession:     false,
  autoRefreshToken:   false,
  detectSessionInUrl: false,
  storage:            nullStorage,
} as const;

export const supabase: AnyClient = createClient(url, key, {
  auth:   sharedAuthOpts,
  global: { fetch: ficiumFetch },
});

const schemaClients = new Map<string, AnyClient>();
schemaClients.set("public", supabase);

export function db(schema = "public"): AnyClient {
  if (schema === "public") return supabase;
  const cached = schemaClients.get(schema);
  if (cached) return cached;

  const client: AnyClient = createClient(url, key, {
    db:     { schema },
    auth:   sharedAuthOpts,
    global: { fetch: ficiumFetch },
  });

  schemaClients.set(schema, client);
  return client;
}

export const institutionDb: AnyClient = db("institution");
