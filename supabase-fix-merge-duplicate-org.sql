-- ─────────────────────────────────────────────────────────────────────────────
--  Merge a duplicate organization into the one you want to keep.
--  Cause: your database had two different org_id values in organization_members, so
--  migration 014 created one organization row for each.
--
--  STEP 1 — run ONLY this query first and look at the result:
--
--    SELECT o.id, o.name, o.created_at,
--           (SELECT count(*) FROM organization_members m WHERE m.org_id = o.id) AS members,
--           (SELECT count(*) FROM providers   p WHERE p.org_id = o.id) AS providers,
--           (SELECT count(*) FROM enrollments e WHERE e.org_id = o.id) AS enrollments,
--           (SELECT count(*) FROM documents   d WHERE d.org_id = o.id) AS documents,
--           (SELECT count(*) FROM payers      y WHERE y.org_id = o.id) AS payers
--      FROM organizations o ORDER BY o.created_at;
--
--  Keep the one that holds your providers/enrollments (usually the older one).
--
--  STEP 2 — paste the two ids below, then run the whole DO block. Everything is moved
--  into KEEP, then the duplicate is deleted. It runs in one transaction: any error undoes all of it.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  keep_org uuid := 'PASTE-THE-ID-TO-KEEP-HERE';
  dupe_org uuid := 'PASTE-THE-DUPLICATE-ID-HERE';
  t text;
  tenant_tables text[] := ARRAY[
    'providers','enrollments','documents','payers','tasks','audit_log',
    'oig_checks','opca_profiles','enrollment_contacts','enrollment_checklist',
    'legal_entities','entity_locations','payer_contracts',
    'claims','eligibility_checks','claim_denials','payments'];
BEGIN
  IF keep_org = dupe_org THEN RAISE EXCEPTION 'keep and duplicate ids are the same'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = keep_org) THEN RAISE EXCEPTION 'keep org not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = dupe_org) THEN RAISE EXCEPTION 'duplicate org not found'; END IF;

  -- people: drop duplicate memberships, move the rest
  DELETE FROM organization_members d
   WHERE d.org_id = dupe_org
     AND EXISTS (SELECT 1 FROM organization_members k WHERE k.org_id = keep_org AND k.user_id = d.user_id);
  UPDATE organization_members SET org_id = keep_org WHERE org_id = dupe_org;
  UPDATE user_active_org      SET org_id = keep_org WHERE org_id = dupe_org;

  -- settings: one row per org — keep the kept org's row if it has one
  DELETE FROM settings WHERE org_id = dupe_org AND EXISTS (SELECT 1 FROM settings WHERE org_id = keep_org);
  UPDATE settings SET org_id = keep_org WHERE org_id = dupe_org;

  -- all tenant data
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET org_id = $1 WHERE org_id = $2', t) USING keep_org, dupe_org;
    END IF;
  END LOOP;

  DELETE FROM organizations WHERE id = dupe_org;
  RAISE NOTICE 'Merged % into %', dupe_org, keep_org;
END $$;
