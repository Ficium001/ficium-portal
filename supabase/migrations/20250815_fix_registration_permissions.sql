-- =============================================================
-- Fix institution self-registration permissions
-- Error seen: "permission denied for schema institution" (403)
-- when a freshly-signed-up user inserts into institution.institutions
-- and institution.institution_members.
-- =============================================================

-- Schema-level access (PostgREST/RLS requires USAGE before table grants apply)
GRANT USAGE ON SCHEMA institution TO authenticated;

-- Table-level grants for self-registration
GRANT SELECT, INSERT ON institution.institutions       TO authenticated;
GRANT SELECT, INSERT ON institution.institution_members TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- institutions: allow any authenticated user to create their own
-- application row, and to read it back (registration + /pending page)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS institutions_insert_self ON institution.institutions;
CREATE POLICY institutions_insert_self ON institution.institutions
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS institutions_select_own ON institution.institutions;
CREATE POLICY institutions_select_own ON institution.institutions
  FOR SELECT TO authenticated
  USING (
    primary_contact_email = (auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM institution.institution_members m
      WHERE m.institution_id = institutions.id
        AND m.auth_user_id   = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- institution_members: allow self-insert during registration,
-- and self-read (useMyInstitution / useMyRole)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS institution_members_insert_self ON institution.institution_members;
CREATE POLICY institution_members_insert_self ON institution.institution_members
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS institution_members_select_self ON institution.institution_members;
CREATE POLICY institution_members_select_self ON institution.institution_members
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM institution.institution_members me
      WHERE me.auth_user_id   = auth.uid()
        AND me.institution_id = institution_members.institution_id
        AND me.active
    )
  );
