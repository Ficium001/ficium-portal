// =============================================================
// Ficium — Institution data clients
// Thin re-export of the shared Supabase factory. Kept as a stable
// import path for institution-feature code; all clients share the
// one auth session defined in shared/lib/supabase.ts.
// =============================================================
import { institutionDb, supabase } from "@/shared/lib/supabase";

/** institution.* schema client (shares the global auth session). */
export const institutionSupabase = institutionDb;

/** public.* schema client — for cross-schema reads. */
export const publicSupabase = supabase;

export default institutionSupabase;
