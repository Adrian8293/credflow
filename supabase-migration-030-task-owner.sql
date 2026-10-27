-- ════════════════════════════════════════════════════════════════════════════
-- Migration 030 — task ownership ("My Tasks")
--   • tasks.assignee_id: nullable, so every existing task simply stays unassigned.
--   • A guard makes sure a task can only be given to a staff member of the SAME organization.
--   • Removing a member (or moving them to a view-only / portal role) un-assigns their open tasks.
--   • org_staff_list(): the people a task can be assigned to, readable by any staff member
--     (org_members_admin() is owner/admin only, so the app could not fill a "who?" list for others).
-- Additive and re-runnable. ROLLBACK:  ALTER TABLE tasks DROP COLUMN assignee_id;  DROP FUNCTION org_staff_list();
--   (then drop the two triggers/functions named below).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_org_assignee_idx ON tasks (org_id, assignee_id) WHERE deleted_at IS NULL;

-- Who may own a task: staff who can open the Tasks page (owner, admin, credentialer). Clinic staff and view-only
-- accounts cannot see tasks, so assigning to them would hide the task from its owner.
CREATE OR REPLACE FUNCTION assignable_role(r text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT r IN ('owner','admin','credentialer') $$;

-- Guard. Named trg_zz_* so it runs AFTER the trigger that stamps org_id (BEFORE triggers fire alphabetically).
CREATE OR REPLACE FUNCTION tasks_check_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members m
                  WHERE m.org_id = NEW.org_id AND m.user_id = NEW.assignee_id AND assignable_role(m.role)) THEN
    RAISE EXCEPTION 'That person cannot be assigned tasks in this organization' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_zz_tasks_assignee ON tasks;
CREATE TRIGGER trg_zz_tasks_assignee BEFORE INSERT OR UPDATE OF assignee_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_check_assignee();

-- When someone leaves or loses a working role, their tasks go back to "Unassigned".
CREATE OR REPLACE FUNCTION members_release_tasks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NOT assignable_role(NEW.role) THEN
    UPDATE tasks SET assignee_id = NULL WHERE org_id = OLD.org_id AND assignee_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_members_release_tasks ON organization_members;
CREATE TRIGGER trg_members_release_tasks AFTER DELETE OR UPDATE OF role ON organization_members
  FOR EACH ROW EXECUTE FUNCTION members_release_tasks();

-- The assignable people in MY organization. Staff only (not viewers, not provider accounts).
CREATE OR REPLACE FUNCTION org_staff_list()
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_staff() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT m.user_id, u.email::text, m.role
      FROM organization_members m JOIN auth.users u ON u.id = m.user_id
     WHERE m.org_id = current_org_id() AND assignable_role(m.role)
     ORDER BY u.email;
END $$;
REVOKE ALL ON FUNCTION org_staff_list(), tasks_check_assignee(), members_release_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION org_staff_list() TO authenticated;

-- VERIFY:  SELECT count(*) FROM tasks WHERE assignee_id IS NOT NULL;   -- 0 right after running
