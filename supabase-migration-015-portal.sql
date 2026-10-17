-- ─────────────────────────────────────────────────────────────────────────────
--  Migration 015 — Provider / clinic-staff portal, document requests, invites, access admin
--  Run AFTER 014.  Idempotent.
--
--  DESIGN
--   Portal users (roles `provider` and `clinic_staff`) get NO direct table access.
--   Everything they see comes from portal_summary(), a SECURITY DEFINER function that returns
--   a curated payload (no notes, no contact log, no tax IDs, no payer rates, no other org's rows).
--   Their uploads go through a server API route that first calls portal_authorize_upload().
--
--   doc_requests : staff ask a provider for a document / info; provider uploads; staff review.
--   portal_invites: one-time invite links (token stored hashed) so people create their OWN
--                   password. Public self-signup stays OFF in Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. Document requests ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS doc_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid,
  prov_id       uuid NOT NULL,
  doc_type      text NOT NULL,
  title         text NOT NULL,
  note          text,                       -- visible to the provider
  due           date,
  status        text NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','submitted','approved','rejected','cancelled')),
  reject_reason text,                       -- visible to the provider
  document_id   uuid,
  doc_exp       date,                       -- expiration date the provider entered on upload
  requested_by  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_doc_requests_org  ON doc_requests (org_id);
CREATE INDEX IF NOT EXISTS idx_doc_requests_prov ON doc_requests (prov_id, status);

DROP TRIGGER IF EXISTS trg_stamp_org ON doc_requests;
CREATE TRIGGER trg_stamp_org BEFORE INSERT ON doc_requests FOR EACH ROW EXECUTE FUNCTION stamp_org_id();

ALTER TABLE doc_requests ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='doc_requests' LOOP
    EXECUTE format('DROP POLICY %I ON doc_requests', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY org_read  ON doc_requests FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND can_read_org());
CREATE POLICY org_write ON doc_requests FOR ALL TO authenticated
  USING (org_id = current_org_id() AND is_org_staff())
  WITH CHECK (org_id = current_org_id() AND is_org_staff());

-- A request may only point at a provider of the same organization.
CREATE OR REPLACE FUNCTION doc_requests_check_provider() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM providers p WHERE p.id = NEW.prov_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'provider is not in this organization';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_doc_requests_provider ON doc_requests;
CREATE TRIGGER trg_doc_requests_provider BEFORE INSERT OR UPDATE OF prov_id ON doc_requests
  FOR EACH ROW EXECUTE FUNCTION doc_requests_check_provider();

-- ═══ 2. Invites ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin','credentialer','viewer','clinic_staff','provider')),
  provider_id uuid,                          -- required when role = 'provider'
  token_hash  text NOT NULL UNIQUE,          -- sha256 of the one-time token; the token itself is never stored
  expires_at  timestamptz NOT NULL,
  invited_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at  timestamptz,
  CONSTRAINT provider_role_needs_provider CHECK (role <> 'provider' OR provider_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_portal_invites_org ON portal_invites (org_id);

DROP TRIGGER IF EXISTS trg_stamp_org ON portal_invites;
CREATE TRIGGER trg_stamp_org BEFORE INSERT ON portal_invites FOR EACH ROW EXECUTE FUNCTION stamp_org_id();

ALTER TABLE portal_invites ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='portal_invites' LOOP
    EXECUTE format('DROP POLICY %I ON portal_invites', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY admin_all ON portal_invites FOR ALL TO authenticated
  USING (org_id = current_org_id() AND is_org_admin())
  WITH CHECK (org_id = current_org_id() AND is_org_admin());

-- ═══ 3. portal_summary(): the ONLY thing portal users can read ═══════════════
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
        jsonb_build_object('label','State license',          'date', p.license_exp),
        jsonb_build_object('label','Malpractice insurance',  'date', p.mal_exp),
        jsonb_build_object('label','DEA registration',       'date', p.dea_exp),
        jsonb_build_object('label','CAQH re-attestation due','date', p.caqh_due),
        jsonb_build_object('label','Supervision agreement',  'date', p.sup_exp)
      ),
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

-- ═══ 4. Upload authorization (called by the server API with the user's session) ═
CREATE OR REPLACE FUNCTION portal_authorize_upload(p_provider uuid, p_request uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := current_org_role();
  v_org  uuid := current_org_id();
  v_mine uuid;
  r      doc_requests%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('provider','clinic_staff') THEN
    RAISE EXCEPTION 'not a portal user' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'provider' THEN
    SELECT provider_id INTO v_mine FROM organization_members WHERE user_id = auth.uid() AND org_id = v_org;
    IF v_mine IS NULL OR v_mine <> p_provider THEN
      RAISE EXCEPTION 'not your record' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM providers WHERE id = p_provider AND org_id = v_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'provider not found' USING ERRCODE = '42501';
  END IF;

  IF p_request IS NOT NULL THEN
    SELECT * INTO r FROM doc_requests
     WHERE id = p_request AND org_id = v_org AND prov_id = p_provider AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'request not found' USING ERRCODE = '42501'; END IF;
    IF r.status NOT IN ('requested','rejected') THEN
      RAISE EXCEPTION 'this request is not open' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_build_object('org_id', v_org, 'prov_id', p_provider, 'user_id', auth.uid(),
                            'doc_type', r.doc_type, 'title', r.title);
END $$;

-- ═══ 5. Access administration (owner/admin only) ═════════════════════════════
CREATE OR REPLACE FUNCTION org_members_admin()
RETURNS TABLE (user_id uuid, email text, role text, provider_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_org_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT m.user_id, u.email::text, m.role, m.provider_id, m.created_at
      FROM organization_members m JOIN auth.users u ON u.id = m.user_id
     WHERE m.org_id = current_org_id()
     ORDER BY m.created_at;
END $$;

CREATE OR REPLACE FUNCTION set_member_role(p_user uuid, p_role text, p_provider uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := current_org_id();
  v_me  text := current_org_role();
  v_cur text;
BEGIN
  IF NOT is_org_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('owner','admin','credentialer','viewer','clinic_staff','provider') THEN
    RAISE EXCEPTION 'unknown role'; END IF;
  SELECT role INTO v_cur FROM organization_members WHERE org_id = v_org AND user_id = p_user;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;
  -- Only an owner may grant or change the owner role.
  IF (p_role = 'owner' OR v_cur = 'owner') AND v_me <> 'owner' THEN
    RAISE EXCEPTION 'only an owner can change owners' USING ERRCODE = '42501'; END IF;
  -- Never leave an organization without an owner.
  IF v_cur = 'owner' AND p_role <> 'owner'
     AND (SELECT count(*) FROM organization_members WHERE org_id = v_org AND role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'an organization needs at least one owner'; END IF;
  IF p_role = 'provider' THEN
    IF p_provider IS NULL OR NOT EXISTS (SELECT 1 FROM providers WHERE id = p_provider AND org_id = v_org) THEN
      RAISE EXCEPTION 'choose a provider record from this organization'; END IF;
  ELSE
    p_provider := NULL;
  END IF;
  UPDATE organization_members SET role = p_role, provider_id = p_provider
   WHERE org_id = v_org AND user_id = p_user;
END $$;

CREATE OR REPLACE FUNCTION remove_member(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := current_org_id(); v_cur text;
BEGIN
  IF NOT is_org_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'you cannot remove yourself'; END IF;
  SELECT role INTO v_cur FROM organization_members WHERE org_id = v_org AND user_id = p_user;
  IF v_cur IS NULL THEN RETURN; END IF;
  IF v_cur = 'owner' AND current_org_role() <> 'owner' THEN
    RAISE EXCEPTION 'only an owner can remove an owner' USING ERRCODE = '42501'; END IF;
  IF v_cur = 'owner' AND (SELECT count(*) FROM organization_members WHERE org_id = v_org AND role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'an organization needs at least one owner'; END IF;
  DELETE FROM organization_members WHERE org_id = v_org AND user_id = p_user;
  DELETE FROM user_active_org WHERE user_id = p_user AND org_id = v_org;
END $$;

REVOKE ALL ON FUNCTION portal_summary(), portal_authorize_upload(uuid, uuid), org_members_admin(),
                       set_member_role(uuid, text, uuid), remove_member(uuid), doc_requests_check_provider()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_summary(), portal_authorize_upload(uuid, uuid), org_members_admin(),
                          set_member_role(uuid, text, uuid), remove_member(uuid) TO authenticated;

-- ═══ VERIFY ═════════════════════════════════════════════════════════════════
-- SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('doc_requests','portal_invites');
-- (portal users must NOT appear in any policy: they have no table access by design)
