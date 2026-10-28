-- SYNTHETIC / DEMO / NOT OFFICIAL UTMSPACE DATA.
-- No persistent fixtures: the entire script ends with ROLLBACK.
BEGIN;
CREATE TEMP TABLE db_foundation_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.assert_rejected(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE rejected boolean:=false; code text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    IF code NOT IN ('23502','23503','23505','23514','42501') THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid write was accepted: %',label; END IF;
  INSERT INTO db_foundation_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.assert_true(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF;
 INSERT INTO db_foundation_results VALUES(label,'PASS'); END $test$;

INSERT INTO public.programme(programme_id,programme_code,programme_name) VALUES(-2000000001,'DBTEST_A','DEMO / NOT OFFICIAL'),(-2000000002,'DBTEST_B','DEMO / NOT OFFICIAL');
INSERT INTO public.curriculum(curriculum_id,curriculum_version,total_credit_required,programme_id) VALUES(-2000000011,'DBTEST_A',99,-2000000001),(-2000000012,'DBTEST_B',99,-2000000002);
INSERT INTO public.subject(subject_id,subject_code,subject_name,credit_hours,class_type) VALUES
 (-2000000021,'DBTEST_S1','DEMO SUBJECT 1',3,'LECTURE'),(-2000000022,'DBTEST_S2','DEMO SUBJECT 2',3,'LECTURE'),
 (-2000000023,'DBTEST_S3','DEMO SUBJECT 3',3,'LAB'),(-2000000024,'DBTEST_S4','DEMO SUBJECT 4',3,'LECTURE');
INSERT INTO public.curriculum_subject(curriculum_subject_id,is_compulsory,subject_category,curriculum_id,subject_id) VALUES
 (-2000000031,1,'DEMO',-2000000011,-2000000021),(-2000000032,1,'DEMO',-2000000011,-2000000022),
 (-2000000033,1,'DEMO',-2000000011,-2000000024),(-2000000034,1,'DEMO',-2000000012,-2000000021),
 (-2000000035,1,'DEMO',-2000000012,-2000000023);
INSERT INTO public.curriculum_requirement(requirement_type,required_credits,curriculum_id) VALUES('DEMO',0,-2000000011);
INSERT INTO public.subject_semester_rule(semester_type,curriculum_subject_id) VALUES('NORMAL',-2000000031);
INSERT INTO public.academic_semester(semester_id,academic_year,semester_no,semester_type,max_subjects,max_credits) VALUES
 (-2000000041,'1000/1001',1,'NORMAL',9,99),(-2000000042,'1000/1001',3,'SHORT',9,77);
INSERT INTO public.student_profile(student_id,clerk_user_id,student_name,curriculum_id,weekly_working_hours) VALUES
 (-2000000051,'__DB_TEST_STUDENT_A','DEMO NOT A REAL PERSON',-2000000011,0),
 (-2000000052,'__DB_TEST_STUDENT_B','DEMO NOT A REAL PERSON',-2000000012,0);
INSERT INTO public.academic_record(record_id,status,recognized_credits,student_id,subject_id,semester_id) VALUES
 (-2000000061,'COMPLETED',3,-2000000051,-2000000021,-2000000041),
 (-2000000062,'EXEMPTED',0,-2000000051,-2000000022,NULL),
 (-2000000063,'FAILED',0,-2000000051,-2000000021,-2000000042);
INSERT INTO public.semester_offering(offering_id,student_id,semester_id,curriculum_subject_id) VALUES(-2000000071,-2000000051,-2000000041,-2000000031);
INSERT INTO public.academic_plan(plan_id,plan_type,status,student_id) VALUES
 (-2000000081,'DEMO','DRAFT',-2000000051),(-2000000082,'DEMO','DRAFT',-2000000052);
INSERT INTO public.plan_subject(plan_id,curriculum_subject_id,semester_id) VALUES(-2000000081,-2000000031,-2000000041);
INSERT INTO public.simulation_scenario(scenario_id,scenario_name,student_id,source_plan_id) VALUES(-2000000091,'DEMO',-2000000051,-2000000081);
INSERT INTO public.simulation_subject(scenario_id,curriculum_subject_id,change_type) VALUES(-2000000091,-2000000032,'DEMO_HYPOTHESIS');

SELECT pg_temp.assert_true('shared catalogue subject across curricula',(SELECT count(*)=2 FROM public.curriculum_subject WHERE subject_id=-2000000021));
SELECT pg_temp.assert_true('retakes in separate semesters',(SELECT count(*)=2 FROM public.academic_record WHERE student_id=-2000000051 AND subject_id=-2000000021));
SELECT pg_temp.assert_true('zero-credit exemption distinct from completed',(SELECT status='EXEMPTED' AND recognized_credits=0 FROM public.academic_record WHERE record_id=-2000000062));
SELECT pg_temp.assert_rejected('duplicate programme',$q$INSERT INTO public.programme(programme_code,programme_name) VALUES('DBTEST_A','DEMO')$q$);
SELECT pg_temp.assert_rejected('duplicate subject',$q$INSERT INTO public.subject(subject_code,subject_name,credit_hours) VALUES('DBTEST_S1','DEMO',3)$q$);
SELECT pg_temp.assert_rejected('duplicate curriculum mapping',$q$INSERT INTO public.curriculum_subject(is_compulsory,subject_category,curriculum_id,subject_id) VALUES(1,'DEMO',-2000000011,-2000000021)$q$);
SELECT pg_temp.assert_rejected('negative subject credits',$q$UPDATE public.subject SET credit_hours=-1 WHERE subject_id=-2000000023$q$);
SELECT pg_temp.assert_rejected('negative profile hours',$q$UPDATE public.student_profile SET weekly_working_hours=-1 WHERE student_id=-2000000051$q$);
SELECT pg_temp.assert_rejected('missing curriculum FK',$q$INSERT INTO public.curriculum_requirement(requirement_type,curriculum_id) VALUES('DEMO',-1999999999)$q$);
SELECT pg_temp.assert_rejected('semester four',$q$UPDATE public.academic_semester SET semester_no=4 WHERE semester_id=-2000000042$q$);
SELECT pg_temp.assert_rejected('short semester mislabelled',$q$UPDATE public.academic_semester SET semester_type='NORMAL' WHERE semester_id=-2000000042$q$);
SELECT pg_temp.assert_rejected('duplicate offering',$q$INSERT INTO public.semester_offering(student_id,semester_id,curriculum_subject_id) VALUES(-2000000051,-2000000041,-2000000031)$q$);
SELECT pg_temp.assert_rejected('record outside curriculum',$q$INSERT INTO public.academic_record(status,recognized_credits,student_id,subject_id) VALUES('COMPLETED',3,-2000000051,-2000000023)$q$);
SELECT pg_temp.assert_rejected('offering outside curriculum',$q$INSERT INTO public.semester_offering(student_id,semester_id,curriculum_subject_id) VALUES(-2000000051,-2000000041,-2000000035)$q$);
SELECT pg_temp.assert_rejected('plan subject outside curriculum',$q$INSERT INTO public.plan_subject(plan_id,curriculum_subject_id,semester_id) VALUES(-2000000081,-2000000035,-2000000041)$q$);
SELECT pg_temp.assert_rejected('simulation subject outside curriculum',$q$INSERT INTO public.simulation_subject(scenario_id,curriculum_subject_id,change_type) VALUES(-2000000091,-2000000035,'DEMO')$q$);
SELECT pg_temp.assert_rejected('another students source plan',$q$UPDATE public.simulation_scenario SET source_plan_id=-2000000082 WHERE scenario_id=-2000000091$q$);
SELECT pg_temp.assert_rejected('parent curriculum reassignment',$q$UPDATE public.student_profile SET curriculum_id=-2000000012 WHERE student_id=-2000000051$q$);
SELECT pg_temp.assert_rejected('parent mapping reassignment',$q$UPDATE public.curriculum_subject SET curriculum_id=-2000000012 WHERE curriculum_subject_id=-2000000031$q$);
SELECT pg_temp.assert_rejected('duplicate dated attempt',$q$INSERT INTO public.academic_record(status,recognized_credits,student_id,subject_id,semester_id) VALUES('WITHDRAWN',0,-2000000051,-2000000021,-2000000041)$q$);
SELECT pg_temp.assert_rejected('duplicate undated attempt',$q$INSERT INTO public.academic_record(status,recognized_credits,student_id,subject_id) VALUES('EXEMPTED',0,-2000000051,-2000000022)$q$);
SELECT pg_temp.assert_rejected('failed outcome with earned credits',$q$UPDATE public.academic_record SET recognized_credits=1 WHERE record_id=-2000000063$q$);
SELECT pg_temp.assert_rejected('recognition exceeds subject credits',$q$UPDATE public.academic_record SET recognized_credits=4 WHERE record_id=-2000000061$q$);
INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type) VALUES
 (-2000000031,-2000000032,'MANDATORY'),(-2000000032,-2000000033,'MANDATORY');
SELECT pg_temp.assert_rejected('cross-curriculum prerequisite',$q$INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type) VALUES(-2000000031,-2000000035,'MANDATORY')$q$);
SELECT pg_temp.assert_rejected('mandatory prerequisite cycle',$q$INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type) VALUES(-2000000033,-2000000031,'MANDATORY')$q$);
INSERT INTO public.subject_prerequisite(curriculum_subject_id,required_curriculum_subject_id,requirement_type) VALUES(-2000000033,-2000000031,'RECOMMENDED');

