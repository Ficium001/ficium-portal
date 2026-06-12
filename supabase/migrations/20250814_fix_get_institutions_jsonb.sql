-- Replace get_institutions with a JSONB-returning version to avoid
-- "structure of query does not match function result type" errors
-- caused by column type mismatches against a typed RETURNS TABLE.

DROP FUNCTION IF EXISTS portal_admin.get_institutions();

CREATE OR REPLACE FUNCTION portal_admin.get_institutions()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT portal_admin.has_permission('institutions:view') THEN
    RAISE EXCEPTION 'Insufficient permissions to view institutions';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM institution.institutions i;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_admin.get_institutions TO authenticated;
