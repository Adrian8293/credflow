-- ─────────────────────────────────────────────────────────────────────────────
--  Migration 014 — Multi-organization tenancy, roles, org-scoped security
--
--  WHAT IT DOES
--   1. Creates `organizations` (one row per owner/client group) and seeds it from
--      your existing org_id.
--   2. Lets one login belong to several organizations (active-org switcher).
--   3. Adds roles: owner, admin, credentialer, viewer, clinic_staff, provider.
--      (clinic_staff and provider get NO table access yet — the portal comes next.)
--   4. Adds org_id to every tenant table (incl. the 009–013 tables), backfills it,
--      and stamps it automatically on insert (so the app's existing inserts keep working).
--   5. REPLACES the open "auth_full_access" policies with org-scoped, role-aware ones.
--   6. Makes `settings` one row per organization instead of one global row (id = 1).
--
--  SAFETY
--   - Idempotent: safe to re-run.
--   - No lockout: every existing auth user without a membership is added to your
--     existing org BEFORE the old policies are dropped.
--   - Run the verification queries at the bottom afterwards.
--   - Billing tables (claims, eligibility_checks, claim_denials, payments) are left in
--     place but locked down; drop them yourself when ready (see the end of this file).
--
--  RUN ORDER: after 013. Deploy the matching app zip right after (the app reads the
--  new settings shape and the org switcher RPCs).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. Organizations ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ═══ 2. Memberships: roles + provider link + created_at ═════════════════════
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS provider_id uuid;   -- for role = 'provider'
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'organization_members'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE organization_members DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE organization_members
    ADD CONSTRAINT organization_members_role_check
    CHECK (role IN ('owner','admin','credentialer','viewer','clinic_staff','provider'));
END $$;

-- Active org per user (the switcher writes here)
CREATE TABLE IF NOT EXISTS user_active_org (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id  uuid NOT NULL
);
ALTER TABLE user_active_org ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_active_org ON user_active_org;
CREATE POLICY own_active_org ON user_active_org FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ═══ 3. Seed: existing org + users (BEFORE touching any policy) ═════════════
DO $$
DECLARE v_org uuid; v_name text; v_first uuid; n_added int;
BEGIN
  SELECT org_id INTO v_org FROM organization_members ORDER BY created_at LIMIT 1;

  IF v_org IS NULL THEN
    -- No memberships at all: create the first org and make the earliest user its owner.
    v_org := gen_random_uuid();
    SELECT id INTO v_first FROM auth.users ORDER BY created_at LIMIT 1;
    IF v_first IS NOT NULL THEN
      INSERT INTO organization_members (org_id, user_id, role) VALUES (v_org, v_first, 'owner');
    END IF;
  END IF;

  BEGIN
    SELECT NULLIF(btrim(practice), '') INTO v_name FROM settings LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_name := NULL;
  END;

  INSERT INTO organizations (id, name)
  SELECT DISTINCT m.org_id, COALESCE(v_name, 'Positive Inner Self, LLC')
  FROM organization_members m
  WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = m.org_id);

  -- Every existing login without a membership joins that org (they already have full access today).
  INSERT INTO organization_members (org_id, user_id, role)
  SELECT v_org, u.id, 'admin' FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id);
  GET DIAGNOSTICS n_added = ROW_COUNT;
  RAISE NOTICE 'Default org: %. Existing users added as admin: %', v_org, n_added;
END $$;

-- ═══ 4. Helper functions ════════════════════════════════════════════════════
-- Active org: the user's choice if still a member, else their oldest membership.
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.org_id FROM user_active_org a
       JOIN organization_members m ON m.org_id = a.org_id AND m.user_id = a.user_id
      WHERE a.user_id = auth.uid()),
    (SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      ORDER BY created_at, org_id LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION current_org_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM organization_members
   WHERE user_id = auth.uid() AND org_id = current_org_id();
$$;

-- Staff = the people who run credentialing. Read-only roles are listed separately.
CREATE OR REPLACE FUNCTION is_org_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_org_role() IN ('owner','admin','credentialer'), false);
$$;
CREATE OR REPLACE FUNCTION can_read_org()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_org_role() IN ('owner','admin','credentialer','viewer'), false);
$$;
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_org_role() IN ('owner','admin'), false);
$$;