INSERT INTO public.user_access_assignment(access_assignment_id,clerk_user_id,app_role,access_status) VALUES
 (-2000000101,'__DB_TEST_ACCESS_STUDENT','STUDENT','ACTIVE'),
 (-2000000102,'__DB_TEST_ADMIN_A','STUDENT','ACTIVE'),(-2000000103,'__DB_TEST_ADMIN_B','STUDENT','ACTIVE');
SELECT set_config('app.access_actor','__DB_TEST_OPERATOR__',true);
SELECT set_config('app.access_reason','Synthetic baseline administrator fixtures.',true);
INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason) VALUES
 (-2000000102,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__DB_TEST_OPERATOR__','Synthetic baseline administrator A.'),
 (-2000000103,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__DB_TEST_OPERATOR__','Synthetic baseline administrator B.');
SELECT pg_temp.assert_rejected('invalid app role',$q$UPDATE public.user_access_assignment SET app_role='OWNER' WHERE access_assignment_id=-2000000101$q$);
SELECT pg_temp.assert_rejected('invalid access status',$q$UPDATE public.user_access_assignment SET access_status='ENABLED' WHERE access_assignment_id=-2000000101$q$);
INSERT INTO public.user_access_audit_log(access_audit_id,access_assignment_id,performed_by_clerk_user_id,change_type,new_value) VALUES
 (-2000000111,-2000000101,'__DB_TEST_ADMIN_A','ACCESS_STATUS_CHANGE','ACTIVE');
SELECT pg_temp.assert_rejected('access audit update',$q$UPDATE public.user_access_audit_log SET reason='MUTATED' WHERE access_audit_id=-2000000111$q$);
SELECT pg_temp.assert_rejected('access audit delete',$q$DELETE FROM public.user_access_audit_log WHERE access_audit_id=-2000000111$q$);
SELECT pg_temp.assert_rejected('access audit truncate',$q$TRUNCATE public.user_access_audit_log$q$);
UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE access_assignment_id=-2000000102;
DO $test$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id) WHERE r.app_role='SYSTEM_ADMIN' AND a.access_status='ACTIVE' AND a.access_assignment_id<>-2000000103) THEN
  PERFORM pg_temp.assert_rejected('last active admin preservation',$q$UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE access_assignment_id=-2000000103$q$);
 ELSE INSERT INTO db_foundation_results VALUES('last active admin preservation','SKIP: existing administrator preserved');
 END IF;
