-- ============================================================
-- CredFlow Migration 002
-- Soft-delete columns on secondary tables + org-scoped RLS
-- Run after supabase-migration-001.sql
-- ============================================================

-- ─── SOFT DELETE COLUMNS ──────────────────────────────────────────────────────
-- Migration 001 added deleted_at to providers, enrollments, documents, payers,
-- tasks, and opca_profiles. Add it to the remaining tables created in 001.

ALTER TABLE eligibility_checks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE claim_denials       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE payments            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ─── SOFT-DELETE INDEXES ──────────────────────────────────────────────────────
-- Partial indexes exclude soft-deleted rows from scans — keeps queries fast
-- without adding a WHERE deleted_at IS NULL to every index scan.

CREATE INDEX IF NOT EXISTS providers_active_lname_idx
  ON providers(lname) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS enrollments_active_created_idx
  ON enrollments(created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_active_exp_idx
  ON documents(exp) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_active_due_idx
  ON tasks(due) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS payers_active_name_idx
  ON payers(name) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS claims_active_dos_idx
  ON claims(dos DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS eligibility_active_checked_idx
  ON eligibility_checks(checked_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS denials_active_date_idx
  ON claim_denials(denial_date DESC) WHERE deleted_at IS NULL;

-- ─── ORG-SCOPED RLS ───────────────────────────────────────────────────────────
-- Current RLS uses USING (true) — any authenticated user can see all rows.
-- This migration replaces those policies with org-scoped ones once you are
-- ready to populate org_id on all rows and create the organization_members table.
--
-- HOW TO ACTIVATE:
--   1. Create the organization_members table below.
--   2. Seed at least one row: INSERT INTO organization_members (org_id, user_id, role)
--      with your Supabase Auth user id and a new org uuid.
--   3. Run the UPDATE statements to backfill org_id on existing rows.
--   4. Uncomment the DROP POLICY / CREATE POLICY blocks below.
--
-- Until you do, the migration-001 USING (true) policies remain in effect
-- (safe for single-team use at Positive Inner Self).
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Organization membership table
CREATE TABLE IF NOT EXISTS organization_members (
  org_id   uuid NOT NULL,
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'credentialer'
             CHECK (role IN ('owner','admin','credentialer','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- Secure the membership table itself — users can only see their own membership
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_membership" ON organization_members;
CREATE POLICY "own_membership" ON organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Step 2: Helper function — returns the org_id for the current user.
-- SECURITY DEFINER runs with the function owner's privileges so it can
-- read organization_members even with strict RLS applied.
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT org_id FROM organization_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Step 3: Backfill org_id on existing rows.
-- Run these after inserting a row into organization_members for your user:
--
--   DO $$
--   DECLARE v_org_id uuid := (SELECT org_id FROM organization_members LIMIT 1);
--   BEGIN
--     UPDATE providers          SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE enrollments        SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE documents          SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE payers             SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE tasks              SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE claims             SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE eligibility_checks SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE claim_denials      SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE payments           SET org_id = v_org_id WHERE org_id IS NULL;
--     UPDATE audit_log          SET org_id = v_org_id WHERE org_id IS NULL;
--   END $$;

-- Step 4: Scoped RLS policies (uncomment once org_id is backfilled)
-- Replace the USING (true) policies from migration-001 with org-scoped ones.
-- Run each block per table:

/*
-- PROVIDERS
DROP POLICY IF EXISTS "auth_full_access" ON providers;
CREATE POLICY "org_scoped" ON providers
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- ENROLLMENTS
DROP POLICY IF EXISTS "auth_full_access" ON enrollments;
CREATE POLICY "org_scoped" ON enrollments
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- DOCUMENTS
DROP POLICY IF EXISTS "auth_full_access" ON documents;
CREATE POLICY "org_scoped" ON documents
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- PAYERS
DROP POLICY IF EXISTS "auth_full_access" ON payers;
CREATE POLICY "org_scoped" ON payers
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- TASKS
DROP POLICY IF EXISTS "auth_full_access" ON tasks;
CREATE POLICY "org_scoped" ON tasks
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- CLAIMS
DROP POLICY IF EXISTS "auth_full_access" ON claims;
CREATE POLICY "org_scoped" ON claims
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- ELIGIBILITY CHECKS
DROP POLICY IF EXISTS "auth_full_access" ON eligibility_checks;
CREATE POLICY "org_scoped" ON eligibility_checks
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- CLAIM DENIALS
DROP POLICY IF EXISTS "auth_full_access" ON claim_denials;
CREATE POLICY "org_scoped" ON claim_denials
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- PAYMENTS
DROP POLICY IF EXISTS "auth_full_access" ON payments;
CREATE POLICY "org_scoped" ON payments
  FOR ALL TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- AUDIT LOG — insert-only for authenticated users; no update or delete
DROP POLICY IF EXISTS "auth_full_access" ON audit_log;
CREATE POLICY "org_audit_select" ON audit_log
  FOR SELECT TO authenticated
  USING (org_id = current_org_id());
CREATE POLICY "org_audit_insert" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (org_id = current_org_id());
-- Intentionally no UPDATE or DELETE policy on audit_log.
-- The service_role (used by watchdog/API routes) bypasses RLS and can
-- still read/write audit logs via the Supabase service key.
*/

-- ─── OPCA federal_tax_id REMINDER ─────────────────────────────────────────────
-- opca_profiles.federal_tax_id is stored in plaintext.
-- Before populating real Tax IDs in production, enable Supabase Vault:
--
--   CREATE EXTENSION IF NOT EXISTS supabase_vault;
--
-- Then store tax IDs as vault secrets and save only the secret UUID on the row.
-- See: https://supabase.com/docs/guides/database/vault
-- ─────────────────────────────────────────────────────────────────────────────
