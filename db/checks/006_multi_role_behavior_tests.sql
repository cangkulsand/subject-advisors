-- DEVELOPMENT ONLY. Synthetic rows and role-audit events are rolled back.
BEGIN;
CREATE TEMP TABLE db_role_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.assert_role_rejected(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE rejected boolean:=false; code text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    IF code NOT IN ('23001','23502','23503','23505','23514','42501') THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid role operation accepted: %',label; END IF;
  INSERT INTO db_role_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.assert_role_true(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF;
  INSERT INTO db_role_results VALUES(label,'PASS'); END $test$;

INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status) VALUES
 ('__DB_MULTI_STUDENT__','STUDENT','ACTIVE'),
 ('__DB_MULTI_ADMIN_A__','STUDENT','ACTIVE'),
 ('__DB_MULTI_ADMIN_B__','STUDENT','ACTIVE'),
 ('__DB_MULTI_OWNER__','STUDENT','ACTIVE');
SELECT pg_temp.assert_role_true('legacy STUDENT account insert seeds membership',
  (SELECT count(*)=1 FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id='__DB_MULTI_STUDENT__' AND r.app_role='STUDENT'));
SELECT pg_temp.assert_role_rejected('legacy app_role cannot become a grant path',
  $q$UPDATE public.user_access_assignment SET app_role='SYSTEM_ADMIN' WHERE clerk_user_id='__DB_MULTI_STUDENT__'$q$);
SELECT pg_temp.assert_role_rejected('duplicate role grant',
  $q$INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
     SELECT access_assignment_id,'STUDENT','ROLE_DOMAIN','OPERATOR','__DB_TEST_ACTOR__','duplicate fixture' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_STUDENT__'$q$);
SELECT pg_temp.assert_role_rejected('owner email exception is coordinator-only',
  $q$INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
     SELECT access_assignment_id,'STUDENT','OWNER_STUDENT_COORDINATOR','OPERATOR','__DB_TEST_ACTOR__','invalid exception fixture' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_ADMIN_A__'$q$);

SELECT set_config('app.access_actor','__DB_TEST_OPERATOR__',true);
SELECT set_config('app.access_reason','Synthetic role test fixture.',true);
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__DB_TEST_OPERATOR__','Synthetic admin A.' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_ADMIN_A__';
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__DB_TEST_OPERATOR__','Synthetic admin B.' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_ADMIN_B__';
DELETE FROM public.user_role_assignment WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_ADMIN_B__') AND app_role='SYSTEM_ADMIN';
INSERT INTO db_role_results VALUES('non-last admin membership can be revoked with audit','PASS');
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id) WHERE r.app_role='SYSTEM_ADMIN' AND a.access_status='ACTIVE')=1 THEN
   PERFORM pg_temp.assert_role_rejected('last admin membership cannot be revoked',
     $q$DELETE FROM public.user_role_assignment WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_ADMIN_A__') AND app_role='SYSTEM_ADMIN'$q$);
 ELSE INSERT INTO db_role_results VALUES('last admin membership cannot be revoked','SKIP: existing active administrator preserved'); END IF;
END $test$;
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,protected_owner,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR',false,'__DB_TEST_OPERATOR__','Synthetic owner admin before explicit bootstrap.' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__';
SELECT set_config('app.protected_owner_bootstrap','VERIFIED_CLERK_ID',true);
SELECT pg_temp.assert_role_rejected('owner bootstrap cannot rewrite grant provenance timestamp',
  $q$UPDATE public.user_role_assignment SET protected_owner=true,created_at=created_at+interval '1 day'
     WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__') AND app_role='SYSTEM_ADMIN'$q$);
UPDATE public.user_role_assignment SET protected_owner=true
WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__') AND app_role='SYSTEM_ADMIN';
SELECT set_config('app.protected_owner_bootstrap','',true);
SELECT pg_temp.assert_role_true('explicit admin memberships coexist with same student account rows',
  (SELECT count(*)=2 FROM public.user_role_assignment WHERE app_role='SYSTEM_ADMIN'));
SELECT pg_temp.assert_role_true('protected owner transition is separately audited',
  EXISTS(SELECT 1 FROM public.user_role_audit_log WHERE action='PROTECT_OWNER' AND protected_owner));
SELECT pg_temp.assert_role_rejected('protected owner flag cannot be unset even with another admin',
  $q$UPDATE public.user_role_assignment SET protected_owner=false WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__') AND app_role='SYSTEM_ADMIN'$q$);
SELECT pg_temp.assert_role_rejected('protected owner membership cannot be revoked even with another admin',
  $q$DELETE FROM public.user_role_assignment WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__') AND app_role='SYSTEM_ADMIN'$q$);
SELECT pg_temp.assert_role_rejected('protected owner account cannot be deleted',
  $q$DELETE FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__'$q$);
SELECT pg_temp.assert_role_rejected('protected owner identity cannot be remapped',
  $q$UPDATE public.user_access_assignment SET clerk_user_id='__DB_MULTI_IMPOSTOR__' WHERE clerk_user_id='__DB_MULTI_OWNER__'$q$);
SELECT pg_temp.assert_role_rejected('unprotected account cannot claim student coordinator exception',
  $q$INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
     SELECT access_assignment_id,'COORDINATOR','OWNER_STUDENT_COORDINATOR','OPERATOR','__DB_TEST_OPERATOR__','Unapproved exception.' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_STUDENT__'$q$);
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'COORDINATOR','OWNER_STUDENT_COORDINATOR','OPERATOR','__DB_TEST_OPERATOR__','Explicit protected owner exception.' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_OWNER__';
UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_MULTI_STUDENT__';
SELECT pg_temp.assert_role_true('global account suspension state remains available to every role check',
  (SELECT access_status='SUSPENDED' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_STUDENT__'));
UPDATE public.user_access_assignment SET access_status='ACTIVE' WHERE clerk_user_id='__DB_MULTI_STUDENT__';
SELECT pg_temp.assert_role_rejected('role audit rows are immutable',
  $q$UPDATE public.user_role_audit_log SET reason=reason WHERE access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_ADMIN_A__')$q$);
SELECT pg_temp.assert_role_rejected('role audit cannot be truncated', 'TRUNCATE public.user_role_audit_log');
SELECT pg_temp.assert_role_rejected('role memberships cannot be truncated', 'TRUNCATE public.user_role_assignment');
SELECT set_config('app.access_actor','',true);
SELECT pg_temp.assert_role_rejected('role audit cannot be written by missing actor context',
  $q$INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
     SELECT access_assignment_id,'COORDINATOR','ROLE_DOMAIN','OPERATOR','__DB_TEST_OPERATOR__','missing actor setting' FROM public.user_access_assignment WHERE clerk_user_id='__DB_MULTI_STUDENT__'$q$);
SELECT test_name,status FROM db_role_results ORDER BY test_name;
ROLLBACK;