-- Switcher: list my organizations
CREATE OR REPLACE FUNCTION my_orgs()
RETURNS TABLE (org_id uuid, name text, role text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.org_id, o.name, m.role, (m.org_id = current_org_id())
    FROM organization_members m JOIN organizations o ON o.id = m.org_id
   WHERE m.user_id = auth.uid()
   ORDER BY o.name;
$$;

-- Switcher: change the active org (must be a member)
CREATE OR REPLACE FUNCTION set_active_org(p_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = p_org) THEN
    RAISE EXCEPTION 'Not a member of that organization';
  END IF;
  INSERT INTO user_active_org (user_id, org_id) VALUES (auth.uid(), p_org)
  ON CONFLICT (user_id) DO UPDATE SET org_id = EXCLUDED.org_id;
END $$;

-- New client group: caller becomes owner and the org becomes active.
CREATE OR REPLACE FUNCTION create_organization(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Name required'; END IF;
  -- Only an owner/admin of an existing org may create more orgs (blocks self-signup abuse).
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'Only an owner or admin can create organizations';
  END IF;
  INSERT INTO organizations (id, name) VALUES (v, btrim(p_name));
  INSERT INTO organization_members (org_id, user_id, role) VALUES (v, auth.uid(), 'owner');
  PERFORM set_active_org(v);
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION my_orgs(), set_active_org(uuid), create_organization(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_orgs(), set_active_org(uuid), create_organization(text) TO authenticated;
REVOKE ALL ON FUNCTION current_org_id(), current_org_role(), is_org_staff(), can_read_org(), is_org_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_org_id(), current_org_role(), is_org_staff(), can_read_org(), is_org_admin() TO authenticated;

-- ═══ 5. Policies on the tenancy tables themselves ═══════════════════════════
DROP POLICY IF EXISTS own_membership ON organization_members;
DROP POLICY IF EXISTS org_admin_read_members ON organization_members;
CREATE POLICY own_membership ON organization_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY org_admin_read_members ON organization_members FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND is_org_admin());

DROP POLICY IF EXISTS member_read_org ON organizations;
DROP POLICY IF EXISTS admin_update_org ON organizations;
CREATE POLICY member_read_org ON organizations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id = organizations.id AND m.user_id = auth.uid()));
CREATE POLICY admin_update_org ON organizations FOR UPDATE TO authenticated
  USING (id = current_org_id() AND is_org_admin()) WITH CHECK (id = current_org_id() AND is_org_admin());

-- ═══ 6. org_id on every tenant table: add, backfill, stamp, policies ═══════
-- Stamp trigger: fills org_id from the caller's active org when the insert leaves it null.
CREATE OR REPLACE FUNCTION stamp_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN NEW.org_id := current_org_id(); END IF;
  RETURN NEW;
END $$;

