-- ════════════════════════════════════════════════════════════════════════════
-- Migration 023: payer roster autofill
--
--  1. Four OPTIONAL provider fields that payer roster forms ask for (gender, languages, accepting new patients, telehealth).
--     Deliberately NOT stored: date of birth, SSN, race/ethnicity, full tax ID. Those stay out of Lacentra.
--  2. payer_roster_maps: remembers, per payer and sheet, which column of the payer's file means what
--     (a map of column HEADING -> Lacentra field). It holds no provider data and not the payer's file itself.
-- Free; safe to re-run. Run after 014. Run BEFORE deploying the matching app version.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE providers ADD COLUMN IF NOT EXISTS gender              text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS languages           text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS accepts_new_patients boolean;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS telehealth          boolean;

CREATE TABLE IF NOT EXISTS payer_roster_maps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payer_id    uuid NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  sheet_name  text NOT NULL,
  mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, payer_id, sheet_name)
);
CREATE INDEX IF NOT EXISTS payer_roster_maps_org_idx ON payer_roster_maps(org_id);

DROP TRIGGER IF EXISTS trg_stamp_org ON payer_roster_maps;
CREATE TRIGGER trg_stamp_org BEFORE INSERT ON payer_roster_maps
  FOR EACH ROW EXECUTE FUNCTION stamp_org_id();

-- The payer must belong to the same org as the map row (blocks cross-org attachment by id).
CREATE OR REPLACE FUNCTION payer_roster_maps_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payers p WHERE p.id = NEW.payer_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'payer is not in this organization' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
-- trg_zz_* so it fires AFTER trg_stamp_org has filled org_id.
DROP TRIGGER IF EXISTS trg_zz_roster_maps_guard ON payer_roster_maps;
CREATE TRIGGER trg_zz_roster_maps_guard BEFORE INSERT OR UPDATE ON payer_roster_maps
  FOR EACH ROW EXECUTE FUNCTION payer_roster_maps_guard();

ALTER TABLE payer_roster_maps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_read  ON payer_roster_maps;
DROP POLICY IF EXISTS org_write ON payer_roster_maps;
CREATE POLICY org_read  ON payer_roster_maps FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND can_read_org());
CREATE POLICY org_write ON payer_roster_maps FOR ALL TO authenticated
  USING (org_id = current_org_id() AND is_org_staff())
  WITH CHECK (org_id = current_org_id() AND is_org_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON payer_roster_maps TO authenticated;
