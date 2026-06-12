-- Fix: "infinite recursion detected in policy for relation institution_members"
-- The previous policy referenced institution_members from within its own
-- USING clause. Simplify to self-row only (sufficient for useMyInstitution /
-- useMyRole). Cross-member visibility for admins can be added later via a
-- SECURITY DEFINER function if needed.

DROP POLICY IF EXISTS institution_members_select_self ON institution.institution_members;
CREATE POLICY institution_members_select_self ON institution.institution_members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