-- Default org used to backfill legacy rows (oldest organization).
CREATE OR REPLACE FUNCTION _default_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM organizations ORDER BY created_at, id LIMIT 1;
$$;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'providers','enrollments','documents','payers','tasks','audit_log','settings',
    'oig_checks','opca_profiles',
    'enrollment_contacts','enrollment_checklist',
    'legal_entities','entity_locations','payer_contracts',
    'claims','eligibility_checks','claim_denials','payments'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS org_id uuid', t);
    EXECUTE format('UPDATE %I SET org_id = _default_org() WHERE org_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (org_id)', 'idx_' || t || '_org', t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_org ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_stamp_org BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION stamp_org_id()', t);

    -- Drop EVERY existing policy (removes auth_full_access and all legacy leftovers)
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON %I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    IF t = 'audit_log' THEN
      -- Append-only: staff may read and insert; nobody updates or deletes.
      EXECUTE 'CREATE POLICY org_read ON audit_log FOR SELECT TO authenticated USING (org_id = current_org_id() AND can_read_org())';
      EXECUTE 'CREATE POLICY org_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (org_id = current_org_id() AND is_org_staff())';
    ELSE
      EXECUTE format('CREATE POLICY org_read ON %I FOR SELECT TO authenticated USING (org_id = current_org_id() AND can_read_org())', t);
      EXECUTE format('CREATE POLICY org_write ON %I FOR ALL TO authenticated USING (org_id = current_org_id() AND is_org_staff()) WITH CHECK (org_id = current_org_id() AND is_org_staff())', t);
    END IF;
  END LOOP;
END $$;

-- ═══ 7. settings: one row per organization (was a single global id = 1 row) ═
DO $$
DECLARE pk text;
BEGIN
  IF to_regclass('public.settings') IS NULL THEN RETURN; END IF;
  SELECT conname INTO pk FROM pg_constraint WHERE conrelid = 'settings'::regclass AND contype = 'p';
  IF pk IS NOT NULL THEN EXECUTE format('ALTER TABLE settings DROP CONSTRAINT %I', pk); END IF;
  -- keep only the newest row per org before enforcing uniqueness
  DELETE FROM settings a USING settings b
   WHERE a.org_id = b.org_id AND a.ctid < b.ctid;
  CREATE UNIQUE INDEX IF NOT EXISTS settings_org_unique ON settings (org_id);
END $$;

-- ═══ 8. soft_delete_provider: it is SECURITY DEFINER (bypasses RLS) so it must check the org ═
CREATE OR REPLACE FUNCTION soft_delete_provider(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE now_ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT is_org_staff() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM providers WHERE id = p_id AND org_id = current_org_id()) THEN
    RAISE EXCEPTION 'provider not found in this organization' USING ERRCODE = '42501';
  END IF;
  UPDATE providers   SET deleted_at = now_ts WHERE id = p_id      AND deleted_at IS NULL;
  UPDATE enrollments SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
  UPDATE documents   SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
  UPDATE tasks       SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION soft_delete_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soft_delete_provider(uuid) TO authenticated;

-- ═══ 9. Storage: `documents` bucket scoped to the caller's organization ═════
-- Uploads and signed-URL reads go through server API routes (service role, org-checked).
-- The browser may still list/delete files, so limit that to files whose first path
-- segment is a provider id belonging to the caller's active organization.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND (COALESCE(qual,'') ILIKE '%''documents''%' OR COALESCE(with_check,'') ILIKE '%''documents''%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;

  CREATE POLICY documents_org_select ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'documents' AND can_read_org() AND EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()));
  CREATE POLICY documents_org_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'documents' AND is_org_staff() AND EXISTS (
      SELECT 1 FROM public.providers p
       WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not edit storage policies from here. In Dashboard > Storage > Policies, remove any broad policy on the "documents" bucket.';
END $$;

-- ═══ VERIFY (run after; all should look right) ═══════════════════════════════
-- 1) Every tenant table should show 0 rows with null org_id:
--    SELECT 'providers' t, count(*) FROM providers WHERE org_id IS NULL
--    UNION ALL SELECT 'enrollments', count(*) FROM enrollments WHERE org_id IS NULL
--    UNION ALL SELECT 'documents', count(*) FROM documents WHERE org_id IS NULL
--    UNION ALL SELECT 'payers', count(*) FROM payers WHERE org_id IS NULL
--    UNION ALL SELECT 'tasks', count(*) FROM tasks WHERE org_id IS NULL;
-- 2) No leftover open policies (expect 0 rows):
--    SELECT tablename, policyname FROM pg_policies
--     WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true');
-- 3) Your memberships:
--    SELECT * FROM organization_members;
--
-- OPTIONAL, when you are sure (destructive): remove the retired billing tables
--    DROP TABLE IF EXISTS claim_denials, payments, claims, eligibility_checks CASCADE;
-- ─────────────────────────────────────────────────────────────────────────────
