-- ════════════════════════════════════════════════════════════════════════════
-- Lacentra permission + tenant-isolation test.   READ-ONLY IN EFFECT: nothing is saved.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and press Run.
-- It builds two throw-away organizations with one user per role, then acts as each user (the way the app does,
-- through the real row-level-security policies and functions) and checks what they can and cannot do.
-- It ENDS WITH AN INTENTIONAL ERROR, "LACENTRA RLS TEST REPORT", whose text is the report. That error is what rolls
-- everything back, so no test data is ever left behind. Read the report; FAIL lines are real problems.
--
-- Run it again after any migration. It needs migrations through 025 (it skips nothing silently: a missing
-- function shows as a FAIL).
-- ════════════════════════════════════════════════════════════════════════════
DO $test$
DECLARE
  o1 uuid := gen_random_uuid();  o2 uuid := gen_random_uuid();
  u_owner uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid(); u_cred uuid := gen_random_uuid();
  u_view  uuid := gen_random_uuid(); u_prov  uuid := gen_random_uuid(); u_clin uuid := gen_random_uuid();
  u_out   uuid := gen_random_uuid();
  pv1 uuid; pv2 uuid; pv3 uuid; py1 uuid; py3 uuid; ent1 uuid;
  c record; n bigint; err text; uid uuid;
  ok boolean; passes int := 0; fails int := 0; failtxt text := ''; passtxt text := '';
  s text;
