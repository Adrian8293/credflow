-- ─── Migration 008: Lock down soft_delete_provider ────────────────────────────
-- Problem: SECURITY DEFINER function with no search_path, executable by PUBLIC
-- (Postgres default), which includes the `anon` role / public anon key.
-- Safe to re-run. Does not touch data.
-- ROLLBACK: GRANT EXECUTE ON FUNCTION soft_delete_provider(uuid) TO PUBLIC;  (not recommended)

CREATE OR REPLACE FUNCTION soft_delete_provider(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  now_ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE providers   SET deleted_at = now_ts WHERE id = p_id AND deleted_at IS NULL;
  UPDATE enrollments SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
  UPDATE documents   SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
  UPDATE tasks       SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_provider(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION soft_delete_provider(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION soft_delete_provider(uuid) TO authenticated;

-- Verify (should list only authenticated / postgres / service_role, never anon or PUBLIC):
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_name = 'soft_delete_provider';
-- TODO (next phase): enforce organization_members.role inside this function once roles are seeded.
