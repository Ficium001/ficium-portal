-- =============================================================================
-- Fix: get_my_group — remove m.active = TRUE (column doesn't exist on
-- institution_members, causing the function to return NULL for institution
-- users, which collapses the entire nav)
-- =============================================================================

CREATE OR REPLACE FUNCTION portal_admin.get_my_group()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_group portal_admin.user_groups%ROWTYPE;
BEGIN
  -- Check admin_users first
  SELECT g.* INTO v_group
  FROM portal_admin.user_groups g
  JOIN portal_admin.admin_users u ON u.group_id = g.id
  WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_group)::JSONB;
  END IF;

  -- Check institution_members (no active filter — column does not exist)
  SELECT g.* INTO v_group
  FROM portal_admin.user_groups g
  JOIN institution.institution_members m ON m.group_id = g.id
  WHERE m.auth_user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_group)::JSONB;
  END IF;

  RETURN NULL;
END;
$$;
