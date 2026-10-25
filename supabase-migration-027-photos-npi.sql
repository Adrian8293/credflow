-- Migration 027 — provider photo bucket lockdown + one NPI per organization
-- Safe to re-run. Run in the Supabase SQL editor.
--
-- 1) `provider-photos` becomes a PRIVATE bucket. Only people in the same organization can read or change a
--    provider's photo (the first folder in the file path is the provider id). The app now shows photos through
--    short-lived signed links, so nothing is readable by anyone who merely knows the web address.
-- 2) A provider's NPI can be used only once per organization (active providers only). This is skipped, with a
--    notice that lists how many clashes exist, if your data still has duplicates — fix those, then re-run.

-- ═══ 1. Photos ═══════════════════════════════════════════════════════════════
DO $$
DECLARE pol record;
BEGIN
  INSERT INTO storage.buckets (id, name, public) VALUES ('provider-photos', 'provider-photos', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND (COALESCE(qual,'') ILIKE '%provider-photos%' OR COALESCE(with_check,'') ILIKE '%provider-photos%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;

  CREATE POLICY photos_org_select ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'provider-photos' AND can_read_org() AND EXISTS (
      SELECT 1 FROM public.providers p WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()));
  CREATE POLICY photos_org_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'provider-photos' AND is_org_staff() AND EXISTS (
      SELECT 1 FROM public.providers p WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()));
  CREATE POLICY photos_org_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'provider-photos' AND is_org_staff() AND EXISTS (
      SELECT 1 FROM public.providers p WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()))
    WITH CHECK (bucket_id = 'provider-photos' AND is_org_staff() AND EXISTS (
      SELECT 1 FROM public.providers p WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()));
  CREATE POLICY photos_org_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'provider-photos' AND is_org_staff() AND EXISTS (
      SELECT 1 FROM public.providers p WHERE p.id::text = split_part(name, '/', 1) AND p.org_id = current_org_id()));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not edit storage from here. In Dashboard > Storage, open "provider-photos", turn OFF "Public bucket", and remove any broad policy on it.';
END $$;

-- ═══ 2. One NPI per organization ═════════════════════════════════════════════
DO $$
DECLARE clashes int;
BEGIN
  SELECT count(*) INTO clashes FROM (
    SELECT org_id, npi FROM providers
     WHERE deleted_at IS NULL AND npi IS NOT NULL AND btrim(npi) <> ''
     GROUP BY org_id, npi HAVING count(*) > 1) d;
  IF clashes > 0 THEN
    RAISE NOTICE '% NPI number(s) are used by more than one active provider in the same organization, so the uniqueness rule was NOT added. Find them with: SELECT npi, count(*) FROM providers WHERE deleted_at IS NULL AND npi IS NOT NULL AND btrim(npi) <> '''' GROUP BY org_id, npi HAVING count(*) > 1;  Merge or remove the extras, then run this file again.', clashes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS providers_org_npi_unique ON providers (org_id, npi)
      WHERE deleted_at IS NULL AND npi IS NOT NULL AND btrim(npi) <> '';
  END IF;
END $$;

-- ═══ 3. Document requests: the "provider must be in this organization" check really runs ═══
-- The check was named trg_doc_requests_provider, which fires BEFORE the trigger that fills in org_id
-- (BEFORE triggers run alphabetically), so it saw an empty org and let any provider id through.
-- Renaming it to trg_zz_* makes it run after org_id is set. (Found by the new permission tests.)
DROP TRIGGER IF EXISTS trg_doc_requests_provider ON doc_requests;
DROP TRIGGER IF EXISTS trg_zz_doc_requests_provider ON doc_requests;
CREATE TRIGGER trg_zz_doc_requests_provider BEFORE INSERT OR UPDATE OF prov_id ON doc_requests
  FOR EACH ROW EXECUTE FUNCTION doc_requests_check_provider();
