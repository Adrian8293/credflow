-- Migration 029 — monthly exclusion screening log (OIG LEIE, SAM.gov, state Medicaid lists)
-- Safe to re-run. Run in the Supabase SQL editor.
--
-- One row per check: which provider, which list, the date checked, the result, and a note. It is an evidence log:
--   · staff (owner, admin, credentialer) can add checks;  · everyone in the organization can read them;
--   · only owner/admin can delete one (to fix a mistaken entry); nobody can edit one — enter a new check instead.
-- No patient data and no dates of birth are stored here.

CREATE TABLE IF NOT EXISTS exclusion_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('OIG LEIE', 'SAM.gov', 'State Medicaid list')),
  checked_on  date NOT NULL DEFAULT current_date,
  result      text NOT NULL DEFAULT 'Clear' CHECK (result IN ('Clear', 'Possible match', 'Confirmed exclusion')),
  note        text,
  checked_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exclusion_checks_prov ON exclusion_checks (provider_id, source, checked_on DESC);
CREATE INDEX IF NOT EXISTS idx_exclusion_checks_org  ON exclusion_checks (org_id);

DROP TRIGGER IF EXISTS trg_stamp_org ON exclusion_checks;
CREATE TRIGGER trg_stamp_org BEFORE INSERT ON exclusion_checks
  FOR EACH ROW EXECUTE FUNCTION stamp_org_id();

-- The provider must belong to the same organization as the check (blocks cross-org attachment by id).
CREATE OR REPLACE FUNCTION exclusion_checks_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM providers p WHERE p.id = NEW.provider_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'provider is not in this organization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
-- trg_zz_* so it fires AFTER trg_stamp_org has filled org_id.
DROP TRIGGER IF EXISTS trg_zz_exclusion_guard ON exclusion_checks;
CREATE TRIGGER trg_zz_exclusion_guard BEFORE INSERT ON exclusion_checks
  FOR EACH ROW EXECUTE FUNCTION exclusion_checks_guard();

ALTER TABLE exclusion_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_read   ON exclusion_checks;
DROP POLICY IF EXISTS org_insert ON exclusion_checks;
DROP POLICY IF EXISTS admin_delete ON exclusion_checks;
CREATE POLICY org_read ON exclusion_checks FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND can_read_org());
CREATE POLICY org_insert ON exclusion_checks FOR INSERT TO authenticated
  WITH CHECK (org_id = current_org_id() AND is_org_staff());
CREATE POLICY admin_delete ON exclusion_checks FOR DELETE TO authenticated
  USING (org_id = current_org_id() AND is_org_admin());
GRANT SELECT, INSERT, DELETE ON exclusion_checks TO authenticated;

-- Two-factor enforcement, like every other tenant table (see migration 017).
DROP POLICY IF EXISTS mfa_required ON exclusion_checks;
CREATE POLICY mfa_required ON exclusion_checks AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_ok()) WITH CHECK (public.mfa_ok());
