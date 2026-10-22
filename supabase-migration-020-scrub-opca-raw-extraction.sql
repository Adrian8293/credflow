-- ════════════════════════════════════════════════════════════════════════════
-- Migration 020 (OPTIONAL, DESTRUCTIVE): scrub personal details from opca_profiles.raw_extraction
--
-- Migration 019 cleared the personal COLUMNS of opca_profiles, but every OPCA upload also saved a full copy of the
-- extracted form in raw_extraction (a JSON column), including home address, birth date, phone, email, citizenship,
-- gender, REALD demographics, and any SSN / tax ID the form held. This removes those keys from that copy.
-- Credentialing data (license, DEA, NPI, malpractice, education, work history, references) is kept.
--
-- THIS CANNOT BE UNDONE. Take a backup first.
-- HOW TO RUN: run as is (dry run: only counts), then change 'NO' to 'YES' and run again. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  confirm text := 'NO';                      -- <<< change to 'YES' to actually erase
  pi_keys text[] := ARRAY[
    'other_names','home_address','home_city','home_state','home_zip','home_phone','mobile_phone','home_email',
    'birth_date','birth_place','citizenship','gender','ssn','social_security_number',
    'reald_race','reald_ethnicity','reald_language','reald_primary_language','reald_disability'
  ];
  r record; obj jsonb; cleaned jsonb; was_string boolean; touched bigint := 0; total bigint := 0;
BEGIN
  IF to_regclass('public.opca_profiles') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opca_profiles' AND column_name='raw_extraction') THEN
    RAISE NOTICE 'No opca_profiles.raw_extraction column — nothing to do.';
    RETURN;
  END IF;

  FOR r IN SELECT id, raw_extraction FROM public.opca_profiles WHERE raw_extraction IS NOT NULL LOOP
    total := total + 1;
    was_string := jsonb_typeof(r.raw_extraction) = 'string';
    BEGIN
      obj := CASE WHEN was_string THEN (r.raw_extraction #>> '{}')::jsonb ELSE r.raw_extraction END;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Row % has unreadable raw_extraction; skipped.', r.id;
      CONTINUE;
    END;
    IF jsonb_typeof(obj) <> 'object' THEN CONTINUE; END IF;

    cleaned := obj;
    IF jsonb_typeof(cleaned->'practitioner_info') = 'object' THEN
      cleaned := jsonb_set(cleaned, '{practitioner_info}', (cleaned->'practitioner_info') - pi_keys);
    END IF;
    IF jsonb_typeof(cleaned->'practice_info') = 'object' THEN
      cleaned := jsonb_set(cleaned, '{practice_info}', (cleaned->'practice_info') - ARRAY['federal_tax_id','ein','tin']);
    END IF;

    IF cleaned IS DISTINCT FROM obj THEN
      touched := touched + 1;
      IF confirm = 'YES' THEN
        UPDATE public.opca_profiles
           SET raw_extraction = CASE WHEN was_string THEN to_jsonb(cleaned::text) ELSE cleaned END
         WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'opca_profiles.raw_extraction: % of % row(s) hold personal keys.', touched, total;
  IF confirm = 'YES' THEN
    RAISE NOTICE 'ERASED personal keys on % row(s).', touched;
  ELSE
    RAISE NOTICE 'DRY RUN ONLY: nothing was changed. Set confirm to ''YES'' to erase.';
  END IF;
END $$;