BEGIN
  -- ── fixtures (as the SQL-editor user) ───────────────────────────────────────
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (u_owner,'authenticated','authenticated','owner@rls.test'), (u_admin,'authenticated','authenticated','admin@rls.test'),
    (u_cred,'authenticated','authenticated','cred@rls.test'),   (u_view,'authenticated','authenticated','view@rls.test'),
    (u_prov,'authenticated','authenticated','prov@rls.test'),   (u_clin,'authenticated','authenticated','clin@rls.test'),
    (u_out,'authenticated','authenticated','out@rls.test');
  INSERT INTO organizations (id, name) VALUES (o1,'__rls_test_org_1'), (o2,'__rls_test_org_2');
  INSERT INTO providers (fname,lname,org_id) VALUES ('Pat','One',o1) RETURNING id INTO pv1;
  INSERT INTO providers (fname,lname,org_id) VALUES ('Sam','Two',o1) RETURNING id INTO pv2;
  INSERT INTO providers (fname,lname,org_id) VALUES ('Out','Three',o2) RETURNING id INTO pv3;
  INSERT INTO payers (name,org_id) VALUES ('Test Payer 1',o1) RETURNING id INTO py1;
  INSERT INTO payers (name,org_id) VALUES ('Test Payer 3',o2) RETURNING id INTO py3;
  INSERT INTO legal_entities (name,org_id) VALUES ('Test Group',o1) RETURNING id INTO ent1;
  INSERT INTO organization_members (org_id,user_id,role,provider_id) VALUES
    (o1,u_owner,'owner',NULL), (o1,u_admin,'admin',NULL), (o1,u_cred,'credentialer',NULL), (o1,u_view,'viewer',NULL),
    (o1,u_prov,'provider',pv1), (o1,u_clin,'clinic_staff',NULL), (o2,u_out,'owner',NULL);

  -- ── the checks: (label, who, expect, statement) ─────────────────────────────
  -- expect: rows>0 | rows=0 | blocked (error OR no rows) | ok (runs without error) | denied (must raise an error)
  FOR c IN
    SELECT * FROM (VALUES
      -- providers: who can read
      ('providers: owner reads own org','owner','rows>0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: admin reads own org','admin','rows>0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: credentialer reads own org','cred','rows>0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: viewer reads own org','view','rows>0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: provider account cannot read the table','prov','rows=0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: clinic staff cannot read the table','clin','rows=0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: other organization cannot read','out','rows=0', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      ('providers: not signed in cannot read','anon','blocked', format('SELECT 1 FROM providers WHERE id=%L',pv1)),
      -- providers: who can write
      ('providers: viewer cannot update','view','blocked', format('UPDATE providers SET notes=%L WHERE id=%L','x',pv1)),
      ('providers: provider account cannot update','prov','blocked', format('UPDATE providers SET notes=%L WHERE id=%L','x',pv1)),
      ('providers: other organization cannot update','out','rows=0', format('UPDATE providers SET notes=%L WHERE id=%L','x',pv1)),
      ('providers: other organization cannot delete','out','rows=0', format('DELETE FROM providers WHERE id=%L',pv1)),
      ('providers: viewer cannot insert','view','denied', format('INSERT INTO providers (fname,lname) VALUES (%L,%L)','a','b')),
      ('providers: other organization cannot insert into this org','out','denied', format('INSERT INTO providers (fname,lname,org_id) VALUES (%L,%L,%L)','a','b',o1)),
      ('providers: credentialer cannot insert into another org','cred','denied', format('INSERT INTO providers (fname,lname,org_id) VALUES (%L,%L,%L)','a','b',o2)),
      ('providers: credentialer can insert (org stamped automatically)','cred','ok', format('INSERT INTO providers (fname,lname) VALUES (%L,%L)','a','b')),
      ('providers: credentialer can update','cred','rows>0', format('UPDATE providers SET notes=%L WHERE id=%L','x',pv2)),
      -- payers
      ('payers: viewer reads','view','rows>0', format('SELECT 1 FROM payers WHERE id=%L',py1)),
      ('payers: other organization cannot read','out','rows=0', format('SELECT 1 FROM payers WHERE id=%L',py1)),
      ('payers: clinic staff cannot read','clin','rows=0', format('SELECT 1 FROM payers WHERE id=%L',py1)),
      ('payers: viewer cannot update','view','blocked', format('UPDATE payers SET notes=%L WHERE id=%L','x',py1)),
      ('payers: other organization cannot update','out','rows=0', format('UPDATE payers SET notes=%L WHERE id=%L','x',py1)),
      -- audit log is append-only
      ('audit log: credentialer can add an entry','cred','ok', format('INSERT INTO audit_log (type,action,detail) VALUES (%L,%L,%L)','T','A','rls-test')),
      ('audit log: viewer cannot add an entry','view','denied', format('INSERT INTO audit_log (type,action,detail) VALUES (%L,%L,%L)','T','A','rls-test')),
      ('audit log: nobody can edit entries','owner','blocked', 'UPDATE audit_log SET detail=''tampered'''),
      ('audit log: nobody can delete entries','owner','blocked', 'DELETE FROM audit_log'),
      ('audit log: other organization cannot read','out','rows=0', format('SELECT 1 FROM audit_log WHERE detail=%L','rls-test')),
      -- groups / contracts
      ('groups: credentialer reads','cred','rows>0', format('SELECT 1 FROM legal_entities WHERE id=%L',ent1)),
      ('groups: other organization cannot read','out','rows=0', format('SELECT 1 FROM legal_entities WHERE id=%L',ent1)),
      ('groups: viewer cannot insert','view','denied', format('INSERT INTO legal_entities (name) VALUES (%L)','z')),
      ('groups: other organization cannot update','out','rows=0', format('UPDATE legal_entities SET name=%L WHERE id=%L','z',ent1)),
      -- payer roster column maps (migration 023)
      ('roster maps: credentialer can save','cred','ok', format('INSERT INTO payer_roster_maps (payer_id,sheet_name,mapping) VALUES (%L,%L,%L::jsonb)',py1,'S1','{}')),
      ('roster maps: viewer cannot save','view','denied', format('INSERT INTO payer_roster_maps (payer_id,sheet_name,mapping) VALUES (%L,%L,%L::jsonb)',py1,'S2','{}')),
      ('roster maps: cannot attach another org''s payer','cred','denied', format('INSERT INTO payer_roster_maps (payer_id,sheet_name,mapping) VALUES (%L,%L,%L::jsonb)',py3,'S3','{}')),
      ('roster maps: other organization cannot read','out','rows=0', 'SELECT 1 FROM payer_roster_maps'),
      ('roster maps: provider account cannot read','prov','rows=0', 'SELECT 1 FROM payer_roster_maps'),
      -- portal: who may use the provider portal functions
      ('portal summary: provider account','prov','ok', 'SELECT portal_summary()'),
      ('portal summary: clinic staff','clin','ok', 'SELECT portal_summary()'),
      ('portal summary: viewer is refused','view','denied', 'SELECT portal_summary()'),
      ('portal summary: owner is refused (staff use the main app)','owner','denied', 'SELECT portal_summary()'),
      ('portal summary: not signed in is refused','anon','denied', 'SELECT portal_summary()'),
      ('portal details: provider can read their own','prov','ok', 'SELECT portal_my_details()'),
      ('portal details: clinic staff refused','clin','denied', 'SELECT portal_my_details()'),
      ('portal details: staff refused','cred','denied', 'SELECT portal_my_details()'),
      ('portal details: provider can save their own','prov','ok', 'SELECT portal_save_details(''Female'',''English, Spanish'',true,true)'),
      ('portal details: rejects an invalid gender value','prov','denied', 'SELECT portal_save_details(''x'',''English'',true,true)'),
      ('portal details: rejects over-long languages','prov','denied', format('SELECT portal_save_details(NULL,%L,NULL,NULL)',repeat('a',300))),
      ('portal details: clinic staff cannot save','clin','denied', 'SELECT portal_save_details(NULL,NULL,NULL,NULL)'),
      ('portal details: viewer cannot save','view','denied', 'SELECT portal_save_details(NULL,NULL,NULL,NULL)'),
      ('portal upload: provider for their own record','prov','ok', format('SELECT portal_authorize_upload(%L)',pv1)),
      ('portal upload: provider for a colleague is refused','prov','denied', format('SELECT portal_authorize_upload(%L)',pv2)),
      ('portal upload: provider for another org''s record is refused','prov','denied', format('SELECT portal_authorize_upload(%L)',pv3)),
      ('portal upload: staff account refused','cred','denied', format('SELECT portal_authorize_upload(%L)',pv1)),
      -- access administration
      ('members list: credentialer refused','cred','denied', 'SELECT * FROM org_members_admin()'),
      ('members list: viewer refused','view','denied', 'SELECT * FROM org_members_admin()'),
      ('members list: admin allowed','admin','ok', 'SELECT * FROM org_members_admin()'),
      ('change role: credentialer refused','cred','denied', format('SELECT set_member_role(%L,%L,NULL)',u_view,'admin')),
      ('change role: admin cannot create an owner','admin','denied', format('SELECT set_member_role(%L,%L,NULL)',u_view,'owner')),
      ('change role: other organization cannot touch our member','out','denied', format('SELECT set_member_role(%L,%L,NULL)',u_view,'admin')),
      ('remove member: credentialer refused','cred','denied', format('SELECT remove_member(%L)',u_view)),
      ('remove member: other organization has no effect on our member','out','ok', format('SELECT remove_member(%L)',u_view)),
      ('delete provider: viewer refused','view','denied', format('SELECT soft_delete_provider(%L)',pv2)),
      ('delete provider: other organization refused','out','denied', format('SELECT soft_delete_provider(%L)',pv2)),
      ('delete provider: credentialer allowed','cred','ok', format('SELECT soft_delete_provider(%L)',pv2))
    ) AS t(label, who, expect, q)
  LOOP
    uid := CASE c.who WHEN 'owner' THEN u_owner WHEN 'admin' THEN u_admin WHEN 'cred' THEN u_cred WHEN 'view' THEN u_view
                      WHEN 'prov' THEN u_prov WHEN 'clin' THEN u_clin WHEN 'out' THEN u_out ELSE NULL END;
    n := NULL; err := NULL;
    BEGIN
      IF uid IS NULL THEN
        PERFORM set_config('request.jwt.claims','{}',true); PERFORM set_config('request.jwt.claim.sub','',true);
        EXECUTE 'SET LOCAL ROLE anon';
      ELSE
        PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated','email',c.who||'@rls.test')::text, true);
        PERFORM set_config('request.jwt.claim.sub', uid::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
      END IF;
      EXECUTE c.q;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      n := -1; err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    ok := CASE c.expect
            WHEN 'rows>0'  THEN err IS NULL AND n > 0
            WHEN 'rows=0'  THEN err IS NOT NULL OR n = 0       -- an outright refusal is also safe
            WHEN 'blocked' THEN err IS NOT NULL OR n = 0
            WHEN 'ok'      THEN err IS NULL
            WHEN 'denied'  THEN err IS NOT NULL
          END;
    IF ok THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  ' || c.label;
    ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  ' || c.label || '   [expected ' || c.expect || ', got ' ||
           COALESCE('error: ' || left(err,90), n::text || ' rows') || ']';
    END IF;
  END LOOP;

  -- ── effects that must have happened (or not) ────────────────────────────────
  SELECT (gender = 'Female' AND languages = 'English, Spanish' AND accepts_new_patients AND telehealth) INTO ok
    FROM providers WHERE id = pv1;
  IF COALESCE(ok,false) THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  portal details: the provider''s answers were actually saved';
  ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  portal details: the provider''s answers were not saved'; END IF;

  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = u_view AND org_id = o1 AND role = 'viewer') THEN
    passes := passes + 1; passtxt := passtxt || E'\n  pass  our viewer is still a viewer after the other organization''s attempts';
  ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  another organization changed or removed one of our members'; END IF;

  IF EXISTS (SELECT 1 FROM audit_log WHERE detail = 'tampered') THEN
    fails := fails + 1; failtxt := failtxt || E'\n  FAIL  an audit log entry was edited';
  ELSE passes := passes + 1; passtxt := passtxt || E'\n  pass  audit log entries are unchanged'; END IF;

  -- ── structure checks ────────────────────────────────────────────────────────
  SELECT string_agg(c2.relname, ', ') INTO s FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
   WHERE n2.nspname = 'public' AND c2.relkind = 'r' AND NOT c2.relrowsecurity;
  IF s IS NULL THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  every table has row-level security switched on';
  ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  tables WITHOUT row-level security: ' || s; END IF;

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO s FROM pg_policies
   WHERE schemaname IN ('public') AND (qual = 'true' OR with_check = 'true');
  IF s IS NULL THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  no policy lets everyone in (USING true)';
  ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  open-to-everyone policies: ' || s; END IF;

  SELECT string_agg(DISTINCT p.proname, ', ') INTO s FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.prosecdef AND p.prorettype <> 'trigger'::regtype AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF s IS NULL THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  no privileged function can be called without signing in';
  ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  privileged functions callable without signing in: ' || s; END IF;

  SELECT string_agg(DISTINCT p.proname, ', ') INTO s FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.prosecdef AND (p.proconfig IS NULL OR NOT (p.proconfig::text ILIKE '%search_path%'));
  IF s IS NULL THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  every privileged function pins its search_path';
  ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  privileged functions without a fixed search_path: ' || s; END IF;

  RAISE EXCEPTION E'LACENTRA RLS TEST REPORT (this error is intentional: it rolls the test data back)\n\n%  passed, %  FAILED%\n%\n\n— passed checks —%',
    passes, fails, CASE WHEN fails = 0 THEN E'\nEverything checked held.' ELSE E'\n' || failtxt END, '', passtxt;
END
$test$;
