-- =============================================================================
-- Ficium Migration 08e — fix member.updated_at + backfill system_group_id
--
-- Surfaced during 08: institution.member carried an UPDATE trigger
-- (institution_member_updated_at → set_updated_at()) but had no updated_at
-- column, so ANY update to a member row failed with 42703. This also would
-- have broken the new member-admin UPDATE policy from migration 08.
--
-- Fix: add updated_at (parity with every other v2 table), then backfill
-- system_group_id from the legacy group_id by slug match. This retires the
-- last dependency on portal_admin.user_groups for member group resolution.
-- Frontend impact: NONE.
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE institution.member ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE institution.member m
   SET system_group_id = sg.id
  FROM portal_admin.user_groups og
  JOIN admin.system_group sg ON sg.slug = og.slug
 WHERE m.group_id = og.id
   AND m.system_group_id IS NULL;
