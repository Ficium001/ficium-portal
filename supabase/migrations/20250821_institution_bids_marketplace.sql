-- =============================================================================
-- Ficium Portal — institution_bids table + marketplace views + bid executor
-- Migration: 20250821_institution_bids_marketplace.sql
-- Run after: 20250819_pending_actions_maker_checker.sql
-- =============================================================================

-- ─── 1. institution_bids ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS institution.institution_bids (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID        NOT NULL,              -- public.requests.id (cross-schema ref)
  institution_id  UUID        NOT NULL REFERENCES institution.institutions(id) ON DELETE CASCADE,
  rate            NUMERIC     NOT NULL CHECK (rate > 0),
  rate_type       TEXT        NOT NULL DEFAULT 'fixed' CHECK (rate_type IN ('fixed','variable')),
  amount_offered  NUMERIC     NOT NULL CHECK (amount_offered > 0),
  term_months     INTEGER     NOT NULL CHECK (term_months > 0),
  conditions      JSONB,
  submitted_via   TEXT        NOT NULL DEFAULT 'portal',
  status          TEXT        NOT NULL DEFAULT 'submitted'
                              CHECK (status IN ('submitted','accepted','rejected','expired','withdrawn')),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inst_bids_institution
  ON institution.institution_bids (institution_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_inst_bids_request
  ON institution.institution_bids (request_id, status);

ALTER TABLE institution.institution_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution.institution_bids FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inst_bids_select ON institution.institution_bids;
CREATE POLICY inst_bids_select ON institution.institution_bids
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT ctx.institution_id FROM institution.current_member_ctx() ctx));

-- No direct INSERT/UPDATE — only via approve_action (SECURITY DEFINER)
GRANT SELECT ON institution.institution_bids TO authenticated;

-- ─── 2. my_bids view ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW institution.my_bids AS
SELECT
  b.id,
  b.request_id,
  b.institution_id,
  b.rate,
  b.rate_type,
  b.amount_offered,
  b.term_months,
  b.conditions,
  b.status,
  b.submitted_via,
  b.submitted_at,
  b.created_at
FROM institution.institution_bids b;
-- RLS on base table scopes this to the caller's institution automatically

GRANT SELECT ON institution.my_bids TO authenticated;

-- ─── 3. bid.submit executor ──────────────────────────────────────────────────
-- Replaces the last version of _execute_action with bid.submit support added.

CREATE OR REPLACE FUNCTION institution._execute_action(p_action institution.pending_actions)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = institution, portal_admin
AS $$
DECLARE
  v_group_id UUID;
  v_members  INT;
BEGIN
  CASE p_action.action_category

    WHEN 'group.create' THEN
      IF (p_action.payload->>'slug') !~ '^[a-z0-9_]{2,40}$' THEN
        RAISE EXCEPTION 'Invalid group slug';
      END IF;
      INSERT INTO institution.groups
        (institution_id, slug, label, description, module_permissions, created_by)
      VALUES (
        p_action.institution_id,
        p_action.payload->>'slug',
        COALESCE(p_action.payload->>'label', p_action.payload->>'slug'),
        COALESCE(p_action.payload->>'description', ''),
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions')),
          '{}'::TEXT[]
        ),
        p_action.maker_id
      );

    WHEN 'group.update_modules' THEN
      UPDATE institution.groups
      SET module_permissions =
            ARRAY(SELECT jsonb_array_elements_text(p_action.payload->'module_permissions'))
      WHERE id = (p_action.payload->>'group_id')::UUID
        AND institution_id = p_action.institution_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'group.delete' THEN
      v_group_id := (p_action.payload->>'group_id')::UUID;
      SELECT count(*) INTO v_members
      FROM institution.institution_members
      WHERE custom_group_id = v_group_id;
      IF v_members > 0 THEN
        RAISE EXCEPTION 'Group has % member(s) — reassign them first', v_members;
      END IF;
      DELETE FROM institution.groups
      WHERE id = v_group_id
        AND institution_id = p_action.institution_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;

    WHEN 'user.create' THEN
      IF (p_action.payload->>'email') IS NULL THEN
        RAISE EXCEPTION 'user.create requires email in payload';
      END IF;
      IF (p_action.payload->>'custom_group_id') IS NULL THEN
        RAISE EXCEPTION 'user.create requires custom_group_id in payload';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM institution.groups
        WHERE id = (p_action.payload->>'custom_group_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;
      -- Actual provisioning handled by provision-institution-user Edge Function.

    WHEN 'user.assign_group' THEN
      IF NOT EXISTS (
        SELECT 1 FROM institution.institution_members
        WHERE id = (p_action.payload->>'member_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Member not found in this institution';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM institution.groups
        WHERE id = (p_action.payload->>'custom_group_id')::UUID
          AND institution_id = p_action.institution_id
      ) THEN
        RAISE EXCEPTION 'Group not found in this institution';
      END IF;
      UPDATE institution.institution_members
      SET
        custom_group_id = (p_action.payload->>'custom_group_id')::UUID,
        member_role     = COALESCE(p_action.payload->>'member_role', member_role)
      WHERE id             = (p_action.payload->>'member_id')::UUID
        AND institution_id = p_action.institution_id;

    WHEN 'bid.submit' THEN
      -- Insert bid into institution_bids on approval
      INSERT INTO institution.institution_bids
        (request_id, institution_id, rate, rate_type,
         amount_offered, term_months, conditions, submitted_via)
      VALUES (
        (p_action.payload->>'request_id')::UUID,
        p_action.institution_id,
        (p_action.payload->>'rate')::NUMERIC,
        COALESCE(p_action.payload->>'rate_type', 'fixed'),
        (p_action.payload->>'amount_offered')::NUMERIC,
        (p_action.payload->>'term_months')::INTEGER,
        p_action.payload->'conditions',
        COALESCE(p_action.payload->>'submitted_via', 'portal')
      );

    ELSE
      RAISE EXCEPTION 'No executor for category %', p_action.action_category;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION institution._execute_action(institution.pending_actions) FROM PUBLIC;
