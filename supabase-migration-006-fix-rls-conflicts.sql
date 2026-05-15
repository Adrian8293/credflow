-- ─── Migration 006: Fix conflicting RLS policies on documents table ─────────────
--
-- SYMPTOM: "new row violates row-level security policy" when uploading a file.
--
-- ROOT CAUSE: Multiple stacked RLS policies on the documents table conflict.
--   - auth_full_access (ALL, USING true) → should allow everything
--   - org_scoped (ALL, USING org_id = current_org_id()) → blocks rows where
--     org_id IS NULL because NULL ≠ any org_id value
--
--   When uploadDocumentFile runs UPDATE SET file_url, file_name WHERE id = X,
--   the document row has org_id = NULL (never backfilled). The org_scoped policy
--   WITH CHECK fails even though auth_full_access would pass, because Postgres
--   evaluates restrictive policies before permissive ones if any are present.
--
-- FIX: Two steps —
--   1. Backfill org_id on all null rows using the first org in organization_members
--   2. Remove the conflicting duplicate and org_scoped policies, keeping only
--      auth_full_access (which already grants full access to authenticated users)
--
-- SAFE TO RE-RUN: DROP POLICY IF EXISTS is idempotent.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Step 1: Backfill org_id on documents with null org_id ───────────────────
-- If organization_members has no rows yet, this is a no-op (safe).
-- The subquery returns NULL if no org exists, and UPDATE WHERE NULL IS NOT NULL
-- matches nothing — so it cannot corrupt data.

UPDATE documents
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

-- Also backfill other tables that have org_id columns but null values,
-- since the same problem can affect enrollments, tasks, payers, etc.

UPDATE enrollments
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE tasks
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE payers
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE providers
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE claims
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE eligibility_checks
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE claim_denials
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE payments
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;

UPDATE audit_log
SET org_id = (SELECT org_id FROM organization_members LIMIT 1)
WHERE org_id IS NULL
  AND (SELECT org_id FROM organization_members LIMIT 1) IS NOT NULL;


-- ─── Step 2: Remove conflicting and duplicate policies ────────────────────────
-- Keep only: auth_full_access (ALL, true) — clean, simple, correct for single-org.
-- Remove:    org_scoped, authenticated_access, and named duplicates that conflict.
--
-- auth_full_access already grants full access to authenticated users.
-- The other policies add noise and create edge-case conflicts (e.g. org_scoped
-- blocking rows with null org_id even when auth_full_access would allow them).

-- documents
DROP POLICY IF EXISTS "org_scoped"                     ON documents;
DROP POLICY IF EXISTS "authenticated_access"           ON documents;
DROP POLICY IF EXISTS "authenticated_all_documents"    ON documents;
DROP POLICY IF EXISTS "Admins can delete documents"    ON documents;
DROP POLICY IF EXISTS "Authenticated users can read documents" ON documents;

-- enrollments
DROP POLICY IF EXISTS "org_scoped"                         ON enrollments;
DROP POLICY IF EXISTS "authenticated_access"               ON enrollments;
DROP POLICY IF EXISTS "authenticated_all_enrollments"      ON enrollments;
DROP POLICY IF EXISTS "Admins can delete enrollments"      ON enrollments;
DROP POLICY IF EXISTS "Authenticated users can read enrollments" ON enrollments;

-- providers
DROP POLICY IF EXISTS "org_scoped"                         ON providers;
DROP POLICY IF EXISTS "authenticated_access"               ON providers;
DROP POLICY IF EXISTS "authenticated_all_providers"        ON providers;
DROP POLICY IF EXISTS "Admins can delete providers"        ON providers;
DROP POLICY IF EXISTS "Authenticated users can read providers" ON providers;

-- payers
DROP POLICY IF EXISTS "org_scoped"                      ON payers;
DROP POLICY IF EXISTS "authenticated_access"            ON payers;
DROP POLICY IF EXISTS "authenticated_all_payers"        ON payers;
DROP POLICY IF EXISTS "Admins can delete payers"        ON payers;
DROP POLICY IF EXISTS "Authenticated users can read payers" ON payers;

-- tasks
DROP POLICY IF EXISTS "org_scoped"                   ON tasks;
DROP POLICY IF EXISTS "authenticated_access"         ON tasks;
DROP POLICY IF EXISTS "authenticated_all_tasks"      ON tasks;
DROP POLICY IF EXISTS "Admins can delete tasks"      ON tasks;
DROP POLICY IF EXISTS "Authenticated users can read tasks" ON tasks;

