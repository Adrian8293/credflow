-- ════════════════════════════════════════════════════════════════════════════
-- Migration 025: providers confirm their own roster details in the portal
--
-- Two functions, both SECURITY DEFINER and limited to a provider's OWN record:
--   portal_my_details()  reads gender, languages, accepting-new-patients and telehealth
--   portal_save_details() writes only those four fields (validated), and logs it
-- Nothing else about a provider can be changed from the portal. Clinic staff cannot use these.
-- Run AFTER migrations 015 and 023. Free; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION portal_my_details()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org  uuid := current_org_id();
  v_prov uuid;
  r      providers%ROWTYPE;
BEGIN
  IF current_org_role() IS DISTINCT FROM 'provider' THEN
    RAISE EXCEPTION 'not a provider account' USING ERRCODE = '42501';
  END IF;
  SELECT provider_id INTO v_prov FROM organization_members WHERE user_id = auth.uid() AND org_id = v_org;
  IF v_prov IS NULL THEN RAISE EXCEPTION 'no provider record is linked to this account' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM providers WHERE id = v_prov AND org_id = v_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('id', r.id, 'gender', r.gender, 'languages', r.languages,
                            'accepts_new_patients', r.accepts_new_patients, 'telehealth', r.telehealth);
END $$;

CREATE OR REPLACE FUNCTION portal_save_details(p_gender text, p_languages text, p_accepts boolean, p_telehealth boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org  uuid := current_org_id();
  v_prov uuid;
  g      text := NULLIF(btrim(COALESCE(p_gender, '')), '');
  l      text := NULLIF(btrim(COALESCE(p_languages, '')), '');
BEGIN
  IF current_org_role() IS DISTINCT FROM 'provider' THEN
    RAISE EXCEPTION 'not a provider account' USING ERRCODE = '42501';
  END IF;
  SELECT provider_id INTO v_prov FROM organization_members WHERE user_id = auth.uid() AND org_id = v_org;
  IF v_prov IS NULL THEN RAISE EXCEPTION 'no provider record is linked to this account' USING ERRCODE = '42501'; END IF;
  IF g IS NOT NULL AND g NOT IN ('Female', 'Male', 'Non-binary') THEN
    RAISE EXCEPTION 'invalid gender value' USING ERRCODE = '22023';
  END IF;
  IF l IS NOT NULL AND length(l) > 200 THEN
    RAISE EXCEPTION 'languages is too long' USING ERRCODE = '22023';
  END IF;

  UPDATE providers SET gender = g, languages = l, accepts_new_patients = p_accepts, telehealth = p_telehealth
   WHERE id = v_prov AND org_id = v_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider not found' USING ERRCODE = '42501'; END IF;

  -- Best-effort audit entry; never blocks the save.
  BEGIN
    INSERT INTO audit_log (type, action, detail, entity, performed_by, user_email)
    VALUES ('Provider', 'Updated', 'Provider confirmed their roster details in the portal', v_prov, auth.uid(), auth.jwt() ->> 'email');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

REVOKE ALL ON FUNCTION portal_my_details(), portal_save_details(text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_my_details(), portal_save_details(text, text, boolean, boolean) TO authenticated;
