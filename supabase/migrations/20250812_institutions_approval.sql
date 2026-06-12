-- =============================================================
-- Institutions approval (admin portal)
-- Adds:
--   - portal_admin.get_institutions()  : list institutions for admin review
--   - _execute_dual_control_action     : adds institution.approve,
--                                          institution.suspend,
--                                          institution.modules_update
-- =============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_institutions — cross-schema read for admin staff
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION portal_admin.get_institutions()
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  legal_name            TEXT,
  institution_type      TEXT,
  country               TEXT,
  reg_number            TEXT,
  regulator             TEXT,
  deployment_model      TEXT,
  modules               TEXT[],
  onboarding_stage      TEXT,
  compliance_status     TEXT,
  approved              BOOLEAN,
  primary_contact_name  TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT portal_admin.has_permission('institutions:view') THEN
    RAISE EXCEPTION 'Insufficient permissions to view institutions';
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.name, i.legal_name, i.institution_type::TEXT, i.country,
    i.reg_number, i.regulator, i.deployment_model::TEXT, i.modules,
    i.onboarding_stage::TEXT, i.compliance_status::TEXT, i.approved,
    i.primary_contact_name, i.primary_contact_email, i.primary_contact_phone,
    i.created_at
  FROM institution.institutions i
  ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_admin.get_institutions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend _execute_dual_control_action — institution.approve / suspend / modules_update
-- Full redefinition (carries forward all prior categories).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION portal_admin._execute_dual_control_action(p_action_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action portal_admin.admin_dual_control_actions%ROWTYPE;
  v_payload JSONB;
BEGIN
  SELECT * INTO v_action FROM portal_admin.admin_dual_control_actions WHERE id = p_action_id;
  v_payload := v_action.payload;

  UPDATE portal_admin.admin_dual_control_actions
  SET status = 'executed', executed_at = now()
  WHERE id = p_action_id;

  CASE v_action.action_category

    WHEN 'user.suspend' THEN
      UPDATE portal_admin.admin_users SET
        status             = 'suspended',
        suspended_at       = now(),
        suspended_by       = v_action.checker_id,
        suspension_reason  = v_payload->>'suspension_reason',
        updated_at         = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.unlock' THEN
      UPDATE portal_admin.admin_users SET
        status             = 'active',
        locked_at          = NULL,
        locked_reason      = NULL,
        failed_login_count = 0,
        updated_at         = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.reset_password' THEN
      UPDATE portal_admin.admin_users SET
        force_password_reset = TRUE,
        updated_at           = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.role_change' THEN
      UPDATE portal_admin.admin_users SET
        role_slug  = v_payload->>'new_role_slug',
        updated_at = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;

    WHEN 'user.deactivate' THEN
      UPDATE portal_admin.admin_users SET
        status     = 'deactivated',
        updated_at = now()
      WHERE id = (v_payload->>'admin_user_id')::UUID;
      UPDATE portal_admin.admin_sessions SET
        is_active  = FALSE,
        ended_at   = now(),
        end_reason = 'forced'
      WHERE admin_user_id = (v_payload->>'admin_user_id')::UUID AND is_active = TRUE;

    WHEN 'user.force_logout' THEN
      UPDATE portal_admin.admin_sessions SET
        is_active  = FALSE,
        ended_at   = now(),
        end_reason = 'forced'
      WHERE admin_user_id = (v_payload->>'admin_user_id')::UUID AND is_active = TRUE;

    WHEN 'group.create' THEN
      INSERT INTO portal_admin.user_groups
        (slug, label, description, user_type, module_permissions, is_system, created_by)
      VALUES (
        v_payload->>'slug',
        v_payload->>'label',
        COALESCE(v_payload->>'description', ''),
        COALESCE(v_payload->>'user_type', 'institution'),
        ARRAY(SELECT jsonb_array_elements_text(v_payload->'module_permissions')),
        FALSE,
        v_action.checker_id
      )
      ON CONFLICT (slug) DO NOTHING;

    WHEN 'group.update_modules' THEN
      UPDATE portal_admin.user_groups SET
        module_permissions = ARRAY(SELECT jsonb_array_elements_text(v_payload->'module_permissions')),
        updated_at         = now()
      WHERE id = (v_payload->>'group_id')::UUID AND is_system = FALSE;

    WHEN 'role.create' THEN
      -- Legacy — kept for backward compat
      INSERT INTO portal_admin.user_groups
        (slug, label, description, module_permissions, is_system, created_by)
      VALUES (
        v_payload->>'slug',
        v_payload->>'label',
        COALESCE(v_payload->>'description', ''),
        ARRAY(SELECT jsonb_array_elements_text(v_payload->'permissions')),
        FALSE,
        v_action.checker_id
      )
      ON CONFLICT (slug) DO NOTHING;

    WHEN 'institution.approve' THEN
      UPDATE institution.institutions SET
        approved         = TRUE,
        onboarding_stage = 'approved',
        updated_at       = now()
      WHERE id = (v_payload->>'institution_id')::UUID;

    WHEN 'institution.suspend' THEN
      UPDATE institution.institutions SET
        approved         = FALSE,
        onboarding_stage = 'suspended',
        updated_at       = now()
      WHERE id = (v_payload->>'institution_id')::UUID;

    WHEN 'institution.modules_update' THEN
      UPDATE institution.institutions SET
        modules    = ARRAY(SELECT jsonb_array_elements_text(v_payload->'modules')),
        updated_at = now()
      WHERE id = (v_payload->>'institution_id')::UUID;

    ELSE
      INSERT INTO portal_admin.admin_audit_log
        (action_category, event_label, dual_control_id, outcome, outcome_note)
      VALUES ('execution.unknown', 'Unknown action category: ' || v_action.action_category,
              p_action_id, 'logged', 'No executor registered for this category');

  END CASE;

  EXCEPTION WHEN OTHERS THEN
    UPDATE portal_admin.admin_dual_control_actions
    SET execution_error = SQLERRM, status = 'approved'
    WHERE id = p_action_id;
    RAISE;
END;
$$;