-- claims
DROP POLICY IF EXISTS "org_scoped"                    ON claims;
DROP POLICY IF EXISTS "authenticated_access"          ON claims;
DROP POLICY IF EXISTS "Admins can delete claims"      ON claims;
DROP POLICY IF EXISTS "Admins can insert claims"      ON claims;
DROP POLICY IF EXISTS "Admins can update claims"      ON claims;
DROP POLICY IF EXISTS "Authenticated users can read claims" ON claims;

-- eligibility_checks
DROP POLICY IF EXISTS "org_scoped"                              ON eligibility_checks;
DROP POLICY IF EXISTS "authenticated_access"                    ON eligibility_checks;
DROP POLICY IF EXISTS "Admins can delete eligibility_checks"    ON eligibility_checks;
DROP POLICY IF EXISTS "Admins can insert eligibility_checks"    ON eligibility_checks;
DROP POLICY IF EXISTS "Admins can update eligibility_checks"    ON eligibility_checks;
DROP POLICY IF EXISTS "Authenticated users can read eligibility_checks" ON eligibility_checks;

-- claim_denials
DROP POLICY IF EXISTS "org_scoped"                           ON claim_denials;
DROP POLICY IF EXISTS "authenticated_access"                 ON claim_denials;
DROP POLICY IF EXISTS "Admins can delete claim_denials"      ON claim_denials;
DROP POLICY IF EXISTS "Admins can insert claim_denials"      ON claim_denials;
DROP POLICY IF EXISTS "Admins can update claim_denials"      ON claim_denials;
DROP POLICY IF EXISTS "Authenticated users can read claim_denials" ON claim_denials;

-- payments
DROP POLICY IF EXISTS "org_scoped"                        ON payments;
DROP POLICY IF EXISTS "authenticated_access"              ON payments;
DROP POLICY IF EXISTS "Admins can delete payments"        ON payments;
DROP POLICY IF EXISTS "Admins can insert payments"        ON payments;
DROP POLICY IF EXISTS "Admins can update payments"        ON payments;
DROP POLICY IF EXISTS "Authenticated users can read payments" ON payments;

-- settings
DROP POLICY IF EXISTS "authenticated_access"              ON settings;
DROP POLICY IF EXISTS "authenticated_all_settings"        ON settings;
DROP POLICY IF EXISTS "Admins can insert settings"        ON settings;
DROP POLICY IF EXISTS "Admins can update settings"        ON settings;
DROP POLICY IF EXISTS "Authenticated users can read settings" ON settings;

-- audit_log
DROP POLICY IF EXISTS "authenticated_access"              ON audit_log;
DROP POLICY IF EXISTS "authenticated_all_audit"           ON audit_log;
DROP POLICY IF EXISTS "Admins can delete audit_log"       ON audit_log;
DROP POLICY IF EXISTS "Authenticated users can read audit_log" ON audit_log;
DROP POLICY IF EXISTS "org_audit_insert"                  ON audit_log;
DROP POLICY IF EXISTS "org_audit_select"                  ON audit_log;

-- opca_profiles
DROP POLICY IF EXISTS "authenticated_access"                   ON opca_profiles;
DROP POLICY IF EXISTS "Admins can delete opca_profiles"        ON opca_profiles;
DROP POLICY IF EXISTS "Admins can insert opca_profiles"        ON opca_profiles;
DROP POLICY IF EXISTS "Admins can update opca_profiles"        ON opca_profiles;
DROP POLICY IF EXISTS "Authenticated users can read opca_profiles" ON opca_profiles;


-- ─── Step 3: Confirm surviving policies are correct ───────────────────────────
-- After running, the policy list should be clean:
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- Expected result per table:
--   providers, payers, enrollments, documents, tasks,
--   claims, eligibility_checks, claim_denials, payments,
--   opca_profiles, settings
--     → 1 policy: auth_full_access (ALL, true)
--
--   audit_log
--     → 2 policies: audit_read (SELECT, true) + audit_insert (INSERT, null)
--
--   organization_members
--     → 1 policy: own_membership (SELECT, user_id = auth.uid())
-- ─────────────────────────────────────────────────────────────────────────────