END $test$;

INSERT INTO public.learning_centre(learning_centre_id,centre_code,centre_name) VALUES(-2000000121,'DBTEST_A','DEMO'),(-2000000122,'DBTEST_B','DEMO');
INSERT INTO public.academic_import_batch(import_batch_id,learning_centre_id,snapshot_date,provided_by,source_label,import_status) VALUES
 (-2000000131,-2000000121,'1000-01-01','__DB_TEST_COORDINATOR','DEMO NOT OFFICIAL','DEMO'),
 (-2000000132,-2000000122,'1000-01-01','__DB_TEST_COORDINATOR','DEMO NOT OFFICIAL','DEMO');
INSERT INTO public.imported_student(imported_student_id,import_batch_id,curriculum_id,external_reference,cohort_status) VALUES(-2000000141,-2000000131,-2000000011,'DEMO_NOT_A_PERSON','DEMO');
INSERT INTO public.imported_subject_record(imported_student_id,subject_id,subject_status,semester_id,is_synthetic) VALUES
 (-2000000141,-2000000021,'FAILED',-2000000041,true),(-2000000141,-2000000021,'COMPLETED',-2000000042,true);
SELECT pg_temp.assert_rejected('imported record outside curriculum',$q$INSERT INTO public.imported_subject_record(imported_student_id,subject_id,subject_status,is_synthetic) VALUES(-2000000141,-2000000023,'COMPLETED',true)$q$);
SELECT pg_temp.assert_true('coordinator and portal identities separate',(SELECT count(*)=2 FROM public.student_profile WHERE clerk_user_id LIKE '__DB_TEST_STUDENT_%') AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='imported_student' AND column_name='student_id'));
INSERT INTO public.class_capacity_rule(capacity_rule_id,class_type,minimum_enrollment,break_even_target,normal_maximum,exception_maximum,is_active) VALUES(-2000000151,'LECTURE',1,2,3,4,true);
SELECT pg_temp.assert_rejected('impossible capacity',$q$UPDATE public.class_capacity_rule SET minimum_enrollment=9 WHERE capacity_rule_id=-2000000151$q$);
INSERT INTO public.forecast_run(forecast_run_id,import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number) VALUES
 (-2000000161,-2000000131,-2000000041,'{}','__DB_TEST_COORDINATOR','DRAFT',-2000000121,1);
