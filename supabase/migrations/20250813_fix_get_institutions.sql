-- Fix: "structure of query does not match function result type"
-- Use JSONB for modules (handles both jsonb and array source columns)
-- and explicit ::TIMESTAMPTZ / ::TEXT casts on every column.

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
  modules               JSONB,
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
    i.id,
    i.name::TEXT,
    i.legal_name::TEXT,
    i.institution_type::TEXT,
    i.country::TEXT,
    i.reg_number::TEXT,
    i.regulator::TEXT,
    i.deployment_model::TEXT,
    to_jsonb(i.modules),
    i.onboarding_stage::TEXT,
    i.compliance_status::TEXT,
    i.approved,
    i.primary_contact_name::TEXT,
    i.primary_contact_email::TEXT,
    i.primary_contact_phone::TEXT,
    i.created_at::TIMESTAMPTZ
  FROM institution.institutions i
  ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_admin.get_institutions TO authenticated;
