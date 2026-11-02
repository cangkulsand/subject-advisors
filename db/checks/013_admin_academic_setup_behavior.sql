-- DEVELOPMENT ONLY. Every synthetic row is rolled back.
BEGIN;
CREATE TEMP TABLE db_academic_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.academic_assert(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Academic setup assertion failed: %',label; END IF;
  INSERT INTO db_academic_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.academic_reject(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Academic setup accepted invalid operation: %',label; END IF;
  INSERT INTO db_academic_results VALUES(label,'PASS');
END $test$;

SELECT set_config('app.access_actor','__ACADEMIC_SETUP_TEST__',true),
       set_config('app.access_reason','Synthetic academic setup test.',true);
INSERT INTO public.faculty(faculty_code,faculty_name) VALUES ('__TEST_FAC__','Test faculty');
INSERT INTO public.learning_centre(centre_code,centre_name) VALUES ('__ACAD__','Test centre');
INSERT INTO public.programme(programme_code,programme_name,faculty_id)
SELECT '__TEST_ACAD__','Test programme',faculty_id FROM public.faculty WHERE faculty_code='__TEST_FAC__';
INSERT INTO public.academic_semester(academic_year,semester_no,semester_type,max_subjects,max_credits)
VALUES ('2091/2092',1,'NORMAL',5,15),('2091/2092',2,'NORMAL',5,15);
INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status)
VALUES ('__ACADEMIC_COORD__','STUDENT','ACTIVE');
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
SELECT access_assignment_id,'COORDINATOR','ROLE_DOMAIN','OPERATOR','__ACADEMIC_SETUP_TEST__','Synthetic coordinator.'
FROM public.user_access_assignment WHERE clerk_user_id='__ACADEMIC_COORD__';

SELECT pg_temp.academic_assert('no current semester by default',
  (SELECT count(*)=0 FROM public.academic_semester WHERE is_current AND academic_year='2091/2092'));
SELECT pg_temp.academic_reject('direct current write denied',
  $q$UPDATE public.academic_semester SET is_current=true WHERE academic_year='2091/2092' AND semester_no=1$q$);
SELECT public.db_set_current_semester((SELECT semester_id FROM public.academic_semester WHERE academic_year='2091/2092' AND semester_no=1));
SELECT public.db_set_current_semester((SELECT semester_id FROM public.academic_semester WHERE academic_year='2091/2092' AND semester_no=2));
SELECT pg_temp.academic_assert('one current semester and one audit per switch',
  (SELECT count(*)=1 FROM public.academic_semester WHERE is_current) AND
  (SELECT count(*)=2 FROM public.academic_setup_audit_log WHERE action='SET_CURRENT' AND actor='__ACADEMIC_SETUP_TEST__'));
SELECT public.db_set_current_semester((SELECT semester_id FROM public.academic_semester WHERE academic_year='2091/2092' AND semester_no=2));
SELECT pg_temp.academic_assert('same current choice is a no-op',
  (SELECT count(*)=2 FROM public.academic_setup_audit_log WHERE action='SET_CURRENT' AND actor='__ACADEMIC_SETUP_TEST__'));

INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
SELECT a.access_assignment_id,f.faculty_id,p.programme_id,c.learning_centre_id
FROM public.user_access_assignment a,public.faculty f,public.programme p,public.learning_centre c
WHERE a.clerk_user_id='__ACADEMIC_COORD__' AND f.faculty_code='__TEST_FAC__'
  AND p.programme_code='__TEST_ACAD__' AND c.centre_code='__ACAD__';
SELECT pg_temp.academic_reject('duplicate live assignment denied',
  $q$INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
  SELECT a.access_assignment_id,f.faculty_id,p.programme_id,c.learning_centre_id
  FROM public.user_access_assignment a,public.faculty f,public.programme p,public.learning_centre c
  WHERE a.clerk_user_id='__ACADEMIC_COORD__' AND f.faculty_code='__TEST_FAC__'
    AND p.programme_code='__TEST_ACAD__' AND c.centre_code='__ACAD__'$q$);
SELECT pg_temp.academic_reject('live programme faculty change denied',
  $q$UPDATE public.programme SET faculty_id=NULL WHERE programme_code='__TEST_ACAD__'$q$);
UPDATE public.coordinator_assignment SET ended_at=clock_timestamp()
WHERE programme_id=(SELECT programme_id FROM public.programme WHERE programme_code='__TEST_ACAD__');
SELECT pg_temp.academic_reject('ended assignment cannot reopen',
  $q$UPDATE public.coordinator_assignment SET ended_at=NULL WHERE programme_id=(SELECT programme_id FROM public.programme WHERE programme_code='__TEST_ACAD__')$q$);
INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id)
SELECT a.access_assignment_id,f.faculty_id,p.programme_id,c.learning_centre_id
FROM public.user_access_assignment a,public.faculty f,public.programme p,public.learning_centre c
WHERE a.clerk_user_id='__ACADEMIC_COORD__' AND f.faculty_code='__TEST_FAC__'
  AND p.programme_code='__TEST_ACAD__' AND c.centre_code='__ACAD__';
SELECT pg_temp.academic_assert('ended history retained after new assignment',
  (SELECT count(*)=2 AND count(*) FILTER (WHERE ended_at IS NULL)=1
   FROM public.coordinator_assignment WHERE programme_id=(SELECT programme_id FROM public.programme WHERE programme_code='__TEST_ACAD__')));
SELECT pg_temp.academic_reject('assignment hard delete denied',
  $q$DELETE FROM public.coordinator_assignment WHERE programme_id=(SELECT programme_id FROM public.programme WHERE programme_code='__TEST_ACAD__')$q$);
SELECT pg_temp.academic_reject('audit update denied',
  $q$UPDATE public.academic_setup_audit_log SET reason='Changed' WHERE actor='__ACADEMIC_SETUP_TEST__'$q$);
SELECT test_name,status FROM db_academic_results ORDER BY test_name;
ROLLBACK;
