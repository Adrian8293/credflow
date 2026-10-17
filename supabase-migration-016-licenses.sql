-- ════════════════════════════════════════════════════════════════════════════
-- Migration 016: licenses in more than one state
--
-- Model: providers.license / license_exp stay the PRIMARY (home-state) license, so OPCA, NPI sync,
-- payer checklists and the watchdog keep working untouched. providers.license_state says which
-- state that primary license is for. Every ADDITIONAL state license is a row in provider_licenses.
-- Run after 014 and 015. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ 1. State of the primary license ═══════════════════════════════════════
ALTER TABLE providers ADD COLUMN IF NOT EXISTS license_state text;
-- Existing data was entered for Oregon (OPCA / Oregon practice). Backfill only where blank.
UPDATE providers SET license_state = 'OR'
 WHERE license_state IS NULL AND (COALESCE(license,'') <> '' OR license_exp IS NOT NULL);

-- ═══ 2. Additional state licenses ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS provider_licenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id  uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  state        text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  license_type text,
  number       text,
  expires      date,
  status       text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Pending','Expired','Inactive')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS provider_licenses_prov_idx ON provider_licenses(provider_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS provider_licenses_org_idx  ON provider_licenses(org_id);
-- one live row per provider + state + license type
CREATE UNIQUE INDEX IF NOT EXISTS provider_licenses_uniq
  ON provider_licenses(provider_id, state, lower(COALESCE(license_type,''))) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_stamp_org ON provider_licenses;
CREATE TRIGGER trg_stamp_org BEFORE INSERT ON provider_licenses
  FOR EACH ROW EXECUTE FUNCTION stamp_org_id();

-- The provider must belong to the same org as the license row (blocks cross-org attachment by id),
-- and updated_at stays honest.
CREATE OR REPLACE FUNCTION provider_licenses_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM providers p WHERE p.id = NEW.provider_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'provider is not in this organization' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
-- Named trg_zz_* on purpose: BEFORE triggers fire alphabetically and this must run AFTER trg_stamp_org
-- has filled org_id.
DROP TRIGGER IF EXISTS trg_licenses_guard ON provider_licenses;
DROP TRIGGER IF EXISTS trg_zz_licenses_guard ON provider_licenses;
CREATE TRIGGER trg_zz_licenses_guard BEFORE INSERT OR UPDATE ON provider_licenses
  FOR EACH ROW EXECUTE FUNCTION provider_licenses_guard();

ALTER TABLE provider_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_read  ON provider_licenses;
DROP POLICY IF EXISTS org_write ON provider_licenses;
CREATE POLICY org_read  ON provider_licenses FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND can_read_org());
CREATE POLICY org_write ON provider_licenses FOR ALL TO authenticated
  USING (org_id = current_org_id() AND is_org_staff())
  WITH CHECK (org_id = current_org_id() AND is_org_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_licenses TO authenticated;

-- Realtime (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE provider_licenses;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ═══ 3. Portal: providers see every license and its expiry ═════════════════
CREATE OR REPLACE FUNCTION portal_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := current_org_role();
  v_org  uuid := current_org_id();
  v_prov uuid;
  provs  jsonb;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('provider','clinic_staff') THEN
    RAISE EXCEPTION 'not a portal user' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'provider' THEN
    SELECT provider_id INTO v_prov FROM organization_members
     WHERE user_id = auth.uid() AND org_id = v_org;
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'name'), '[]'::jsonb) INTO provs FROM (
    SELECT jsonb_build_object(
      'id',   p.id,
      'name', btrim(COALESCE(p.fname,'') || ' ' || COALESCE(p.lname,'')),
      'cred', p.cred,
      'expirations', jsonb_build_array(
        jsonb_build_object('label','State license' || COALESCE(' (' || p.license_state || ')', ''), 'date', p.license_exp),
        jsonb_build_object('label','Malpractice insurance',  'date', p.mal_exp),
        jsonb_build_object('label','DEA registration',       'date', p.dea_exp),
        jsonb_build_object('label','CAQH re-attestation due','date', p.caqh_due),
        jsonb_build_object('label','Supervision agreement',  'date', p.sup_exp)
      ) || COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'label', 'License (' || l.state || ')' || COALESCE(' · ' || NULLIF(l.license_type,''), ''),
                 'date',  l.expires) ORDER BY l.state)
          FROM provider_licenses l
         WHERE l.provider_id = p.id AND l.org_id = v_org AND l.deleted_at IS NULL), '[]'::jsonb),
      'enrollments', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'id', e.id, 'payer', y.name, 'state', e.state, 'level', e.level,
                 'stage', e.stage, 'submitted', e.submitted,
                 'credentialing_effective', e.credentialing_effective, 'effective', e.effective,
                 'billable_from', e.billable_from, 'term_date', e.term_date, 'recred', e.recred
               ) ORDER BY y.name), '[]'::jsonb)
          FROM enrollments e LEFT JOIN payers y ON y.id = e.pay_id
         WHERE e.prov_id = p.id AND e.org_id = v_org AND e.deleted_at IS NULL),
      'requests', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'id', r.id, 'title', r.title, 'doc_type', r.doc_type, 'note', r.note, 'due', r.due,
                 'status', r.status, 'reject_reason', r.reject_reason, 'submitted_at', r.submitted_at,
                 'created_at', r.created_at
               ) ORDER BY r.created_at DESC), '[]'::jsonb)
          FROM (SELECT * FROM doc_requests q
                 WHERE q.prov_id = p.id AND q.org_id = v_org AND q.deleted_at IS NULL
                   AND q.status <> 'cancelled'
                 ORDER BY q.created_at DESC LIMIT 100) r),
      'documents', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'id', d.id, 'type', d.type, 'exp', d.exp, 'file_name', d.file_name
               ) ORDER BY d.type), '[]'::jsonb)
          FROM documents d
         WHERE d.prov_id = p.id AND d.org_id = v_org AND d.deleted_at IS NULL)
    ) AS item
    FROM providers p
    WHERE p.org_id = v_org AND p.deleted_at IS NULL
      AND (v_role = 'clinic_staff' OR p.id = v_prov)
  ) s;

  RETURN jsonb_build_object(
    'role', v_role,
    'org',  (SELECT name FROM organizations WHERE id = v_org),
    'providers', provs
  );
END $$;

-- ═══ 4. Verify ═════════════════════════════════════════════════════════════
-- SELECT count(*) AS primary_license_state_filled FROM providers WHERE license_state IS NOT NULL;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'provider_licenses';  -- expect org_read, org_write
