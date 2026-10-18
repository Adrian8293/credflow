-- ════════════════════════════════════════════════════════════════════════════
-- Migration 019 (OPTIONAL, DESTRUCTIVE): purge personal data stored by the OPCA feature
--
-- Old OPCA uploads saved a provider's personal and demographic details alongside the credentialing
-- details. This removes the personal ones and keeps everything credentialing needs (licenses, DEA, NPI,
-- education, practice info, work history, references, attestation answers).
--
-- WHAT IS ERASED (set to empty) on opca_profiles:
--   home address, city, state, zip, home phone, mobile phone, personal email,
--   birth date, birth place, citizenship, gender, other names,
--   federal_tax_id and any SSN-like column (full tax IDs must not be stored),
--   REALD race, ethnicity, language, disability
-- WHAT IS ERASED inside providers.opca_data (JSON), if present:
--   the same kinds of keys (reald_*, birth_*, home_*, citizenship, gender, ssn)
--
-- NOT covered: any OPCA PDF files already uploaded to storage. Delete those on the Documents page
-- (or in Supabase → Storage → documents) if you no longer want them; they contain the same details.
--
-- THIS CANNOT BE UNDONE. If you ever use OPCA again, that information must be re-entered or re-uploaded.
-- Take a backup first (Settings → Security → Export Full Backup, or a Supabase backup).
--
-- HOW TO RUN:
--   Step 1. Run the file as it is. It only COUNTS and tells you what it would erase (see the NOTICE lines).
--   Step 2. Change   confirm text := 'NO';   to   confirm text := 'YES';   below and run it again to erase.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  confirm text := 'NO';                      -- <<< change to 'YES' to actually erase
  cols text[] := ARRAY[
    'other_names','home_address','home_city','home_state','home_zip','home_phone','mobile_phone','home_email',
    'birth_date','birth_place','citizenship','gender',
    'reald_race','reald_ethnicity','reald_language','reald_disability'
  ];
  keys text[] := ARRAY[
    'reald_race','reald_ethnicity','reald_language','reald_primary_language','reald_disability',
    'birth_date','birth_place','home_address','home_phone','home_email','citizenship','gender','ssn'
  ];
  c text; k text; n bigint; total_profiles bigint := 0; total_json bigint := 0; present text[] := '{}';
BEGIN
  -- opca_profiles columns
  IF to_regclass('public.opca_profiles') IS NOT NULL THEN
    FOREACH c IN ARRAY cols LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opca_profiles' AND column_name=c) THEN
        present := present || c;
      END IF;
    END LOOP;
    -- Full tax IDs / SSNs are never kept (migration 018 forbids federal_tax_id); also catch any ssn-like column.
    FOR c IN SELECT column_name FROM information_schema.columns
             WHERE table_schema='public' AND table_name='opca_profiles'
               AND (column_name = 'federal_tax_id' OR column_name ILIKE '%ssn%' OR column_name ILIKE '%social_sec%')
    LOOP
      IF NOT (c = ANY(present)) THEN present := present || c; END IF;
    END LOOP;
    IF array_length(present, 1) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.opca_profiles WHERE %s',
        (SELECT string_agg(format('%I IS NOT NULL', x), ' OR ') FROM unnest(present) x)) INTO total_profiles;
      RAISE NOTICE 'opca_profiles: % row(s) hold personal details in %', total_profiles, present;
      IF confirm = 'YES' AND total_profiles > 0 THEN
        EXECUTE format('UPDATE public.opca_profiles SET %s',
          (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(present) x));
        RAISE NOTICE 'opca_profiles: personal columns ERASED on % row(s).', total_profiles;
      END IF;
    END IF;
  END IF;

  -- providers.opca_data JSON
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='providers' AND column_name='opca_data') THEN
    SELECT count(*) INTO total_json FROM public.providers p WHERE p.opca_data ?| keys;
    RAISE NOTICE 'providers.opca_data: % provider(s) hold personal keys', total_json;
    IF confirm = 'YES' AND total_json > 0 THEN
      FOREACH k IN ARRAY keys LOOP
        UPDATE public.providers SET opca_data = opca_data - k WHERE opca_data ? k;
      END LOOP;
      RAISE NOTICE 'providers.opca_data: personal keys ERASED on % provider(s).', total_json;
    END IF;
  END IF;

  IF confirm <> 'YES' THEN
    RAISE NOTICE 'DRY RUN ONLY: nothing was changed. Set confirm to ''YES'' to erase.';
  END IF;
END $$;
