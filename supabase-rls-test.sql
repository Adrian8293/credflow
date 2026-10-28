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
  u_mfa   uuid := gen_random_uuid(); u_gone uuid := gen_random_uuid();
  pv1 uuid; pv2 uuid; pv3 uuid; py1 uuid; py3 uuid; ent1 uuid;
  mfa_ready boolean := false; store_ready boolean := false; notes text := '';
  c record; n bigint; err text; uid uuid;
  ok boolean; passes int := 0; fails int := 0; failtxt text := ''; passtxt text := '';
  s text;
BEGIN
  -- ── fixtures (as the SQL-editor user) ───────────────────────────────────────
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (u_owner,'authenticated','authenticated','owner@rls.test'), (u_admin,'authenticated','authenticated','admin@rls.test'),
    (u_cred,'authenticated','authenticated','cred@rls.test'),   (u_view,'authenticated','authenticated','view@rls.test'),
    (u_prov,'authenticated','authenticated','prov@rls.test'),   (u_clin,'authenticated','authenticated','clin@rls.test'),
    (u_out,'authenticated','authenticated','out@rls.test'), (u_mfa,'authenticated','authenticated','mfa@rls.test'),
    (u_gone,'authenticated','authenticated','gone@rls.test');
  INSERT INTO organizations (id, name) VALUES (o1,'__rls_test_org_1'), (o2,'__rls_test_org_2');
  INSERT INTO providers (fname,lname,org_id) VALUES ('Pat','One',o1) RETURNING id INTO pv1;
  INSERT INTO providers (fname,lname,org_id) VALUES ('Sam','Two',o1) RETURNING id INTO pv2;
  INSERT INTO providers (fname,lname,org_id) VALUES ('Out','Three',o2) RETURNING id INTO pv3;
  INSERT INTO payers (name,org_id) VALUES ('Test Payer 1',o1) RETURNING id INTO py1;
  INSERT INTO payers (name,org_id) VALUES ('Test Payer 3',o2) RETURNING id INTO py3;
  INSERT INTO legal_entities (name,org_id) VALUES ('Test Group',o1) RETURNING id INTO ent1;
  INSERT INTO organization_members (org_id,user_id,role,provider_id) VALUES
    (o1,u_owner,'owner',NULL), (o1,u_admin,'admin',NULL), (o1,u_cred,'credentialer',NULL), (o1,u_view,'viewer',NULL),
    (o1,u_prov,'provider',pv1), (o1,u_clin,'clinic_staff',NULL), (o2,u_out,'owner',NULL), (o1,u_mfa,'credentialer',NULL), (o1,u_gone,'credentialer',NULL);

  -- more fixtures (each guarded: if one cannot be created here, its checks are skipped and the report says so)
  INSERT INTO settings (org_id, practice) VALUES (o1,'Test Practice 1'), (o2,'Test Practice 2');
  INSERT INTO doc_requests (org_id, prov_id, doc_type, title) VALUES (o1,pv1,'W-9','test request'), (o2,pv3,'W-9','test request');
  INSERT INTO portal_invites (org_id, email, role, token_hash, expires_at) VALUES (o1,'inv@rls.test','viewer','rls-test-hash-1',now()+interval '1 day');
  INSERT INTO provider_licenses (org_id, provider_id, state) VALUES (o1,pv1,'OR');
  UPDATE providers SET npi = '1234567893' WHERE id = pv1;
  -- task ownership (migration 030): a task owned by someone who is then removed must fall back to unassigned
  INSERT INTO tasks (org_id, task, assignee_id) VALUES (o1,'rls-release',u_gone), (o1,'rls-mine',u_cred), (o2,'rls-other-org',u_out), (o1,'rls-complete',NULL);
  INSERT INTO enrollments (org_id, prov_id, stage, assignee_id) VALUES (o1,pv1,'rls-enr-release',u_gone), (o1,pv1,'rls-enr-mine',u_cred);
  UPDATE providers SET assignee_id = u_gone WHERE id = pv2;
  DELETE FROM organization_members WHERE org_id = o1 AND user_id = u_gone;
  INSERT INTO exclusion_checks (org_id, provider_id, source, result) VALUES (o1, pv1, 'OIG LEIE', 'Clear'), (o2, pv3, 'OIG LEIE', 'Clear');
  BEGIN
    INSERT INTO storage.buckets (id, name) VALUES ('documents','documents') ON CONFLICT (id) DO NOTHING;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', pv1 || '/rls-a.pdf'), ('documents', pv1 || '/rls-del.pdf'), ('documents', pv3 || '/rls-b.pdf'),
      ('provider-photos', pv1 || '/avatar.jpg'), ('provider-photos', pv3 || '/avatar.jpg');
    store_ready := true;
  EXCEPTION WHEN OTHERS THEN notes := notes || E'\n  skipped  document storage checks (could not create test files here: ' || left(SQLERRM,80) || ')';
  END;
  BEGIN
    INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
      VALUES (gen_random_uuid(), u_mfa, 'totp', 'verified', now(), now());
    mfa_ready := true;
  EXCEPTION WHEN OTHERS THEN notes := notes || E'\n  skipped  two-factor checks (could not create a test factor here: ' || left(SQLERRM,80) || ')';
  END;

  -- ── the checks: (label, who, expect, statement) ─────────────────────────────
  -- expect: rows>0 | rows=0 | blocked (error OR no rows) | ok (runs without error) | denied (must raise an error)
  FOR c IN
    SELECT * FROM (VALUES
      -- task ownership (migration 030)
      ('tasks: a removed member''s tasks become unassigned','owner','rows>0', 'SELECT 1 FROM tasks WHERE task=''rls-release'' AND assignee_id IS NULL'),
      ('tasks: credentialer can assign to a colleague','cred','ok', format('UPDATE tasks SET assignee_id=%L WHERE task=%L',u_admin,'rls-mine')),
      ('tasks: cannot assign to a view-only account','cred','denied', format('UPDATE tasks SET assignee_id=%L WHERE task=%L',u_view,'rls-mine')),
      ('tasks: cannot assign to clinic staff (they cannot see tasks)','cred','denied', format('UPDATE tasks SET assignee_id=%L WHERE task=%L',u_clin,'rls-mine')),
      ('tasks: cannot assign to a provider account','cred','denied', format('UPDATE tasks SET assignee_id=%L WHERE task=%L',u_prov,'rls-mine')),
      ('tasks: cannot assign to a person in another organization','cred','denied', format('UPDATE tasks SET assignee_id=%L WHERE task=%L',u_out,'rls-mine')),
      ('tasks: a new task can be created already assigned','admin','ok', format('INSERT INTO tasks (task,assignee_id) VALUES (%L,%L)','rls-new',u_cred)),
      ('tasks: a new task cannot be created for an outsider','admin','denied', format('INSERT INTO tasks (task,assignee_id) VALUES (%L,%L)','rls-new2',u_out)),
      ('tasks: other organization cannot read ours','out','rows=0', 'SELECT 1 FROM tasks WHERE task=''rls-mine'''),
      ('tasks: staff list shows colleagues','cred','rows>0', format('SELECT 1 FROM org_staff_list() WHERE user_id=%L',u_admin)),
      ('tasks: staff list leaves out view-only and portal accounts','cred','rows=0', format('SELECT 1 FROM org_staff_list() WHERE user_id IN (%L,%L,%L)',u_view,u_prov,u_clin)),
      ('tasks: staff list never shows another organization','cred','rows=0', format('SELECT 1 FROM org_staff_list() WHERE user_id=%L',u_out)),
      ('tasks: viewer cannot open the staff list','view','denied', 'SELECT * FROM org_staff_list()'),
      ('tasks: provider account cannot open the staff list','prov','denied', 'SELECT * FROM org_staff_list()'),
      ('tasks: not signed in cannot open the staff list','anon','denied', 'SELECT * FROM org_staff_list()'),
      -- mandatory completion check (migration 033). Cases run in order and build on each other.
      ('completion: marking done without a note is refused','cred','denied', 'UPDATE tasks SET status=''Done'' WHERE task=''rls-complete'''),
      ('completion: a too-short note is refused','cred','denied', 'UPDATE tasks SET status=''Done'', completion_note=''ok'' WHERE task=''rls-complete'''),
      ('completion: a blank note is refused','cred','denied', 'UPDATE tasks SET status=''Done'', completion_note=''      '' WHERE task=''rls-complete'''),
      ('completion: viewer cannot complete a task','view','blocked', 'UPDATE tasks SET status=''Done'', completion_note=''Called the payer'' WHERE task=''rls-complete'''),
      ('completion: other organization cannot complete ours','out','blocked', 'UPDATE tasks SET status=''Done'', completion_note=''Called the payer'' WHERE task=''rls-complete'''),
      ('completion: a new task cannot be created already done without a note','admin','denied', 'INSERT INTO tasks (task,status) VALUES (''rls-new3'',''Done'')'),
      ('completion: a new task can be created done with a note','admin','ok', 'INSERT INTO tasks (task,status,completion_note) VALUES (''rls-new4'',''Done'',''Handled by phone today'')'),
      ('completion: credentialer can complete with a note','cred','ok', 'UPDATE tasks SET status=''Done'', completion_note=''Called the payer, confirmed receipt'' WHERE task=''rls-complete'''),
      ('completion: who, when and what are recorded','owner','rows>0', format('SELECT 1 FROM tasks WHERE task=%L AND completed_at IS NOT NULL AND completed_by=%L AND completion_note LIKE %L','rls-complete',u_cred,'Called the payer%')),
      ('completion: a finished task can still be edited without a new note','cred','ok', 'UPDATE tasks SET priority=''Low'' WHERE task=''rls-complete'''),
      ('completion: the original completion record survives such an edit','owner','rows>0', format('SELECT 1 FROM tasks WHERE task=%L AND completed_by=%L AND completion_note LIKE %L','rls-complete',u_cred,'Called the payer%')),
      ('completion: the note cannot be blanked on a finished task','cred','denied', 'UPDATE tasks SET completion_note='''' WHERE task=''rls-complete'''),
      ('completion: a finished task can be reopened','cred','ok', 'UPDATE tasks SET status=''Open'' WHERE task=''rls-complete'''),
      ('completion: reopening clears the completion record','owner','rows>0', 'SELECT 1 FROM tasks WHERE task=''rls-complete'' AND completed_at IS NULL AND completed_by IS NULL AND completion_note IS NULL'),
      ('completion: finishing it again needs a fresh note','cred','denied', 'UPDATE tasks SET status=''Done'' WHERE task=''rls-complete'''),
      -- provider owner + stall settings (migration 032)
      ('provider owner: a removed member''s providers become unassigned','owner','rows>0', format('SELECT 1 FROM providers WHERE id=%L AND assignee_id IS NULL',pv2)),
      ('provider owner: credentialer can assign a colleague','cred','ok', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_admin,pv1)),
      ('provider owner: cannot assign a view-only account','cred','denied', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_view,pv1)),
      ('provider owner: cannot assign clinic staff','cred','denied', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_clin,pv1)),
      ('provider owner: cannot assign a provider account','cred','denied', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_prov,pv1)),
      ('provider owner: cannot assign someone from another organization','cred','denied', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_out,pv1)),
      ('provider owner: viewer cannot change it','view','blocked', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_cred,pv1)),
      ('provider owner: other organization cannot change ours','out','rows=0', format('UPDATE providers SET assignee_id=%L WHERE id=%L',u_out,pv1)),
      -- application owner (migration 034)
      ('application owner: a removed member''s applications become unassigned','owner','rows>0', 'SELECT 1 FROM enrollments WHERE stage=''rls-enr-release'' AND assignee_id IS NULL'),
      ('application owner: credentialer can assign a colleague','cred','ok', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_admin,'rls-enr-mine')),
      ('application owner: cannot assign a view-only account','cred','denied', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_view,'rls-enr-mine')),
      ('application owner: cannot assign clinic staff','cred','denied', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_clin,'rls-enr-mine')),
      ('application owner: cannot assign a provider account','cred','denied', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_prov,'rls-enr-mine')),
      ('application owner: cannot assign someone from another organization','cred','denied', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_out,'rls-enr-mine')),
      ('application owner: viewer cannot change it','view','blocked', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_cred,'rls-enr-mine')),
      ('application owner: other organization cannot change ours','out','rows=0', format('UPDATE enrollments SET assignee_id=%L WHERE stage=%L',u_out,'rls-enr-mine')),
      ('application owner: a new application cannot be created for an outsider','cred','denied', format('INSERT INTO enrollments (prov_id,stage,assignee_id) VALUES (%L,%L,%L)',pv1,'rls-enr-new',u_out)),
      ('stall settings: default to 30 and 14 days','owner','rows>0', 'SELECT 1 FROM settings WHERE stall_days_payer=30 AND stall_days_us=14'),
      ('stall settings: admin can change them','admin','rows>0', 'UPDATE settings SET stall_days_payer=45 WHERE stall_days_us=14'),
      ('stall settings: an out-of-range value is rejected','admin','denied', 'UPDATE settings SET stall_days_us=3'),
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
      ('delete provider: credentialer allowed','cred','ok', format('SELECT soft_delete_provider(%L)',pv2)),
      -- settings
      ('settings: viewer reads own org','view','rows>0', format('SELECT 1 FROM settings WHERE org_id=%L',o1)),
      ('settings: clinic staff cannot read','clin','rows=0', format('SELECT 1 FROM settings WHERE org_id=%L',o1)),
      ('settings: provider account cannot read','prov','rows=0', format('SELECT 1 FROM settings WHERE org_id=%L',o1)),
      ('settings: other organization cannot read ours','out','rows=0', format('SELECT 1 FROM settings WHERE org_id=%L',o1)),
      ('settings: viewer cannot change','view','blocked', format('UPDATE settings SET practice=%L WHERE org_id=%L','x',o1)),
      ('settings: other organization cannot change ours','out','rows=0', format('UPDATE settings SET practice=%L WHERE org_id=%L','x',o1)),
      -- document requests
      ('requests: viewer reads','view','rows>0', 'SELECT 1 FROM doc_requests WHERE title=''test request'' AND org_id=' || quote_literal(o1)),
      ('requests: provider account cannot read the table','prov','rows=0', 'SELECT 1 FROM doc_requests'),
      ('requests: other organization cannot read','out','rows=0', 'SELECT 1 FROM doc_requests WHERE org_id=' || quote_literal(o1)),
      ('requests: viewer cannot create','view','denied', format('INSERT INTO doc_requests (prov_id,doc_type,title) VALUES (%L,%L,%L)',pv1,'W-9','x')),
      ('requests: credentialer can create','cred','ok', format('INSERT INTO doc_requests (prov_id,doc_type,title) VALUES (%L,%L,%L)',pv1,'W-9','x')),
      ('requests: cannot point at another org''s provider','cred','denied', format('INSERT INTO doc_requests (prov_id,doc_type,title) VALUES (%L,%L,%L)',pv3,'W-9','x')),
      -- invitations (owner/admin only)
      ('invites: admin reads','admin','rows>0', 'SELECT 1 FROM portal_invites WHERE org_id=' || quote_literal(o1)),
      ('invites: credentialer cannot read','cred','rows=0', 'SELECT 1 FROM portal_invites'),
      ('invites: viewer cannot read','view','rows=0', 'SELECT 1 FROM portal_invites'),
      ('invites: provider account cannot read','prov','rows=0', 'SELECT 1 FROM portal_invites'),
      ('invites: other organization cannot read','out','rows=0', 'SELECT 1 FROM portal_invites WHERE org_id=' || quote_literal(o1)),
      ('invites: credentialer cannot create','cred','denied', format('INSERT INTO portal_invites (email,role,token_hash,expires_at) VALUES (%L,%L,%L,now()+interval %L)','a@b.c','viewer','rls-h2','1 day')),
      ('invites: admin can create','admin','ok', format('INSERT INTO portal_invites (email,role,token_hash,expires_at) VALUES (%L,%L,%L,now()+interval %L)','a@b.c','viewer','rls-h3','1 day')),
      -- extra-state licenses
      ('licenses: viewer reads','view','rows>0', 'SELECT 1 FROM provider_licenses WHERE org_id=' || quote_literal(o1)),
      ('licenses: provider account cannot read the table','prov','rows=0', 'SELECT 1 FROM provider_licenses'),
      ('licenses: other organization cannot read','out','rows=0', 'SELECT 1 FROM provider_licenses WHERE org_id=' || quote_literal(o1)),
      ('licenses: viewer cannot add','view','denied', format('INSERT INTO provider_licenses (provider_id,state) VALUES (%L,%L)',pv1,'WA')),
      ('npi: same NPI twice in one organization is rejected','cred','denied', format('INSERT INTO providers (fname,lname,npi) VALUES (%L,%L,%L)','dup','npi','1234567893')),
      ('npi: another organization may use the same NPI','out','ok', format('INSERT INTO providers (fname,lname,npi) VALUES (%L,%L,%L)','dup','npi','1234567893')),
      ('screening: viewer reads own org''s checks','view','rows>0', format('SELECT 1 FROM exclusion_checks WHERE provider_id=%L',pv1)),
      ('screening: clinic staff cannot read','clin','rows=0', 'SELECT 1 FROM exclusion_checks'),
      ('screening: provider account cannot read','prov','rows=0', 'SELECT 1 FROM exclusion_checks'),
      ('screening: other organization cannot read ours','out','rows=0', format('SELECT 1 FROM exclusion_checks WHERE provider_id=%L',pv1)),
      ('screening: viewer cannot record a check','view','denied', format('INSERT INTO exclusion_checks (provider_id,source) VALUES (%L,%L)',pv1,'SAM.gov')),
      ('screening: credentialer can record a check','cred','ok', format('INSERT INTO exclusion_checks (provider_id,source,result) VALUES (%L,%L,%L)',pv1,'SAM.gov','Clear')),
      ('screening: cannot record against another org''s provider','cred','denied', format('INSERT INTO exclusion_checks (provider_id,source) VALUES (%L,%L)',pv3,'SAM.gov')),
      ('screening: an unknown result value is rejected','cred','denied', format('INSERT INTO exclusion_checks (provider_id,source,result) VALUES (%L,%L,%L)',pv1,'SAM.gov','Whatever')),
      ('screening: nobody can edit a recorded check','admin','rows=0', format('UPDATE exclusion_checks SET result=%L WHERE provider_id=%L','Clear',pv1)),
      ('screening: credentialer cannot delete a check','cred','rows=0', format('DELETE FROM exclusion_checks WHERE provider_id=%L',pv1)),
      ('screening: admin can delete a mistaken check','admin','rows>0', format('DELETE FROM exclusion_checks WHERE provider_id=%L',pv1)),
      ('licenses: cannot attach to another org''s provider','cred','denied', format('INSERT INTO provider_licenses (provider_id,state) VALUES (%L,%L)',pv3,'WA'))
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

  -- ── document storage and two-factor (only when the test fixtures could be created) ──
  IF store_ready THEN
    FOR c IN
      SELECT * FROM (VALUES
        ('storage: owner reads own org''s file','owner','rows>0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L AND name=%L','documents',pv1||'/rls-a.pdf')),
        ('storage: viewer reads own org''s file','view','rows>0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L AND name=%L','documents',pv1||'/rls-a.pdf')),
        ('storage: provider account cannot list files','prov','rows=0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L','documents')),
        ('storage: clinic staff cannot list files','clin','rows=0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L','documents')),
        ('storage: other organization cannot see our files','out','rows=0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L AND name LIKE %L','documents',pv1||'/%')),
        ('storage: not signed in cannot see files','anon','blocked', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L','documents')),
        ('storage: browser cannot upload directly (uploads go through the server)','cred','denied', format('INSERT INTO storage.objects (bucket_id,name) VALUES (%L,%L)','documents',pv1||'/direct.pdf')),
        ('storage: browser cannot rename or overwrite files','cred','blocked', format('UPDATE storage.objects SET name=%L WHERE bucket_id=%L AND name=%L',pv1||'/renamed.pdf','documents',pv1||'/rls-a.pdf')),
        ('storage: viewer cannot delete','view','blocked', format('DELETE FROM storage.objects WHERE bucket_id=%L AND name=%L','documents',pv1||'/rls-del.pdf')),
        ('storage: other organization cannot delete ours','out','rows=0', format('DELETE FROM storage.objects WHERE bucket_id=%L AND name=%L','documents',pv1||'/rls-del.pdf')),
        ('photos: viewer reads own org''s photo','view','rows>0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L AND name=%L','provider-photos',pv1||'/avatar.jpg')),
        ('photos: other organization cannot see our photos','out','rows=0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L AND name=%L','provider-photos',pv1||'/avatar.jpg')),
        ('photos: provider account cannot see photos','prov','rows=0', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L','provider-photos')),
        ('photos: not signed in cannot see photos','anon','blocked', format('SELECT 1 FROM storage.objects WHERE bucket_id=%L','provider-photos')),
        ('photos: viewer cannot upload','view','denied', format('INSERT INTO storage.objects (bucket_id,name) VALUES (%L,%L)','provider-photos',pv1||'/new.jpg')),
        ('photos: credentialer can upload for own org''s provider','cred','ok', format('INSERT INTO storage.objects (bucket_id,name) VALUES (%L,%L)','provider-photos',pv1||'/new.jpg')),
        ('photos: cannot upload for another org''s provider','cred','denied', format('INSERT INTO storage.objects (bucket_id,name) VALUES (%L,%L)','provider-photos',pv3||'/new.jpg')),
        ('photos: other organization cannot delete ours','out','rows=0', format('DELETE FROM storage.objects WHERE bucket_id=%L AND name=%L','provider-photos',pv1||'/avatar.jpg')),
        ('storage: credentialer can delete own org''s file','cred','rows>0|guard', format('DELETE FROM storage.objects WHERE bucket_id=%L AND name=%L','documents',pv1||'/rls-del.pdf'))
      ) AS t(label, who, expect, q)
    LOOP
      uid := CASE c.who WHEN 'owner' THEN u_owner WHEN 'cred' THEN u_cred WHEN 'view' THEN u_view WHEN 'prov' THEN u_prov
                        WHEN 'clin' THEN u_clin WHEN 'out' THEN u_out ELSE NULL END;
      n := NULL; err := NULL;
      BEGIN
        IF uid IS NULL THEN
          PERFORM set_config('request.jwt.claims','{}',true); PERFORM set_config('request.jwt.claim.sub','',true);
          EXECUTE 'SET LOCAL ROLE anon';
        ELSE
          PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
          PERFORM set_config('request.jwt.claim.sub', uid::text, true);
          EXECUTE 'SET LOCAL ROLE authenticated';
        END IF;
        EXECUTE c.q;
        GET DIAGNOSTICS n = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN n := -1; err := SQLERRM;
      END;
      EXECUTE 'RESET ROLE';
      ok := CASE c.expect WHEN 'rows>0' THEN err IS NULL AND n > 0 WHEN 'rows>0|guard' THEN (err IS NULL AND n > 0) OR err LIKE 'Direct deletion from storage tables%' WHEN 'rows=0' THEN err IS NOT NULL OR n = 0
                          WHEN 'blocked' THEN err IS NOT NULL OR n = 0 WHEN 'ok' THEN err IS NULL WHEN 'denied' THEN err IS NOT NULL END;
      IF ok THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  ' || c.label;
      ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  ' || c.label || '   [expected ' || c.expect || ', got ' || COALESCE('error: ' || left(err,90), n::text || ' rows') || ']'; END IF;
    END LOOP;
  END IF;

  IF mfa_ready THEN
    -- a user WITH a verified second factor: a password-only session (aal1) must see nothing; a two-factor session (aal2) sees data
    FOR c IN
      SELECT * FROM (VALUES
        ('two-factor: password-only session of an enrolled user is locked out','aal1','rows=0'),
        ('two-factor: two-factor session of an enrolled user can read','aal2','rows>0')
      ) AS t(label, aal, expect)
    LOOP
      n := NULL; err := NULL;
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub',u_mfa,'role','authenticated','aal',c.aal)::text, true);
        PERFORM set_config('request.jwt.claim.sub', u_mfa::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT 1 FROM providers WHERE id=%L', pv1);
        GET DIAGNOSTICS n = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN n := -1; err := SQLERRM;
      END;
      EXECUTE 'RESET ROLE';
      ok := CASE c.expect WHEN 'rows>0' THEN err IS NULL AND n > 0 ELSE err IS NOT NULL OR n = 0 END;
      IF ok THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  ' || c.label;
      ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  ' || c.label || '   [expected ' || c.expect || ', got ' || COALESCE('error: ' || left(err,90), n::text || ' rows') || ']'; END IF;
    END LOOP;
  END IF;

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

  IF store_ready THEN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'provider-photos' AND public IS NOT TRUE) THEN passes := passes + 1; passtxt := passtxt || E'\n  pass  the provider photo bucket is private';
    ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  the provider photo bucket is public'; END IF;
  END IF;

  -- Supabase refuses a direct SQL DELETE on storage tables (the app deletes through the Storage API), so the delete
  -- cases above cannot prove who may delete. This checks the delete policy itself: staff only, own organization only.
  IF store_ready THEN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND policyname='documents_org_delete'
                 AND qual ILIKE '%is_org_staff%' AND qual ILIKE '%current_org_id%') THEN
      passes := passes + 1; passtxt := passtxt || E'\n  pass  storage: the delete policy requires staff and the caller''s own organization';
    ELSE fails := fails + 1; failtxt := failtxt || E'\n  FAIL  storage: documents delete policy is missing or not limited to staff in their own organization'; END IF;
  END IF;

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

  RAISE EXCEPTION E'LACENTRA RLS TEST REPORT (this error is intentional: it rolls the test data back)\n\n% passed, % FAILED%\n\n— passed checks —%',
    passes, fails, (CASE WHEN fails = 0 THEN E'\nEverything checked held.' ELSE E'\n' || failtxt END) || notes, passtxt;
END
$test$;
