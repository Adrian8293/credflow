-- ════════════════════════════════════════════════════════════════════════════
-- Migration 018: data minimization (credentialing only, no patient data, no full tax IDs)
--
-- 1. Removes the retired billing tables (claims, eligibility_checks, claim_denials, payments) -- but ONLY
--    the ones that are empty. They hold patient names / dates of birth / member IDs, which this app no
--    longer collects. A table that still has rows is KEPT and reported, so nothing is destroyed by surprise.
-- 2. Adds a guardrail so a full federal tax ID can never be saved in opca_profiles again (the app already
--    blanks it; this makes the database refuse it too). Existing rows are not touched.
--
-- Run it in the Supabase SQL editor (runs as the owner, so row counts are real). Safe to re-run.
-- Read the NOTICE lines in the output: they say what was dropped and what was kept.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['claim_denials', 'payments', 'claims', 'eligibility_checks'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n = 0 THEN
      EXECUTE format('DROP TABLE public.%I CASCADE', t);
      RAISE NOTICE 'DROPPED empty table: %', t;
    ELSE
      RAISE NOTICE 'KEPT %: it still has % row(s) of old billing data (may include patient information). Export it if you need it, then drop it yourself: DROP TABLE % CASCADE;', t, n, t;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'opca_profiles' AND column_name = 'federal_tax_id') THEN
    ALTER TABLE public.opca_profiles DROP CONSTRAINT IF EXISTS opca_no_full_tax_id;
    -- NOT VALID: enforced for every new or changed row, existing rows are left for you to review.
    ALTER TABLE public.opca_profiles ADD CONSTRAINT opca_no_full_tax_id CHECK (federal_tax_id IS NULL) NOT VALID;
    RAISE NOTICE 'opca_profiles: full tax IDs can no longer be saved.';
  END IF;
END $$;

-- Review (run on their own):
--   SELECT count(*) AS opca_rows_with_a_stored_tax_id FROM opca_profiles WHERE federal_tax_id IS NOT NULL;
--   -- if > 0 and you do not need them:  UPDATE opca_profiles SET federal_tax_id = NULL;
--   SELECT count(*) AS legal_entities_with_ein_last4 FROM legal_entities WHERE ein_last4 IS NOT NULL;  -- last 4 only, by design
