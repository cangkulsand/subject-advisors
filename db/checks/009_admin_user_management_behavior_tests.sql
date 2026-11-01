-- DEVELOPMENT ONLY. Synthetic rows, access audit rows and invitations are rolled back.
BEGIN;
CREATE TEMP TABLE db_admin_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.assert_admin_rejected(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE rejected boolean:=false; code text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    IF code NOT IN ('23001','23502','23503','23505','23514','42501') THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid admin operation accepted: %',label; END IF;
  INSERT INTO db_admin_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.assert_admin_true(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF;
  INSERT INTO db_admin_results VALUES(label,'PASS'); END $test$;

SELECT set_config('app.access_actor','__DB_ADMIN_MGMT_OPERATOR__',true);
SELECT set_config('app.access_reason','Synthetic admin management fixture.',true);
INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status) VALUES
 ('__DB_ADMINMGMT_USER__','STUDENT','ACTIVE'),
 ('__DB_ADMINMGMT_ADMIN_A__','STUDENT','ACTIVE'),
 ('__DB_ADMINMGMT_ADMIN_B__','STUDENT','ACTIVE');
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__DB_ADMIN_MGMT_OPERATOR__','Synthetic admin.'
FROM public.user_access_assignment WHERE clerk_user_id IN ('__DB_ADMINMGMT_ADMIN_A__','__DB_ADMINMGMT_ADMIN_B__');

-- A. access-status audit
SELECT set_config('app.access_actor','',true);
SELECT set_config('app.access_reason','',true);
SELECT pg_temp.assert_admin_rejected('status change without trusted context',
  $q$UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_ADMINMGMT_USER__'$q$);
SELECT set_config('app.access_actor','__DB_ADMIN_MGMT_OPERATOR__',true);
SELECT pg_temp.assert_admin_rejected('status change without reason context',
  $q$UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_ADMINMGMT_USER__'$q$);
SELECT pg_temp.assert_admin_true('rejected status changes leave no audit row',
  (SELECT count(*)=0 FROM public.user_access_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id='__DB_ADMINMGMT_USER__'));
SELECT set_config('app.access_reason','Synthetic suspension.',true);
UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_ADMINMGMT_USER__';
SELECT pg_temp.assert_admin_true('status change with context writes exactly one audit row',
  (SELECT count(*)=1 AND bool_and(l.change_type='ACCESS_STATUS_CHANGE' AND l.old_value='ACTIVE' AND l.new_value='SUSPENDED'
     AND l.performed_by_clerk_user_id='__DB_ADMIN_MGMT_OPERATOR__' AND l.reason='Synthetic suspension.')
   FROM public.user_access_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id='__DB_ADMINMGMT_USER__'));
UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_ADMINMGMT_USER__';
SELECT pg_temp.assert_admin_true('no-op status update writes no audit row',
  (SELECT count(*)=1 FROM public.user_access_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id='__DB_ADMINMGMT_USER__'));
UPDATE public.user_access_assignment SET access_status='ACTIVE' WHERE clerk_user_id='__DB_ADMINMGMT_USER__';
SELECT pg_temp.assert_admin_true('reactivation writes a second audit row',
  (SELECT count(*)=2 AND count(*) FILTER (WHERE l.old_value='SUSPENDED' AND l.new_value='ACTIVE')=1
   FROM public.user_access_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id='__DB_ADMINMGMT_USER__'));
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id) WHERE r.app_role='SYSTEM_ADMIN' AND a.access_status='ACTIVE')=2 THEN
   UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_ADMINMGMT_ADMIN_B__';
   PERFORM pg_temp.assert_admin_rejected('last active admin suspension still blocked',
     $q$UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE clerk_user_id='__DB_ADMINMGMT_ADMIN_A__'$q$);
   PERFORM pg_temp.assert_admin_true('blocked last-admin suspension writes no audit row',
     (SELECT count(*)=0 FROM public.user_access_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id='__DB_ADMINMGMT_ADMIN_A__'));
 ELSE INSERT INTO db_admin_results VALUES('last active admin suspension still blocked','SKIP: existing active administrator present'); END IF;
END $test$;

-- B. invitations
SELECT set_config('app.access_actor','__DB_ADMIN_MGMT_OPERATOR__',true);
INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at)
VALUES ('invitee@utm.my',ARRAY['COORDINATOR','STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','Synthetic invitation.',now()+interval '7 days');
SELECT pg_temp.assert_admin_true('invitation defaults to PENDING with generated uuid',
  (SELECT status='PENDING' AND invitation_id IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL FROM public.admin_user_invitation WHERE email='invitee@utm.my'));
SELECT pg_temp.assert_admin_rejected('second pending invitation for same email',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('invitee@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','dup',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('email must be lower-case and trimmed',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('Upper@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('email without at sign',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('noatsign',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('empty roles',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a1@utm.my',ARRAY[]::varchar[],'__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('unknown role',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a2@utm.my',ARRAY['OWNER'],'__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('duplicate roles',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a3@utm.my',ARRAY['STUDENT','STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('blank reason',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a4@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','   ',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('reason over 500 characters',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a5@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__',repeat('x',501),now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('expiry must follow creation',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a6@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','x',now()-interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('inviter must match trusted actor',
  $q$INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a7@utm.my',ARRAY['STUDENT'],'__SOMEONE_ELSE__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('invitation cannot be created already ACCEPTED',
  $q$INSERT INTO public.admin_user_invitation(email,roles,status,invited_by_clerk_user_id,reason,expires_at) VALUES ('a8@utm.my',ARRAY['STUDENT'],'REVOKED','__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT pg_temp.assert_admin_rejected('ACCEPTED requires accepted account',
  $q$UPDATE public.admin_user_invitation SET status='ACCEPTED',accepted_at=now() WHERE email='invitee@utm.my'$q$);
SELECT pg_temp.assert_admin_rejected('REVOKED requires revoker columns',
  $q$UPDATE public.admin_user_invitation SET status='REVOKED' WHERE email='invitee@utm.my'$q$);
SELECT pg_temp.assert_admin_rejected('creation fields are immutable',
  $q$UPDATE public.admin_user_invitation SET roles=ARRAY['SYSTEM_ADMIN'] WHERE email='invitee@utm.my'$q$);
SELECT pg_temp.assert_admin_rejected('premature expiry rejected',
  $q$UPDATE public.admin_user_invitation SET status='EXPIRED' WHERE email='invitee@utm.my'$q$);
SELECT pg_temp.assert_admin_rejected('revoker must match trusted actor',
  $q$UPDATE public.admin_user_invitation SET status='REVOKED',revoked_at=now(),revoked_by_clerk_user_id='__SOMEONE_ELSE__' WHERE email='invitee@utm.my'$q$);
UPDATE public.admin_user_invitation SET clerk_invitation_id='inv_synthetic_1' WHERE email='invitee@utm.my';
SELECT pg_temp.assert_admin_rejected('clerk invitation id is set once',
  $q$UPDATE public.admin_user_invitation SET clerk_invitation_id='inv_synthetic_2' WHERE email='invitee@utm.my'$q$);
SELECT pg_temp.assert_admin_rejected('invitation delete',
  $q$DELETE FROM public.admin_user_invitation WHERE email='invitee@utm.my'$q$);
SELECT pg_temp.assert_admin_rejected('invitation truncate','TRUNCATE public.admin_user_invitation');
SELECT pg_temp.assert_admin_rejected('invitation cannot be written without actor context',
  $q$SELECT set_config('app.access_actor','',true); INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ('a9@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','x',now()+interval '1 day')$q$);
SELECT set_config('app.access_actor','__DB_ADMIN_MGMT_OPERATOR__',true);

-- legal transitions and terminal freeze
UPDATE public.admin_user_invitation SET status='REVOKED',revoked_at=now(),revoked_by_clerk_user_id='__DB_ADMIN_MGMT_OPERATOR__' WHERE email='invitee@utm.my';
SELECT pg_temp.assert_admin_true('PENDING to REVOKED with revoker succeeds',
  (SELECT status='REVOKED' FROM public.admin_user_invitation WHERE email='invitee@utm.my'));
SELECT pg_temp.assert_admin_rejected('REVOKED invitation is terminal',
  $q$UPDATE public.admin_user_invitation SET status='PENDING',revoked_at=NULL,revoked_by_clerk_user_id=NULL WHERE email='invitee@utm.my'$q$);
INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at)
VALUES ('invitee@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','Re-invite after revoke.',now()+interval '7 days');
SELECT pg_temp.assert_admin_true('new pending invitation allowed after earlier one revoked',
  (SELECT count(*)=1 FROM public.admin_user_invitation WHERE email='invitee@utm.my' AND status='PENDING'));
UPDATE public.admin_user_invitation SET status='ACCEPTED',accepted_at=now(),
  accepted_access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_ADMINMGMT_USER__')
WHERE email='invitee@utm.my' AND status='PENDING';
SELECT pg_temp.assert_admin_true('PENDING to ACCEPTED with account succeeds',
  (SELECT count(*)=1 FROM public.admin_user_invitation WHERE email='invitee@utm.my' AND status='ACCEPTED'));
SELECT pg_temp.assert_admin_rejected('ACCEPTED invitation is terminal',
  $q$UPDATE public.admin_user_invitation SET clerk_invitation_id='x' WHERE email='invitee@utm.my' AND status='ACCEPTED'$q$);
SELECT pg_temp.assert_admin_rejected('invited account cannot be deleted while referenced',
  $q$DELETE FROM public.user_access_assignment WHERE clerk_user_id='__DB_ADMINMGMT_USER__'$q$);

-- expiry of a past invitation (created_at backdated by the fixture)
INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,created_at,expires_at)
VALUES ('expired@utm.my',ARRAY['STUDENT'],'__DB_ADMIN_MGMT_OPERATOR__','Synthetic expired invite.',now()-interval '3 days',now()-interval '1 day');
SELECT pg_temp.assert_admin_rejected('expired invitation cannot be accepted',
  $q$UPDATE public.admin_user_invitation SET status='ACCEPTED',accepted_at=now(),
     accepted_access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id='__DB_ADMINMGMT_USER__') WHERE email='expired@utm.my'$q$);
UPDATE public.admin_user_invitation SET status='EXPIRED' WHERE email='expired@utm.my';
SELECT pg_temp.assert_admin_true('elapsed invitation can be marked EXPIRED',
  (SELECT status='EXPIRED' FROM public.admin_user_invitation WHERE email='expired@utm.my'));
SELECT pg_temp.assert_admin_true('invitation table has no protected_owner path',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_user_invitation' AND column_name='protected_owner'));

SELECT test_name,status FROM db_admin_results ORDER BY test_name;
ROLLBACK;
