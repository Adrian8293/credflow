-- ─── Migration 005: Fix RLS policies blocking document file uploads ────────────
--
-- SYMPTOM: "new row violates row-level security policy" when uploading a file
--          to a document record, or when saving any record to the DB.
--
-- ROOT CAUSE: RLS is enabled on the documents table (and likely other tables)
--             but the permissive "auth_full_access" policy from migration-001
--             either was never applied or didn't take effect.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this → Run
--
-- SAFE TO RE-RUN: All statements use IF NOT EXISTS or DROP IF EXISTS first.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Ensure RLS is enabled on all tables
-- (idempotent — enabling an already-enabled table is a no-op)
ALTER TABLE IF EXISTS providers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS enrollments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS claims             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eligibility_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS claim_denials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments           ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies so we can cleanly recreate them
-- (prevents "policy already exists" errors on re-run)
DROP POLICY IF EXISTS "auth_full_access" ON providers;
DROP POLICY IF EXISTS "auth_full_access" ON payers;
DROP POLICY IF EXISTS "auth_full_access" ON enrollments;
DROP POLICY IF EXISTS "auth_full_access" ON documents;
DROP POLICY IF EXISTS "auth_full_access" ON tasks;
DROP POLICY IF EXISTS "auth_full_access" ON settings;
DROP POLICY IF EXISTS "auth_full_access" ON claims;
DROP POLICY IF EXISTS "auth_full_access" ON eligibility_checks;
DROP POLICY IF EXISTS "auth_full_access" ON claim_denials;
DROP POLICY IF EXISTS "auth_full_access" ON payments;
DROP POLICY IF EXISTS "audit_read"       ON audit_log;
DROP POLICY IF EXISTS "audit_insert"     ON audit_log;

-- Step 3: Create permissive policies for authenticated users
-- USING (true)       = any authenticated user can SELECT/UPDATE/DELETE any row
-- WITH CHECK (true)  = any authenticated user can INSERT any row
-- This is correct for single-org deployment (Positive Inner Self).
-- Multi-org scoping is handled separately in migration-002.

CREATE POLICY "auth_full_access" ON providers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON payers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON enrollments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON claims
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON eligibility_checks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON claim_denials
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit log: read + insert only — no UPDATE or DELETE (HIPAA append-only requirement)
CREATE POLICY "audit_read"   ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);


-- Step 4: Ensure documents table has the file_url and file_name columns
-- (added in migration-002, but included here as a safety net)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url  text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name text;


-- ─── Verify ───────────────────────────────────────────────────────────────────
-- Run this SELECT after the migration to confirm policies are in place:
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- You should see "auth_full_access" on every table, and
-- "audit_read" + "audit_insert" on audit_log.
-- ─────────────────────────────────────────────────────────────────────────────
