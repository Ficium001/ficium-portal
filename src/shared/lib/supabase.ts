// =============================================================
// Ficium Portal — Supabase client
// Separate from ficium client app. Institution users only.
// Primary auth session keyed as "ficium-portal-auth".
// =============================================================
import { createClient } from "@supabase/supabase-js";

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

/** Primary client — public schema. Owns the portal auth session. */
export const supabase: AnyClient = createClient(url, key, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey:         "ficium-portal-auth",
  },
});

const nullStorage = {
  getItem:    (_key: string) => null,
  setItem:    (_key: string, _val: string) => {},
  removeItem: (_key: string) => {},
};

const schemaClients = new Map<string, AnyClient>();
schemaClients.set("public", supabase);

export function db(schema = "public"): AnyClient {
  if (schema === "public") return supabase;
  const cached = schemaClients.get(schema);
  if (cached) return cached;

  const client: AnyClient = createClient(url, key, {
    db:   { schema },
    auth: {
      persistSession:     false,
      autoRefreshToken:   false,
      detectSessionInUrl: false,
      storage:            nullStorage,
    },
    global: {
      fetch: async (input, init) => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const headers = new Headers((init as RequestInit | undefined)?.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input as RequestInfo, { ...(init as RequestInit | undefined), headers });
      },
    },
  });

  schemaClients.set(schema, client);
  return client;
}

export const institutionDb: AnyClient = db("institution");
