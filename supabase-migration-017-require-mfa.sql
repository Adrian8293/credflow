-- ════════════════════════════════════════════════════════════════════════════
-- Migration 017 (OPTIONAL): enforce two-step verification in the database
--
-- The app already shows a code screen after sign-in for anyone who turned on an authenticator app.
-- That screen alone can be bypassed by someone who has a stolen password and talks to the API directly.
-- This migration closes that gap: for any user who HAS a verified authenticator app, the database refuses
-- every read and write on credentialing data (and the documents bucket) until the session has passed the
-- code check (JWT claim aal = 'aal2').
--
-- Users who have NOT turned on an authenticator app are not affected (they sign in with a password only).
-- Nothing here makes 2FA mandatory for everyone; it makes it real for people who enabled it.
--
-- ORDER OF OPERATIONS (do not skip):
--   1. Deploy the app update, sign in, turn on your own authenticator app (Settings → Security).
--   2. Sign out, sign back in, and confirm the code screen appears and the app loads after the code.
--   3. Then run this file.
--
-- IF SOMEONE LOSES THEIR PHONE: they are locked out of the data until their factor is removed. In the
-- Supabase SQL editor:   DELETE FROM auth.mfa_factors WHERE user_id = '<their user id>';
-- (find the id under Authentication → Users). They can then sign in with a password and re-enroll.
--
-- ROLLBACK: run the commented block at the bottom.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mfa_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified')
$$;
REVOKE ALL ON FUNCTION public.mfa_ok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_ok() TO authenticated;

-- RESTRICTIVE policies are ANDed with the existing org policies: they can only remove access, never add it.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'providers','enrollments','documents','payers','tasks','audit_log','settings',
    'oig_checks','opca_profiles','enrollment_contacts','enrollment_checklist',
    'legal_entities','entity_locations','payer_contracts',
    'provider_licenses','doc_requests','portal_invites'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS mfa_required ON %I', t);
    EXECUTE format('CREATE POLICY mfa_required ON %I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_ok()) WITH CHECK (public.mfa_ok())', t);
  END LOOP;

  -- Stored documents (the "documents" bucket only)
  DROP POLICY IF EXISTS documents_mfa_required ON storage.objects;
  CREATE POLICY documents_mfa_required ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
    USING (bucket_id <> 'documents' OR public.mfa_ok())
    WITH CHECK (bucket_id <> 'documents' OR public.mfa_ok());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not change storage.objects policies here; the table policies were still applied.';
END $$;

-- Verify (expect one mfa_required row per table that exists):
-- SELECT tablename, policyname, permissive FROM pg_policies WHERE policyname LIKE '%mfa_required' ORDER BY 1;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DO $$ DECLARE r record; BEGIN
--   FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE policyname IN ('mfa_required','documents_mfa_required') LOOP
--     EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS public.mfa_ok();
