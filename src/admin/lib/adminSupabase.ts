/**
 * @module admin/lib/adminSupabase
 * @description Supabase client for portal_admin schema.
 * Reuses the shared portal auth session — admin users log in
 * via the same Supabase project as institution users but
 * access a different schema with separate RLS policies.
 */
import { db } from '../../shared/lib/supabase'

const adminDb = db('portal_admin')
export default adminDb
