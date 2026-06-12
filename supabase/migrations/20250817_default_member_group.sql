-- =============================================================
-- Fix: newly-registered institution primary admins get no
-- group_id, so they see "No modules assigned to your account"
-- after onboarding (institution_admin group already exists but
-- was never wired up to the registration insert).
--
-- Trigger runs SECURITY DEFINER-equivalent (owned by migration
-- role) so it can read portal_admin.user_groups regardless of
-- the inserting user's RLS grants.
-- =============================================================

CREATE OR REPLACE FUNCTION institution.assign_default_member_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    IF NEW.is_primary_admin THEN
      SELECT id INTO NEW.group_id FROM portal_admin.user_groups WHERE slug = 'institution_admin';
    ELSE
      SELECT id INTO NEW.group_id FROM portal_admin.user_groups WHERE slug = 'bank_officer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_default_member_group ON institution.institution_members;
CREATE TRIGGER trg_assign_default_member_group
  BEFORE INSERT ON institution.institution_members
  FOR EACH ROW EXECUTE FUNCTION institution.assign_default_member_group();

-- ─────────────────────────────────────────────────────────────
-- Backfill MCB's primary admin (and any other existing rows
-- with no group assigned) using the same rule.
-- ─────────────────────────────────────────────────────────────

UPDATE institution.institution_members m
SET group_id = (SELECT id FROM portal_admin.user_groups WHERE slug = 'institution_admin')
WHERE m.group_id IS NULL AND m.is_primary_admin;

UPDATE institution.institution_members m
SET group_id = (SELECT id FROM portal_admin.user_groups WHERE slug = 'bank_officer')
WHERE m.group_id IS NULL AND NOT m.is_primary_admin;
