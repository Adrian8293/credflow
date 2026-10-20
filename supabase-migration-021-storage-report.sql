-- ═══════════════════════════════════════════════════════════════════════════════
--  Migration 021 — Storage report (owner/admin only)
--  Lets Settings → Storage show how much file space this organization uses and which files belong to
--  expired documents. Read-only. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION documents_storage_report()
RETURNS TABLE (doc_id uuid, prov_id uuid, doc_type text, exp text, file_path text, file_name text, size_bytes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  IF NOT is_org_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT d.id, d.prov_id, d.type::text, d.exp::text, d.file_path::text, d.file_name::text,
           COALESCE((o.metadata->>'size')::bigint, 0)
      FROM documents d
      LEFT JOIN storage.objects o ON o.bucket_id = 'documents' AND o.name = d.file_path
     WHERE d.org_id = current_org_id()
       AND d.deleted_at IS NULL
       AND d.file_path IS NOT NULL
     ORDER BY 7 DESC;
END $$;

REVOKE ALL ON FUNCTION documents_storage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION documents_storage_report() TO authenticated;
