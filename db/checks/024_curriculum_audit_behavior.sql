-- DEVELOPMENT ONLY. Behaviour of migration 0018 (curriculum audit, S3-P004-041). Every synthetic row is rolled back.
BEGIN;
CREATE TEMP TABLE db_curriculum_audit_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.audit_assert(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Curriculum audit assertion failed: %',label; END IF;
  INSERT INTO db_curriculum_audit_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.audit_rows(tbl text) RETURNS bigint LANGUAGE sql AS $q$
  SELECT count(*) FROM public.academic_setup_audit_log WHERE entity_type=tbl AND actor='__CURRICULUM_AUDIT_TEST__'
$q$;

-- No context yet: synthetic setup is not audited.
INSERT INTO public.subject(subject_code,subject_name,credit_hours) VALUES ('__CA_PRE__','Audit prerequisite',3);
SELECT pg_temp.audit_assert('a write without an actor context writes no audit row',
  NOT EXISTS (SELECT 1 FROM public.academic_setup_audit_log WHERE entity_type='subject' AND after_data->>'subject_code'='__CA_PRE__'));

SELECT set_config('app.access_actor','__CURRICULUM_AUDIT_TEST__',true),
       set_config('app.access_reason','Synthetic curriculum audit test.',true);
INSERT INTO public.faculty(faculty_code,faculty_name) VALUES ('__CA_FAC__','Audit faculty');
INSERT INTO public.programme(programme_code,programme_name,faculty_id) SELECT '__CA_PROG__','Audit programme',faculty_id FROM public.faculty WHERE faculty_code='__CA_FAC__';
INSERT INTO public.curriculum(curriculum_version,total_credit_required,programme_id) SELECT '__CA_V1__',120,programme_id FROM public.programme WHERE programme_code='__CA_PROG__';
INSERT INTO public.subject(subject_code,subject_name,credit_hours) VALUES ('__CA_SUB__','Audit subject',3);
SELECT pg_temp.audit_assert('a new subject under a context writes one audit row', pg_temp.audit_rows('subject')=1);
INSERT INTO public.curriculum_subject(curriculum_id,subject_id,subject_category,is_compulsory)
SELECT c.curriculum_id,s.subject_id,'Core',1 FROM public.curriculum c,public.subject s WHERE c.curriculum_version='__CA_V1__' AND s.subject_code IN ('__CA_SUB__','__CA_PRE__');
SELECT pg_temp.audit_assert('each new mapping writes one audit row', pg_temp.audit_rows('curriculum_subject')=2);
UPDATE public.curriculum_subject SET subject_category='Elective' WHERE subject_id=(SELECT subject_id FROM public.subject WHERE subject_code='__CA_SUB__');
SELECT pg_temp.audit_assert('a category change writes one audit row with before and after',
  (SELECT count(*)=1 FROM public.academic_setup_audit_log WHERE entity_type='curriculum_subject' AND action='UPDATE' AND actor='__CURRICULUM_AUDIT_TEST__'
     AND before_data->>'subject_category'='Core' AND after_data->>'subject_category'='Elective'));
UPDATE public.curriculum_subject SET subject_category='Elective' WHERE subject_id=(SELECT subject_id FROM public.subject WHERE subject_code='__CA_SUB__');
SELECT pg_temp.audit_assert('a no-op update writes no audit row',
  (SELECT count(*)=1 FROM public.academic_setup_audit_log WHERE entity_type='curriculum_subject' AND action='UPDATE' AND actor='__CURRICULUM_AUDIT_TEST__'));
INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type)
SELECT a.curriculum_subject_id,b.curriculum_subject_id,'MANDATORY'
FROM public.curriculum_subject a JOIN public.subject sa USING(subject_id), public.curriculum_subject b JOIN public.subject sb USING(subject_id)
WHERE sa.subject_code='__CA_SUB__' AND sb.subject_code='__CA_PRE__' AND a.curriculum_id=b.curriculum_id;
INSERT INTO public.subject_semester_rule(curriculum_subject_id,semester_type)
SELECT cs.curriculum_subject_id,'NORMAL' FROM public.curriculum_subject cs JOIN public.subject s USING(subject_id) WHERE s.subject_code='__CA_SUB__';
-- Removing the subject from the curriculum: links, rules, then the mapping, each audited.
DELETE FROM public.subject_prerequisite WHERE curriculum_subject_id IN (SELECT cs.curriculum_subject_id FROM public.curriculum_subject cs JOIN public.subject s USING(subject_id) WHERE s.subject_code='__CA_SUB__');
DELETE FROM public.subject_semester_rule WHERE curriculum_subject_id IN (SELECT cs.curriculum_subject_id FROM public.curriculum_subject cs JOIN public.subject s USING(subject_id) WHERE s.subject_code='__CA_SUB__');
DELETE FROM public.curriculum_subject WHERE subject_id=(SELECT subject_id FROM public.subject WHERE subject_code='__CA_SUB__');
SELECT pg_temp.audit_assert('a removed prerequisite link is audited', (SELECT count(*)=1 FROM public.academic_setup_audit_log WHERE entity_type='subject_prerequisite' AND action='DELETE' AND actor='__CURRICULUM_AUDIT_TEST__' AND after_data IS NULL));
SELECT pg_temp.audit_assert('a removed semester rule is audited', (SELECT count(*)=1 FROM public.academic_setup_audit_log WHERE entity_type='subject_semester_rule' AND action='DELETE' AND actor='__CURRICULUM_AUDIT_TEST__'));
SELECT pg_temp.audit_assert('a removed mapping is audited and the shared subject stays',
  (SELECT count(*)=1 FROM public.academic_setup_audit_log WHERE entity_type='curriculum_subject' AND action='DELETE' AND actor='__CURRICULUM_AUDIT_TEST__')
  AND EXISTS (SELECT 1 FROM public.subject WHERE subject_code='__CA_SUB__'));
-- Clearing a what-if scenario row is audited (uses an existing row when the database has one; skipped on an empty database).
DO $scenario$
DECLARE target integer;
BEGIN
  SELECT simulation_subject_id INTO target FROM public.simulation_subject ORDER BY simulation_subject_id LIMIT 1;
  IF target IS NOT NULL THEN
    DELETE FROM public.simulation_subject WHERE simulation_subject_id=target;
    PERFORM pg_temp.audit_assert('a cleared what-if scenario row is audited',
      (SELECT count(*)=1 FROM public.academic_setup_audit_log WHERE entity_type='simulation_subject' AND entity_id=target AND action='DELETE' AND actor='__CURRICULUM_AUDIT_TEST__'));
  ELSE
    INSERT INTO db_curriculum_audit_results VALUES('a cleared what-if scenario row is audited (no scenario rows: skipped)','PASS');
  END IF;
END $scenario$;
SELECT test_name,status FROM db_curriculum_audit_results ORDER BY test_name;
ROLLBACK;
