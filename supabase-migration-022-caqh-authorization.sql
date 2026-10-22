-- ═══════════════════════════════════════════════════════════════════════════════
--  Migration 022 — CAQH authorization status per enrollment
--  A provider must authorize each payer inside CAQH before the payer can read their profile.
--  enrollments.caqh_status:  NULL = not set yet,  'none' = not needed,  'needed' = provider must authorize,
--  'authorized' = done. The provider portal shows 'needed' items so providers know what to do.
--  Safe to run more than once. Run AFTER migrations 015 and 016 (it re-creates portal_summary()).
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS caqh_status text;
DO $$ BEGIN
  ALTER TABLE enrollments ADD CONSTRAINT enrollments_caqh_status_chk CHECK (caqh_status IS NULL OR caqh_status IN ('needed','authorized','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
                 'billable_from', e.billable_from, 'term_date', e.term_date, 'recred', e.recred,
                 'caqh_status', e.caqh_status
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
