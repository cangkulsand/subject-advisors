-- DEVELOPMENT ONLY. Role, membership and grants are transaction-rolled-back.
-- Requires the explicitly approved development migration operator's CREATEROLE.
-- Never drops or reuses an existing role; a name collision fails closed.
BEGIN;
CREATE ROLE db_foundation_boundary_probe NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT db_foundation_boundary_probe TO CURRENT_USER;
CREATE TEMP TABLE db_boundary_results(test_name text,status text) ON COMMIT DROP;
GRANT INSERT,SELECT ON db_boundary_results TO db_foundation_boundary_probe;
CREATE FUNCTION pg_temp.assert_denied(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE denied boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Role boundary accepted forbidden SQL: %',label; END IF;
 INSERT INTO db_boundary_results VALUES(label,'PASS');
END $test$;
SET LOCAL ROLE db_foundation_boundary_probe;
SELECT pg_temp.assert_denied('ungranted role cannot read access assignments','SELECT clerk_user_id FROM public.user_access_assignment LIMIT 0');
SELECT pg_temp.assert_denied('ungranted role cannot read migration archive','SELECT * FROM migration_meta.legacy_access_id_map LIMIT 0');
RESET ROLE;
GRANT USAGE ON SCHEMA public TO db_foundation_boundary_probe;
GRANT SELECT(clerk_user_id,app_role,access_status) ON public.user_access_assignment TO db_foundation_boundary_probe;
SET LOCAL ROLE db_foundation_boundary_probe;
DO $test$ BEGIN
 PERFORM clerk_user_id,app_role,access_status FROM public.user_access_assignment LIMIT 1;
 INSERT INTO db_boundary_results VALUES('explicit access-reader grants work','PASS');
END $test$;
SELECT pg_temp.assert_denied('access reader cannot change application roles','UPDATE public.user_access_assignment SET app_role=app_role WHERE false');
SELECT pg_temp.assert_denied('access reader cannot read coordinator cohorts','SELECT * FROM public.imported_student LIMIT 0');
SELECT pg_temp.assert_denied('access reader cannot append audit records',$q$INSERT INTO public.user_access_audit_log(access_assignment_id,performed_by_clerk_user_id,change_type,new_value) VALUES(-1999999999,'__DB_TEST_ROLE','ROLE_CHANGE','STUDENT')$q$);
SELECT pg_temp.assert_denied('access reader cannot alter audit records','UPDATE public.user_access_audit_log SET reason=reason WHERE false');
SELECT pg_temp.assert_denied('non-owner cannot disable integrity triggers','ALTER TABLE public.user_access_assignment DISABLE TRIGGER preserve_last_admin');
SELECT pg_temp.assert_denied('non-owner cannot call internal mutator helpers','SELECT public.db_lock_unused_batch(-1999999999)');
RESET ROLE;
SELECT test_name,status FROM db_boundary_results ORDER BY test_name;
ROLLBACK;