SELECT pg_temp.assert_rejected('forecast batch centre mismatch',$q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number) VALUES(-2000000131,-2000000041,'{}','DEMO','DRAFT',-2000000122,1)$q$);
SELECT pg_temp.assert_rejected('duplicate forecast version',$q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number) VALUES(-2000000131,-2000000041,'{}','DEMO','DRAFT',-2000000121,1)$q$);
SELECT pg_temp.assert_rejected('referenced snapshot edit',$q$UPDATE public.academic_import_batch SET source_label='MUTATED' WHERE import_batch_id=-2000000131$q$);
SELECT pg_temp.assert_rejected('referenced imported history edit',$q$UPDATE public.imported_subject_record SET subject_status='EXEMPTED' WHERE imported_student_id=-2000000141$q$);
INSERT INTO public.forecast_subject_demand(demand_id,forecast_run_id,subject_id,eligible_count,forecast_count,graduation_critical_count,data_quality_status) VALUES(-2000000171,-2000000161,-2000000021,NULL,2,NULL,'PRELIMINARY');
INSERT INTO public.proposed_class_section(proposed_section_id,demand_id,capacity_rule_id,section_number,expected_students,review_status) VALUES(-2000000181,-2000000171,-2000000151,1,2,'REVIEW');
SELECT pg_temp.assert_rejected('section exceeds configured capacity',$q$UPDATE public.proposed_class_section SET expected_students=5 WHERE proposed_section_id=-2000000181$q$);
SELECT pg_temp.assert_rejected('unjustified capacity exception',$q$UPDATE public.proposed_class_section SET expected_students=4 WHERE proposed_section_id=-2000000181$q$);
SELECT pg_temp.assert_rejected('referenced capacity policy mutation',$q$UPDATE public.class_capacity_rule SET normal_maximum=4 WHERE capacity_rule_id=-2000000151$q$);
INSERT INTO public.forecast_decision_audit_log(decision_audit_id,proposed_section_id,action_type,new_status,recorded_by) VALUES(-2000000191,-2000000181,'REVIEW','REVIEW','__DB_TEST_COORDINATOR');
SELECT pg_temp.assert_rejected('decision audit update',$q$UPDATE public.forecast_decision_audit_log SET reason='MUTATED' WHERE decision_audit_id=-2000000191$q$);
SELECT pg_temp.assert_rejected('decision audit delete',$q$DELETE FROM public.forecast_decision_audit_log WHERE decision_audit_id=-2000000191$q$);
SELECT pg_temp.assert_rejected('decision audit truncate',$q$TRUNCATE public.forecast_decision_audit_log$q$);
-- Final decision history is written before finalization in this same transaction.
INSERT INTO public.forecast_decision_audit_log(proposed_section_id,action_type,old_status,new_status,recorded_by) VALUES(-2000000181,'FINALIZE','REVIEW','APPROVED','__DB_TEST_COORDINATOR');
UPDATE public.forecast_run SET status='FINALIZED',finalized_by='__DB_TEST_COORDINATOR',finalized_at=now() WHERE forecast_run_id=-2000000161;
SELECT pg_temp.assert_rejected('finalized demand update',$q$UPDATE public.forecast_subject_demand SET forecast_count=9 WHERE demand_id=-2000000171$q$);
SELECT pg_temp.assert_rejected('finalized demand delete',$q$DELETE FROM public.forecast_subject_demand WHERE demand_id=-2000000171$q$);
SELECT pg_temp.assert_rejected('finalized demand insert',$q$INSERT INTO public.forecast_subject_demand(forecast_run_id,subject_id,data_quality_status) VALUES(-2000000161,-2000000022,'PRELIMINARY')$q$);
SELECT pg_temp.assert_rejected('finalized section update',$q$UPDATE public.proposed_class_section SET expected_students=9 WHERE proposed_section_id=-2000000181$q$);
SELECT pg_temp.assert_rejected('finalized section delete',$q$DELETE FROM public.proposed_class_section WHERE proposed_section_id=-2000000181$q$);
SELECT pg_temp.assert_rejected('finalized section insert',$q$INSERT INTO public.proposed_class_section(demand_id,capacity_rule_id,section_number,expected_students,review_status) VALUES(-2000000171,-2000000151,2,1,'REVIEW')$q$);
SELECT pg_temp.assert_rejected('late finalized decision',$q$INSERT INTO public.forecast_decision_audit_log(proposed_section_id,action_type,new_status,recorded_by) VALUES(-2000000181,'REOPEN','REVIEW','DEMO')$q$);
SELECT pg_temp.assert_rejected('finalized assumptions update',$q$UPDATE public.forecast_run SET scenario_assumptions='{"changed":true}' WHERE forecast_run_id=-2000000161$q$);
SELECT pg_temp.assert_rejected('finalized source change',$q$UPDATE public.forecast_run SET import_batch_id=-2000000132 WHERE forecast_run_id=-2000000161$q$);
SELECT pg_temp.assert_rejected('finalized reopen',$q$UPDATE public.forecast_run SET status='DRAFT',finalized_by=NULL,finalized_at=NULL WHERE forecast_run_id=-2000000161$q$);
SELECT pg_temp.assert_rejected('finalized delete',$q$DELETE FROM public.forecast_run WHERE forecast_run_id=-2000000161$q$);
INSERT INTO public.forecast_run(forecast_run_id,import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,parent_forecast_run_id) VALUES(-2000000162,-2000000131,-2000000041,'{}','DEMO','DRAFT',-2000000121,2,-2000000161);
SELECT pg_temp.assert_rejected('forecast parent semester mismatch',$q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,parent_forecast_run_id) VALUES(-2000000131,-2000000042,'{}','DEMO','DRAFT',-2000000121,2,-2000000161)$q$);
UPDATE public.forecast_run SET status='SUPERSEDED' WHERE forecast_run_id=-2000000161;
SELECT pg_temp.assert_rejected('superseded demand remains frozen',$q$UPDATE public.forecast_subject_demand SET forecast_count=7 WHERE demand_id=-2000000171$q$);
UPDATE public.forecast_run SET status='ARCHIVED' WHERE forecast_run_id=-2000000161;
SELECT pg_temp.assert_true('new forecast retains prior lineage',(SELECT parent_forecast_run_id=-2000000161 FROM public.forecast_run WHERE forecast_run_id=-2000000162));
SELECT pg_temp.assert_true('simulation did not mutate actual outcomes',(SELECT status='COMPLETED' AND recognized_credits=3 FROM public.academic_record WHERE record_id=-2000000061));
SELECT test_name,status FROM db_foundation_results ORDER BY test_name;
ROLLBACK;
