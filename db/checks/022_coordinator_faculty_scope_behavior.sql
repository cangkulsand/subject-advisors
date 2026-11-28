-- DEVELOPMENT ONLY. Behaviour of migration 0017 (coordinator faculty scope, S3-P004-040). Every synthetic row is rolled back.
BEGIN;
CREATE TEMP TABLE db_faculty_scope_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.scope_assert(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Faculty scope assertion failed: %',label; END IF;
  INSERT INTO db_faculty_scope_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.scope_reject(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Faculty scope accepted invalid operation: %',label; END IF;
  INSERT INTO db_faculty_scope_results VALUES(label,'PASS');
END $test$;

SELECT set_config('app.access_actor','__FACULTY_SCOPE_TEST__',true),
       set_config('app.access_reason','Synthetic faculty scope test.',true);
INSERT INTO public.faculty(faculty_code,faculty_name) VALUES ('__FS_FAC__','Scope faculty'),('__FS_FAC2__','Other scope faculty');
INSERT INTO public.learning_centre(centre_code,centre_name) VALUES ('__FS_C1__','Scope centre 1'),('__FS_C2__','Scope centre 2');
INSERT INTO public.programme(programme_code,programme_name,faculty_id)
SELECT '__FS_PROG__','Scope programme',faculty_id FROM public.faculty WHERE faculty_code='__FS_FAC__';
INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status) VALUES ('__FS_COORD__','STUDENT','ACTIVE');
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'COORDINATOR','ROLE_DOMAIN','OPERATOR','__FACULTY_SCOPE_TEST__','Synthetic coordinator.'
FROM public.user_access_assignment WHERE clerk_user_id='__FS_COORD__';

-- A whole-faculty row has no programme; two centres in one statement.
INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
SELECT a.access_assignment_id,f.faculty_id,NULL,c.learning_centre_id
FROM public.user_access_assignment a,public.faculty f,public.learning_centre c
WHERE a.clerk_user_id='__FS_COORD__' AND f.faculty_code='__FS_FAC__' AND c.centre_code IN ('__FS_C1__','__FS_C2__');
SELECT pg_temp.scope_assert('whole-faculty rows insert without a programme, one per centre',
  (SELECT count(*)=2 FROM public.coordinator_assignment c JOIN public.faculty f USING(faculty_id) WHERE f.faculty_code='__FS_FAC__' AND c.programme_id IS NULL AND c.ended_at IS NULL));
SELECT pg_temp.scope_assert('each whole-faculty row is audited',
  (SELECT count(*)=2 FROM public.academic_setup_audit_log WHERE entity_type='coordinator_assignment' AND actor='__FACULTY_SCOPE_TEST__' AND action='INSERT' AND after_data->'programme_id'='null'::jsonb));
SELECT pg_temp.scope_reject('a second live whole-faculty row for the same account, faculty and centre is refused',
  $q$INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
  SELECT a.access_assignment_id,f.faculty_id,NULL,c.learning_centre_id
  FROM public.user_access_assignment a,public.faculty f,public.learning_centre c
  WHERE a.clerk_user_id='__FS_COORD__' AND f.faculty_code='__FS_FAC__' AND c.centre_code='__FS_C1__'$q$);
-- A programme row may overlap a faculty row.
INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
SELECT a.access_assignment_id,f.faculty_id,p.programme_id,c.learning_centre_id
FROM public.user_access_assignment a,public.faculty f,public.programme p,public.learning_centre c
WHERE a.clerk_user_id='__FS_COORD__' AND f.faculty_code='__FS_FAC__' AND p.programme_code='__FS_PROG__' AND c.centre_code='__FS_C1__';
SELECT pg_temp.scope_assert('a programme row may overlap a whole-faculty row',
  (SELECT count(*)=3 FROM public.coordinator_assignment c JOIN public.faculty f USING(faculty_id) WHERE f.faculty_code='__FS_FAC__' AND c.ended_at IS NULL));
SELECT pg_temp.scope_reject('a programme row still needs the programme in the faculty',
  $q$INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
  SELECT a.access_assignment_id,f.faculty_id,p.programme_id,c.learning_centre_id
  FROM public.user_access_assignment a,public.faculty f,public.programme p,public.learning_centre c
  WHERE a.clerk_user_id='__FS_COORD__' AND f.faculty_code='__FS_FAC2__' AND p.programme_code='__FS_PROG__' AND c.centre_code='__FS_C2__'$q$);
-- The live programme row blocks a faculty move; once it ends, faculty rows alone do not.
SELECT pg_temp.scope_reject('a live programme row still blocks moving the programme to another faculty',
  $q$UPDATE public.programme SET faculty_id=(SELECT faculty_id FROM public.faculty WHERE faculty_code='__FS_FAC2__') WHERE programme_code='__FS_PROG__'$q$);
UPDATE public.coordinator_assignment SET ended_at=clock_timestamp()
WHERE programme_id=(SELECT programme_id FROM public.programme WHERE programme_code='__FS_PROG__');
UPDATE public.programme SET faculty_id=(SELECT faculty_id FROM public.faculty WHERE faculty_code='__FS_FAC2__') WHERE programme_code='__FS_PROG__';
SELECT pg_temp.scope_assert('whole-faculty rows do not block moving a programme to another faculty',
  (SELECT f.faculty_code='__FS_FAC2__' FROM public.programme p JOIN public.faculty f USING(faculty_id) WHERE p.programme_code='__FS_PROG__'));
SELECT pg_temp.scope_assert('ending a faculty row is still the only allowed change',
  (SELECT count(*)=2 FROM public.coordinator_assignment c JOIN public.faculty f USING(faculty_id) WHERE f.faculty_code='__FS_FAC__' AND c.programme_id IS NULL AND c.ended_at IS NULL));
SELECT pg_temp.scope_reject('a faculty row cannot be given a programme later',
  $q$UPDATE public.coordinator_assignment SET programme_id=(SELECT programme_id FROM public.programme WHERE programme_code='__FS_PROG__')
  WHERE programme_id IS NULL AND faculty_id=(SELECT faculty_id FROM public.faculty WHERE faculty_code='__FS_FAC__')$q$);
SELECT test_name,status FROM db_faculty_scope_results ORDER BY test_name;
ROLLBACK;
