-- ════════════════════════════════════════════════════════════════════════════
-- Migration 031 — remove two leftovers found by the permission test in the live database
--   1. A GLOBAL unique index on providers(npi) ("providers_npi_unique_idx") from an earlier manual change. It stops two
--      organizations from using the same NPI (a provider who works with two practices). One NPI per ORGANIZATION is the
--      rule now (index providers_org_npi_unique, migration 027), so the global one is dropped.
--   2. Old storage policies that call a function named is_admin(). Signed-in users cannot run that function, so every
--      file or photo read through the app's normal path failed with "permission denied for function is_admin".
--      The organization-scoped policies from migrations 014 and 027 already cover the same access, so the old ones are dropped.
--      Each dropped policy is printed as a NOTICE, with its definition, in case you ever want to recreate it.
-- Safe to re-run. Nothing here deletes data.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. NPI uniqueness: per organization only
DO $$
DECLARE ix record; clashes int;
BEGIN
  FOR ix IN SELECT indexname, indexdef FROM pg_indexes
             WHERE schemaname = 'public' AND tablename = 'providers'
               AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
               AND substring(indexdef FROM 'USING \w+ \(([^)]*)\)') ~* '^\s*npi\s*$'     -- exactly (npi), no org_id
  LOOP
    EXECUTE format('DROP INDEX public.%I', ix.indexname);
    RAISE NOTICE 'Dropped global NPI index % (%)', ix.indexname, ix.indexdef;
  END LOOP;

  SELECT count(*) INTO clashes FROM (
    SELECT org_id, npi FROM providers
     WHERE deleted_at IS NULL AND npi IS NOT NULL AND btrim(npi) <> ''
     GROUP BY org_id, npi HAVING count(*) > 1) d;
  IF clashes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS providers_org_npi_unique ON providers (org_id, npi)
      WHERE deleted_at IS NULL AND npi IS NOT NULL AND btrim(npi) <> '';
  ELSE
    RAISE NOTICE '% NPI(s) are used twice inside one organization, so the per-organization rule was not (re)created. See migration 027 for the query to find them.', clashes;
  END IF;
END $$;

-- 2. Old storage policies that depend on is_admin()
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname, cmd, qual, with_check FROM pg_policies
              WHERE schemaname = 'storage' AND tablename = 'objects'
                AND (COALESCE(qual,'') ILIKE '%is_admin%' OR COALESCE(with_check,'') ILIKE '%is_admin%')
  LOOP
    RAISE NOTICE 'Dropping old storage policy "%" (% USING % WITH CHECK %)', pol.policyname, pol.cmd, pol.qual, pol.with_check;
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Not allowed to change storage policies from here. In the Supabase dashboard open Storage > Policies and delete any policy that mentions is_admin().';
END $$;

-- 3. Same function used by a policy on one of your own tables? Report only (nothing is changed).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies
              WHERE schemaname = 'public' AND (COALESCE(qual,'') ILIKE '%is_admin%' OR COALESCE(with_check,'') ILIKE '%is_admin%')
  LOOP
    RAISE NOTICE 'Table policy "%" on public.% also uses is_admin(); review it.', pol.policyname, pol.tablename;
  END LOOP;
END $$;
