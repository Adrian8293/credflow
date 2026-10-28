-- ════════════════════════════════════════════════════════════════════════════
-- Migration 033 — mandatory completion check for tasks
--   A task can no longer be marked Done without a written note saying what was done (at least 5 characters).
--   The app asks the person this (and whether anything is still pending, which creates a follow-up task) before it
--   saves; this trigger is the safety net so no other route (an old browser tab, an import, a script) can skip it.
--   • tasks.completion_note, completed_at, completed_by — who finished it, when, and what was done.
--   • Old Done tasks stay as they are (no note is invented for them) and can still be edited normally.
--   • Reopening a task clears the completion fields, so finishing it again needs a fresh note.
-- Additive and re-runnable.  ROLLBACK:  DROP TRIGGER trg_zz_tasks_completion ON tasks;  DROP FUNCTION tasks_require_completion();
--   ALTER TABLE tasks DROP COLUMN completion_note, DROP COLUMN completed_at, DROP COLUMN completed_by;
-- Error code 23514 (check violation) is used on purpose: the offline queue treats 23505 as "already applied".
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_note text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION tasks_require_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- An upsert of an existing task arrives here first; the UPDATE rules below decide that case.
    IF NEW.status = 'Done' AND NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.id) THEN
      IF length(btrim(coalesce(NEW.completion_note, ''))) < 5 THEN
        RAISE EXCEPTION 'A task cannot be marked done without a note saying what was done.' USING ERRCODE = '23514';
      END IF;
      NEW.completed_at := now(); NEW.completed_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status = 'Done' AND OLD.status IS DISTINCT FROM 'Done' THEN
    IF length(btrim(coalesce(NEW.completion_note, ''))) < 5 THEN
      RAISE EXCEPTION 'A task cannot be marked done without a note saying what was done.' USING ERRCODE = '23514';
    END IF;
    NEW.completed_at := now(); NEW.completed_by := auth.uid();
  ELSIF NEW.status = 'Done' THEN
    -- Already done: the original completion record stays; the note can be improved but not blanked out.
    NEW.completed_at := OLD.completed_at; NEW.completed_by := OLD.completed_by;
    IF NEW.completion_note IS NULL THEN
      NEW.completion_note := OLD.completion_note;
    ELSIF NEW.completion_note IS DISTINCT FROM OLD.completion_note AND length(btrim(NEW.completion_note)) < 5 THEN
      RAISE EXCEPTION 'The completion note cannot be removed from a finished task.' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'Done' THEN
    NEW.completion_note := NULL; NEW.completed_at := NULL; NEW.completed_by := NULL;   -- reopened
  END IF;
  RETURN NEW;
END $$;

-- trg_zz_ so it runs after the other BEFORE triggers (which stamp org_id etc.).
DROP TRIGGER IF EXISTS trg_zz_tasks_completion ON tasks;
CREATE TRIGGER trg_zz_tasks_completion BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_require_completion();

REVOKE ALL ON FUNCTION tasks_require_completion() FROM PUBLIC, anon, authenticated;
