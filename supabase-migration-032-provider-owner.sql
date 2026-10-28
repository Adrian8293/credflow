-- ════════════════════════════════════════════════════════════════════════════
-- Migration 032 — provider owner ("Assigned to") and the stalled-application thresholds
--   • providers.assignee_id: nullable (every provider starts unassigned). The same guard as tasks (migration 030)
--     makes sure it can only be a staff member of the SAME organization, and a member who leaves or loses a
--     working role is released from their providers as well as their tasks.
--   • settings.stall_days_payer / stall_days_us: how many quiet days before an application is called stalled
--     (30 while the payer has it, 14 when the payer is waiting on us), adjustable between 7 and 120.
-- Additive and re-runnable.  ROLLBACK:  ALTER TABLE providers DROP COLUMN assignee_id;
--   ALTER TABLE settings DROP COLUMN stall_days_payer, DROP COLUMN stall_days_us;  DROP TRIGGER trg_zz_providers_assignee ON providers;
-- Needs migration 030 first (it reuses its guard function and role rule).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE providers ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS providers_org_assignee_idx ON providers (org_id, assignee_id) WHERE deleted_at IS NULL;

-- Same guard function as tasks (it only looks at NEW.org_id and NEW.assignee_id). trg_zz_ so it runs after org_id is stamped.
DROP TRIGGER IF EXISTS trg_zz_providers_assignee ON providers;
CREATE TRIGGER trg_zz_providers_assignee BEFORE INSERT OR UPDATE OF assignee_id ON providers
  FOR EACH ROW EXECUTE FUNCTION tasks_check_assignee();

-- Leaving the team (or moving to a view-only / portal role) releases tasks AND providers.
CREATE OR REPLACE FUNCTION members_release_tasks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NOT assignable_role(NEW.role) THEN
    UPDATE tasks     SET assignee_id = NULL WHERE org_id = OLD.org_id AND assignee_id = OLD.user_id;
    UPDATE providers SET assignee_id = NULL WHERE org_id = OLD.org_id AND assignee_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS stall_days_payer integer NOT NULL DEFAULT 30 CHECK (stall_days_payer BETWEEN 7 AND 120);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS stall_days_us    integer NOT NULL DEFAULT 14 CHECK (stall_days_us    BETWEEN 7 AND 120);

-- VERIFY:  SELECT count(*) FROM providers WHERE assignee_id IS NOT NULL;   -- 0 right after running
