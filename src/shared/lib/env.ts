// =============================================================
// Ficium — Environment variable validation (client-side)
//
// Validates all required VITE_ env vars at startup.
// Throws in dev, logs in prod — never silently corrupts.
// =============================================================

const REQUIRED_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];

function getVar(key: RequiredVar): string {
  const val = import.meta.env[key] as string | undefined;
  return val ?? "";
}

export const Env = {
  supabaseUrl:        () => getVar("VITE_SUPABASE_URL"),
  supabasePublicKey:  () => getVar("VITE_SUPABASE_PUBLISHABLE_KEY"),
  isDev:              () => import.meta.env.DEV,
  isProd:             () => import.meta.env.PROD,
  mode:               () => import.meta.env.MODE as "development" | "production" | "test",
} as const;

/** Call once at app startup — throws in dev, warns in prod */
export function validateClientEnv(): void {
  const missing = REQUIRED_VARS.filter((k) => !getVar(k));
  if (missing.length === 0) return;
  const msg = `Missing required environment variables: ${missing.join(", ")}`;
  if (import.meta.env.DEV) throw new Error(msg);
  else console.error(`[ficium] ${msg}`);
}
