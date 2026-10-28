-- ════════════════════════════════════════════════════════════════════════════
-- Migration 034 — application owner ("Assigned to")
--   • enrollments.assignee_id: nullable (every application starts unassigned). The same guard as tasks and providers
--     (migrations 030/032) makes sure it can only be a staff member of the SAME organization, and a member who leaves or
--     loses a working role is released from their applications as well as their tasks and providers.
-- Additive and re-runnable.  ROLLBACK:  DROP TRIGGER trg_zz_enrollments_assignee ON enrollments;  ALTER TABLE enrollments DROP COLUMN assignee_id;
-- Needs migrations 030 and 032 first (reuses their guard function and release trigger).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS enrollments_org_assignee_idx ON enrollments (org_id, assignee_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_zz_enrollments_assignee ON enrollments;
CREATE TRIGGER trg_zz_enrollments_assignee BEFORE INSERT OR UPDATE OF assignee_id ON enrollments
  FOR EACH ROW EXECUTE FUNCTION tasks_check_assignee();

CREATE OR REPLACE FUNCTION members_release_tasks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NOT assignable_role(NEW.role) THEN
    UPDATE tasks       SET assignee_id = NULL WHERE org_id = OLD.org_id AND assignee_id = OLD.user_id;
    UPDATE providers   SET assignee_id = NULL WHERE org_id = OLD.org_id AND assignee_id = OLD.user_id;
    UPDATE enrollments SET assignee_id = NULL WHERE org_id = OLD.org_id AND assignee_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION members_release_tasks() FROM PUBLIC, anon;

-- VERIFY:  SELECT count(*) FROM enrollments WHERE assignee_id IS NOT NULL;   -- 0 right after running
