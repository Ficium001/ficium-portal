-- =============================================================================
-- Migration 12 — Refactor all DB functions off the institution.* / portal_admin.*
-- compat views onto the v2 tables, then drop the 10 compat views.
-- Applied as sub-migrations 12a–12f. Consolidated here for the repo record.
--
-- 12a: get_my_institution_id, get_my_member_id, get_my_modules, has_role,
--      has_module, is_active  → read institution.member / .institution / ."group"
-- 12b: detect_portal_user_type, portal_admin.get_my_group, get_user_groups
--      → read institution.member
-- 12c: institution.approve_action / reject_action → operate on governance.action
--      + audit.event. FIXES a live bug: submissions landed in governance.action
--      but approve/reject read the old institution.pending_actions and always
--      failed with "Action not found". 4-eyes + expiry + audit preserved.
-- 12d: institution._execute_action(uuid) → reads governance.action, writes to
--      institution.member / ."group" / marketplace.bid (was pending_actions row type)
-- 12e: portal_admin._execute_dual_control_action → institution.institution
--      (3 institution.* cases) instead of the institutions view
-- 12f: DROP the 10 compat views (verified zero function/policy/API references)
--
-- Verified end-to-end: RLS helpers, detect_portal_user_type, and the full
-- institution maker-checker (submit → approve by different member → execute →
-- audit) all pass with the views removed.
--
-- See git history for the exact bodies applied via Supabase apply_migration.
-- Views dropped:
--   institution.{institution_members, institutions, groups, institution_api_keys,
--     institution_webhooks, institution_product_config, institution_bids,
--     pending_actions_v}
--   portal_admin.{admin_dual_control_actions_v, admin_users_v}
-- =============================================================================
-- (Function bodies applied individually as migrations 12a-12e; this file is the
--  consolidated record. The DROP statements below are the net schema change.)

DROP VIEW IF EXISTS institution.institution_members        CASCADE;
DROP VIEW IF EXISTS institution.institutions               CASCADE;
DROP VIEW IF EXISTS institution.groups                     CASCADE;
DROP VIEW IF EXISTS institution.institution_api_keys       CASCADE;
DROP VIEW IF EXISTS institution.institution_webhooks       CASCADE;
DROP VIEW IF EXISTS institution.institution_product_config CASCADE;
DROP VIEW IF EXISTS institution.institution_bids           CASCADE;
DROP VIEW IF EXISTS institution.pending_actions_v          CASCADE;
DROP VIEW IF EXISTS portal_admin.admin_dual_control_actions_v CASCADE;
DROP VIEW IF EXISTS portal_admin.admin_users_v             CASCADE;
