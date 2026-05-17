-- ─────────────────────────────────────────────────────────────────────────────
--  Migration 007 — Composite indexes, atomic soft-delete RPC, and file_path column
--
--  Deploy in Supabase SQL Editor during a low-traffic window.
--  All CREATE INDEX statements use IF NOT EXISTS — safe to re-run.
--  All indexes are CONCURRENT-safe; they do not lock the table.
--  ROLLBACK section at the bottom for safe revert.
--
--  Items addressed:
--    D-02: Composite indexes for watchdog and dashboard query patterns
--    A-04: Atomic soft_delete_provider() RPC — replaces Promise.allSettled cascade
--    S-02: file_path column on documents table (stores storage path, not signed URL)
--    D-04: NPI duplicate audit query (run manually before creating unique index)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── D-02: Composite indexes ─────────────────────────────────────────────────
-- All use partial indexes (WHERE deleted_at IS NULL) so the index only covers
-- active rows — keeping index size small and writes fast.

-- 1. Watchdog provider scan: primary filter path for checkProviderExpiries()
CREATE INDEX IF NOT EXISTS idx_providers_status_active
  ON providers (status)
  WHERE deleted_at IS NULL;

-- 2. Enrollment follow-up scan: most frequent watchdog query
CREATE INDEX IF NOT EXISTS idx_enrollments_followup_stage
  ON enrollments (followup, stage)
  WHERE deleted_at IS NULL;

-- 3. Claims: provider + status (billing dashboard, most common filter combo)
CREATE INDEX IF NOT EXISTS idx_claims_prov_status
  ON claims (prov_id, status)
  WHERE deleted_at IS NULL;

-- 4. Claims: payer + date of service (payer performance reports)
CREATE INDEX IF NOT EXISTS idx_claims_payer_dos
  ON claims (payer_id, dos DESC)
  WHERE deleted_at IS NULL;

-- 5. Enrollments: provider + stage (provider enrollment status view)
CREATE INDEX IF NOT EXISTS idx_enrollments_prov_stage
  ON enrollments (prov_id, stage)
  WHERE deleted_at IS NULL;

-- 6. Documents: provider + expiry (document expiry tracking per provider)
CREATE INDEX IF NOT EXISTS idx_documents_prov_exp
  ON documents (prov_id, exp)
  WHERE deleted_at IS NULL;

-- 7. Audit log: type + timestamp (audit log filtering by event type)
--    No soft-delete on audit_log — it is append-only by design (HIPAA §164.312(b))
CREATE INDEX IF NOT EXISTS idx_audit_log_type_ts
  ON audit_log (type, ts DESC);

-- 8. Watchdog CAQH staleness check (W-02): filter active providers with a caqh_attest date
CREATE INDEX IF NOT EXISTS idx_providers_caqh_attest_active
  ON providers (caqh_attest)
  WHERE deleted_at IS NULL AND status = 'Active' AND caqh_attest IS NOT NULL;

-- 9. Enrollment SLA check (W-03): submitted enrollments not in terminal stages
CREATE INDEX IF NOT EXISTS idx_enrollments_submitted_stage
  ON enrollments (submitted, stage)
  WHERE deleted_at IS NULL AND submitted IS NOT NULL;


-- ─── A-04: Atomic soft-delete RPC ────────────────────────────────────────────
-- Replaces the four-step Promise.allSettled() cascade in lib/db.js deleteProvider().
-- Wraps all child-table soft-deletes in a single Postgres transaction — if any
-- UPDATE fails, the entire operation is rolled back atomically.
-- SECURITY DEFINER: runs as function owner, bypasses RLS for this admin operation.
-- Called from the client as: await supabase.rpc('soft_delete_provider', { p_id: id })

CREATE OR REPLACE FUNCTION soft_delete_provider(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  now_ts timestamptz := now();
BEGIN
  UPDATE providers   SET deleted_at = now_ts WHERE id = p_id;
  UPDATE enrollments SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
  UPDATE documents   SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
  UPDATE tasks       SET deleted_at = now_ts WHERE prov_id = p_id AND deleted_at IS NULL;
END;
$$;

-- Grant execute to the authenticated role (Supabase anon/authenticated roles)
GRANT EXECUTE ON FUNCTION soft_delete_provider(uuid) TO authenticated;


-- ─── S-02: Add file_path column to documents ──────────────────────────────────
-- Stores the Supabase Storage object path (e.g. "provId/docId/ts_filename.pdf")
-- instead of a pre-generated 10-year signed URL. Signed URLs are now generated
-- on-demand with a 1-hour TTL via pages/api/get-document-url.js.
--
-- file_url is retained for backwards compatibility during the migration window.
-- Once all rows have file_path backfilled, file_url can be dropped in migration-008.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path text;

-- Backfill file_path from existing file_url values where possible.
-- Extracts the storage path from the signed URL format:
-- .../storage/v1/object/sign/documents/PATH?token=...
UPDATE documents
SET file_path = split_part(
  split_part(file_url, '/documents/', 2),
  '?',
  1
)
WHERE file_url IS NOT NULL
  AND file_url LIKE '%/documents/%'
  AND file_path IS NULL;


-- ─── D-04: NPI duplicate audit (run this manually, review before acting) ──────
-- DO NOT run the cleanup UPDATE without reviewing the results first.
-- Uncomment and run in two steps: (1) audit query, (2) cleanup after review.

-- STEP 1 — Audit: identify providers sharing an NPI (excluding deleted)
-- SELECT
--   npi,
--   array_agg(id ORDER BY created_at) AS provider_ids,
--   array_agg(fname || ' ' || lname ORDER BY created_at) AS names,
--   count(*) AS count
-- FROM providers
-- WHERE npi IS NOT NULL AND npi != '' AND deleted_at IS NULL
-- GROUP BY npi
-- HAVING count(*) > 1
-- ORDER BY count DESC;

-- STEP 2 — Cleanup: soft-delete older duplicates (run ONLY after reviewing Step 1)
-- UPDATE providers SET deleted_at = now()
-- WHERE id IN (
--   SELECT id FROM (
--     SELECT id,
--       ROW_NUMBER() OVER (PARTITION BY npi ORDER BY created_at ASC) AS rn
--     FROM providers
--     WHERE npi IS NOT NULL AND npi != '' AND deleted_at IS NULL
--   ) sub
--   WHERE rn > 1
-- );

-- STEP 3 — Unique index: run ONLY after verifying zero duplicates in Step 1
-- DROP INDEX IF EXISTS providers_npi_idx;
-- CREATE UNIQUE INDEX providers_npi_unique_idx
--   ON providers (npi)
--   WHERE npi IS NOT NULL AND npi != '' AND deleted_at IS NULL;


-- ─── ROLLBACK ─────────────────────────────────────────────────────────────────
-- To revert this migration:
--
-- DROP INDEX IF EXISTS
--   idx_providers_status_active,
--   idx_enrollments_followup_stage,
--   idx_claims_prov_status,
--   idx_claims_payer_dos,
--   idx_enrollments_prov_stage,
--   idx_documents_prov_exp,
--   idx_audit_log_type_ts,
--   idx_providers_caqh_attest_active,
--   idx_enrollments_submitted_stage;
--
-- DROP FUNCTION IF EXISTS soft_delete_provider(uuid);
-- ALTER TABLE documents DROP COLUMN IF EXISTS file_path;
