-- DEVELOPMENT ONLY. Synthetic fixtures; everything is rolled back.
BEGIN;
-- 0008 requires an audited academic-setup context for reference fixtures (learning_centre, academic_semester).
SELECT set_config('app.access_actor','__DB_UC20_TEST__',true),
       set_config('app.access_reason','Synthetic rollback-only UC20 fixtures.',true);
CREATE TEMP TABLE db_uc20_results(test_name text,status text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.assert_uc20_rejected(label text,statement text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE rejected boolean:=false; code text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    IF code NOT IN ('23001','23502','23503','23505','23514','42501') THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid UC20 operation accepted: %',label; END IF;
  INSERT INTO db_uc20_results VALUES(label,'PASS');
END $test$;
CREATE FUNCTION pg_temp.assert_uc20_true(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF;
  INSERT INTO db_uc20_results VALUES(label,'PASS'); END $test$;

-- Fixtures (ids -1900000xxx). Two programmes, two centres, two semesters.
INSERT INTO public.programme(programme_id,programme_code,programme_name) VALUES(-1900000001,'UC20_A','DEMO'),(-1900000002,'UC20_B','DEMO');
INSERT INTO public.curriculum(curriculum_id,curriculum_version,total_credit_required,programme_id) VALUES(-1900000011,'UC20_A',99,-1900000001),(-1900000012,'UC20_B',99,-1900000002);
INSERT INTO public.subject(subject_id,subject_code,subject_name,credit_hours,class_type,include_in_offering_forecast) VALUES
 (-1900000021,'UC20_S1','DEMO 1',3,'LECTURE',true),(-1900000022,'UC20_S2','DEMO 2',3,'LAB',true),
 (-1900000023,'UC20_FYP','DEMO EXCLUDED',6,'LECTURE',false),(-1900000024,'UC20_S4','DEMO NOT IN RUN',3,'LECTURE',true);
INSERT INTO public.curriculum_subject(curriculum_subject_id,is_compulsory,subject_category,curriculum_id,subject_id) VALUES
 (-1900000031,1,'DEMO',-1900000011,-1900000021),(-1900000032,1,'DEMO',-1900000011,-1900000022),
 (-1900000033,1,'DEMO',-1900000011,-1900000023),(-1900000034,1,'DEMO',-1900000012,-1900000021);
INSERT INTO public.academic_semester(semester_id,academic_year,semester_no,semester_type,max_subjects,max_credits) VALUES
 (-1900000041,'1000/1001',1,'NORMAL',9,99),(-1900000042,'1000/1001',2,'NORMAL',9,99);
INSERT INTO public.learning_centre(learning_centre_id,centre_code,centre_name) VALUES(-1900000051,'UC20_A','DEMO'),(-1900000052,'UC20_B','DEMO');

-- A. Capacity: OP14 values are configuration rows in the existing table.
INSERT INTO public.class_capacity_rule(capacity_rule_id,class_type,minimum_enrollment,break_even_target,normal_maximum,exception_maximum,is_active) VALUES
 (-1900000061,'LAB',1,25,35,NULL,true),(-1900000062,'LECTURE',1,25,45,NULL,true);
SELECT pg_temp.assert_uc20_true('capacity expresses LAB 35 / LECTURE 45 / optimal 25',
  (SELECT count(*)=2 FROM public.class_capacity_rule WHERE capacity_rule_id IN (-1900000061,-1900000062) AND break_even_target=25
     AND normal_maximum=CASE class_type WHEN 'LAB' THEN 35 ELSE 45 END));

-- B. Import provenance and acceptance freeze
SELECT pg_temp.assert_uc20_rejected('new import batch without programme',
  $q$INSERT INTO public.academic_import_batch(learning_centre_id,snapshot_date,provided_by,source_label,import_status) VALUES(-1900000051,'1000-01-01','__UC20_COORD','DEMO','UPLOADED')$q$);
SELECT pg_temp.assert_uc20_rejected('new import batch with unknown status',
  $q$INSERT INTO public.academic_import_batch(learning_centre_id,snapshot_date,provided_by,source_label,import_status,programme_id) VALUES(-1900000051,'1000-01-01','__UC20_COORD','DEMO','DEMO',-1900000001)$q$);
INSERT INTO public.academic_import_batch(import_batch_id,learning_centre_id,snapshot_date,provided_by,source_label,import_status,programme_id,target_semester_id) VALUES
 (-1900000071,-1900000051,'1000-01-01','__UC20_COORD','DEMO','UPLOADED',-1900000001,-1900000041),
 (-1900000072,-1900000051,'1000-01-01','__UC20_COORD','DEMO unaccepted','UPLOADED',-1900000001,-1900000041),
 (-1900000073,-1900000052,'1000-01-01','__UC20_COORD','DEMO programme B','UPLOADED',-1900000002,-1900000041);
SELECT pg_temp.assert_uc20_rejected('student curriculum outside import programme',
  $q$INSERT INTO public.imported_student(import_batch_id,curriculum_id,external_reference,cohort_status) VALUES(-1900000071,-1900000012,'DEMO_X','DEMO')$q$);
INSERT INTO public.imported_student(imported_student_id,import_batch_id,curriculum_id,external_reference,cohort_status,history_completeness) VALUES
 (-1900000081,-1900000071,-1900000011,'DEMO_NOT_A_PERSON','DEMO','PARTIAL');
INSERT INTO public.imported_subject_record(imported_student_id,subject_id,subject_status,is_synthetic,recognized_credits) VALUES(-1900000081,-1900000021,'COMPLETED',true,3);
SELECT pg_temp.assert_uc20_rejected('blank student name',
  $q$UPDATE public.imported_student SET student_name='   ' WHERE imported_student_id=-1900000081$q$);
SELECT pg_temp.assert_uc20_rejected('bad history completeness',
  $q$UPDATE public.imported_student SET history_completeness='MAYBE' WHERE imported_student_id=-1900000081$q$);
SELECT pg_temp.assert_uc20_rejected('accept without validation',
  $q$UPDATE public.academic_import_batch SET import_status='ACCEPTED',accepted_by='__UC20_COORD' WHERE import_batch_id=-1900000071$q$);
UPDATE public.academic_import_batch SET import_status='VALIDATED',source_fingerprint=repeat('b',64),validation_summary='{"errors":0}' WHERE import_batch_id IN (-1900000071,-1900000072,-1900000073);
SELECT pg_temp.assert_uc20_rejected('accept without accepted_by',
  $q$UPDATE public.academic_import_batch SET import_status='ACCEPTED' WHERE import_batch_id=-1900000071$q$);
UPDATE public.academic_import_batch SET import_status='ACCEPTED',accepted_by='__UC20_COORD',accepted_at='1000-01-01' WHERE import_batch_id IN (-1900000071,-1900000073);
SELECT pg_temp.assert_uc20_true('acceptance time comes from the database clock',
  (SELECT accepted_at>now()-interval '1 minute' FROM public.academic_import_batch WHERE import_batch_id=-1900000071));
SELECT pg_temp.assert_uc20_rejected('accepted batch edit',$q$UPDATE public.academic_import_batch SET source_label='MUTATED' WHERE import_batch_id=-1900000071$q$);
SELECT pg_temp.assert_uc20_rejected('accepted batch delete',$q$DELETE FROM public.academic_import_batch WHERE import_batch_id=-1900000071$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot student insert',
  $q$INSERT INTO public.imported_student(import_batch_id,curriculum_id,external_reference,cohort_status) VALUES(-1900000071,-1900000011,'DEMO_LATE','DEMO')$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot student update',$q$UPDATE public.imported_student SET cohort_status='CHANGED' WHERE imported_student_id=-1900000081$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot student name update',
  $q$UPDATE public.imported_student SET student_name='Changed' WHERE imported_student_id=-1900000081$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot student delete',$q$DELETE FROM public.imported_student WHERE imported_student_id=-1900000081$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot record insert',
  $q$INSERT INTO public.imported_subject_record(imported_student_id,subject_id,subject_status,is_synthetic) VALUES(-1900000081,-1900000022,'COMPLETED',true)$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot record update',$q$UPDATE public.imported_subject_record SET subject_status='FAILED' WHERE imported_student_id=-1900000081$q$);
SELECT pg_temp.assert_uc20_rejected('accepted snapshot record delete',$q$DELETE FROM public.imported_subject_record WHERE imported_student_id=-1900000081$q$);
UPDATE public.academic_import_batch SET import_status='REJECTED' WHERE import_batch_id=-1900000072;
SELECT pg_temp.assert_uc20_rejected('rejected batch cannot be accepted',
  $q$UPDATE public.academic_import_batch SET import_status='ACCEPTED',accepted_by='X' WHERE import_batch_id=-1900000072$q$);

-- C. Forecast run scope, snapshot and unique namespace
SELECT pg_temp.assert_uc20_rejected('run without programme',
  $q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,rule_snapshot,engine_version) VALUES(-1900000071,-1900000041,'{}','__UC20_COORD','DRAFT',-1900000051,1,'{}','e1')$q$);
SELECT pg_temp.assert_uc20_rejected('run without rule snapshot',
  $q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,engine_version) VALUES(-1900000071,-1900000041,'{}','__UC20_COORD','DRAFT',-1900000051,1,-1900000001,'e1')$q$);
SELECT pg_temp.assert_uc20_rejected('run from unaccepted (rejected) snapshot',
  $q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,rule_snapshot,engine_version) VALUES(-1900000072,-1900000041,'{}','__UC20_COORD','DRAFT',-1900000051,1,-1900000001,'{}','e1')$q$);
SELECT pg_temp.assert_uc20_rejected('run programme differs from snapshot',
  $q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,rule_snapshot,engine_version) VALUES(-1900000071,-1900000041,'{}','__UC20_COORD','DRAFT',-1900000051,1,-1900000002,'{}','e1')$q$);
SELECT pg_temp.assert_uc20_rejected('run target semester differs from snapshot',
  $q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,rule_snapshot,engine_version) VALUES(-1900000071,-1900000042,'{}','__UC20_COORD','DRAFT',-1900000051,1,-1900000001,'{}','e1')$q$);
INSERT INTO public.forecast_run(forecast_run_id,import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,rule_snapshot,engine_version,original_recommendations) VALUES
 (-1900000091,-1900000071,-1900000041,'{"assumption":"x"}','__UC20_COORD','DRAFT',-1900000051,1,-1900000001,'{"capacity":{"LAB":35,"LECTURE":45,"optimal":25}}','engine-1','[]');
SELECT pg_temp.assert_uc20_rejected('duplicate programme/centre/semester/version',
  $q$INSERT INTO public.forecast_run(import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,rule_snapshot,engine_version) VALUES(-1900000071,-1900000041,'{}','__UC20_COORD','DRAFT',-1900000051,1,-1900000001,'{}','e1')$q$);
INSERT INTO public.forecast_run(forecast_run_id,import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,learning_centre_id,version_number,programme_id,rule_snapshot,engine_version) VALUES
 (-1900000092,-1900000073,-1900000041,'{}','__UC20_COORD','DRAFT',-1900000052,1,-1900000002,'{}','engine-1');
SELECT pg_temp.assert_uc20_true('another programme/centre shares semester and version number',(SELECT count(*)=2 FROM public.forecast_run WHERE forecast_run_id IN (-1900000091,-1900000092)));
SELECT pg_temp.assert_uc20_rejected('run snapshot is immutable',$q$UPDATE public.forecast_run SET rule_snapshot='{"changed":true}' WHERE forecast_run_id=-1900000091$q$);
SELECT pg_temp.assert_uc20_rejected('run engine version is immutable',$q$UPDATE public.forecast_run SET engine_version='engine-2' WHERE forecast_run_id=-1900000091$q$);
SELECT pg_temp.assert_uc20_rejected('run programme is immutable',$q$UPDATE public.forecast_run SET programme_id=-1900000002 WHERE forecast_run_id=-1900000091$q$);

-- D. Demand detail, adjustment audit, finalization freeze
INSERT INTO public.forecast_subject_demand(demand_id,forecast_run_id,subject_id,eligible_count,forecast_count,data_quality_status,uncertain_count,uncertainty_reasons,configuration_status) VALUES
 (-1900000101,-1900000091,-1900000021,10,8,'SUPPORTED',2,'["HISTORY_PARTIAL"]','CONFIGURED'),
 (-1900000102,-1900000091,-1900000022,5,5,'SUPPORTED',0,'[]','CONFIGURED'),
 (-1900000103,-1900000091,-1900000023,NULL,NULL,'INSUFFICIENT_DATA',NULL,'[]','EXCLUDED'),
 (-1900000104,-1900000092,-1900000021,1,1,'SUPPORTED',0,'[]','CONFIGURED');
SELECT pg_temp.assert_uc20_rejected('bad configuration status',$q$UPDATE public.forecast_subject_demand SET configuration_status='NOPE' WHERE demand_id=-1900000101$q$);
INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES
 (-1900000091,-1900000101,'REPLACE_ALLOCATION','{"sections":[{"n":1,"students":8}]}','{"sections":[{"n":1,"students":4},{"n":2,"students":4}]}','Split for lab capacity','__UC20_COORD'),
 (-1900000091,-1900000101,'APPROVE','{"reviewStatus":"PENDING"}','{"reviewStatus":"APPROVED"}','Reviewed','__UC20_COORD');
SELECT pg_temp.assert_uc20_rejected('adjustment audit invalid action',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000101,'DELETE','{}','{}','r','a')$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit missing reason',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000101,'REVIEW','{}','{}','','a')$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit missing actor',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000101,'REVIEW','{}','{}','r',' ')$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit missing before state',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000101,'REVIEW',NULL,'{}','r','a')$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit demand of another run',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000104,'REVIEW','{}','{}','r','a')$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit update',$q$UPDATE public.forecast_adjustment_audit SET reason='MUTATED'$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit delete',$q$DELETE FROM public.forecast_adjustment_audit$q$);
SELECT pg_temp.assert_uc20_rejected('adjustment audit truncate',$q$TRUNCATE public.forecast_adjustment_audit$q$);

-- START_REVIEW is a run-level audit entry (no subject), written while the run is DRAFT, once per run.
SELECT pg_temp.assert_uc20_rejected('START_REVIEW must not name a subject',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000101,'START_REVIEW','{}','{}','Review started.','__UC20_COORD')$q$);
SELECT pg_temp.assert_uc20_rejected('subject decision must name a subject (REVIEW without demand)',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,'REVIEW','{}','{}','r','a')$q$);
INSERT INTO public.forecast_adjustment_audit(forecast_run_id,action,before_state,after_state,reason,recorded_by) VALUES
 (-1900000091,'START_REVIEW','{"status":"DRAFT"}','{"status":"UNDER_REVIEW"}','Review started.','__UC20_COORD');
UPDATE public.forecast_run SET status='UNDER_REVIEW' WHERE forecast_run_id=-1900000091;
SELECT pg_temp.assert_uc20_rejected('only one START_REVIEW audit per run',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,'START_REVIEW','{}','{}','Again','__UC20_COORD')$q$);

-- Confirmation cannot start before a FINALIZED run.
SELECT set_config('app.offering_actor','__UC20_COORD',true);
SELECT set_config('app.offering_reason','Synthetic confirmation.',true);
SELECT pg_temp.assert_uc20_rejected('confirmation requires FINALIZED run (draft)',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000051,-1900000041,-1900000091,now()+interval '7 days')$q$);

INSERT INTO public.forecast_adjustment_audit(forecast_run_id,action,before_state,after_state,reason,recorded_by) VALUES
 (-1900000091,'FINALIZE','{"status":"UNDER_REVIEW"}','{"status":"FINALIZED"}','Final','__UC20_COORD');
SELECT pg_temp.assert_uc20_rejected('only one FINALIZE audit per run',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,'FINALIZE','{}','{}','Again','__UC20_COORD')$q$);
UPDATE public.forecast_run SET status='FINALIZED',finalized_by='__UC20_COORD',finalized_at=now() WHERE forecast_run_id=-1900000091;
SELECT pg_temp.assert_uc20_rejected('START_REVIEW after finalization',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,'START_REVIEW','{}','{}','Late','__UC20_COORD')$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run demand insert',
  $q$INSERT INTO public.forecast_subject_demand(forecast_run_id,subject_id,data_quality_status) VALUES(-1900000091,-1900000024,'SUPPORTED')$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run demand update (new columns)',$q$UPDATE public.forecast_subject_demand SET uncertain_count=9 WHERE demand_id=-1900000101$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run demand delete',$q$DELETE FROM public.forecast_subject_demand WHERE demand_id=-1900000101$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run section insert',
  $q$INSERT INTO public.proposed_class_section(demand_id,capacity_rule_id,section_number,expected_students,review_status) VALUES(-1900000101,-1900000062,1,8,'PENDING')$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run snapshot update',$q$UPDATE public.forecast_run SET original_recommendations='[1]' WHERE forecast_run_id=-1900000091$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run reopen',$q$UPDATE public.forecast_run SET status='DRAFT',finalized_by=NULL,finalized_at=NULL WHERE forecast_run_id=-1900000091$q$);
SELECT pg_temp.assert_uc20_rejected('finalized run adjustment after freeze',
  $q$INSERT INTO public.forecast_adjustment_audit(forecast_run_id,demand_id,action,before_state,after_state,reason,recorded_by) VALUES(-1900000091,-1900000102,'REOPEN','{}','{}','Late','__UC20_COORD')$q$);

-- E. Confirmation
SELECT set_config('app.offering_actor','',true);
SELECT set_config('app.offering_reason','',true);
SELECT pg_temp.assert_uc20_rejected('confirmation without actor and reason context',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000051,-1900000041,-1900000091,now()+interval '7 days')$q$);
SELECT set_config('app.offering_actor','__UC20_COORD',true);
SELECT pg_temp.assert_uc20_rejected('confirmation without reason context',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000051,-1900000041,-1900000091,now()+interval '7 days')$q$);
SELECT set_config('app.offering_actor','',true);
SELECT set_config('app.offering_reason','Synthetic confirmation.',true);
SELECT pg_temp.assert_uc20_rejected('confirmation without actor context',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000051,-1900000041,-1900000091,now()+interval '7 days')$q$);
SELECT set_config('app.offering_actor','__UC20_COORD',true);

SELECT pg_temp.assert_uc20_rejected('confirmation run of another programme',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000002,-1900000052,-1900000041,-1900000091,now()+interval '7 days')$q$);
SELECT pg_temp.assert_uc20_rejected('confirmation run of another centre',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000052,-1900000041,-1900000091,now()+interval '7 days')$q$);
SELECT pg_temp.assert_uc20_rejected('confirmation run of another semester',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000051,-1900000042,-1900000091,now()+interval '7 days')$q$);

INSERT INTO public.offering_confirmation(confirmation_id,programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline)
VALUES(-1900000111,-1900000001,-1900000051,-1900000041,-1900000091,now()+interval '7 days');
SELECT pg_temp.assert_uc20_true('header created with actor, revision 1 and SET_DEADLINE audit',
  (SELECT created_by='__UC20_COORD' AND revision=1 FROM public.offering_confirmation WHERE confirmation_id=-1900000111)
  AND (SELECT count(*)=1 FROM public.confirmed_offering_audit WHERE confirmation_id=-1900000111 AND action='SET_DEADLINE' AND before_state IS NULL));
SELECT pg_temp.assert_uc20_rejected('duplicate confirmation scope',
  $q$INSERT INTO public.offering_confirmation(programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline) VALUES(-1900000001,-1900000051,-1900000041,-1900000091,now()+interval '8 days')$q$);

SELECT pg_temp.assert_uc20_rejected('excluded subject cannot be confirmed',
  $q$INSERT INTO public.confirmed_offering(confirmation_id,subject_id) VALUES(-1900000111,-1900000023)$q$);
SELECT pg_temp.assert_uc20_rejected('subject outside the source run cannot be confirmed',
  $q$INSERT INTO public.confirmed_offering(confirmation_id,subject_id) VALUES(-1900000111,-1900000024)$q$);
SELECT set_config('app.offering_reason','',true);
SELECT pg_temp.assert_uc20_rejected('offering without reason context',
  $q$INSERT INTO public.confirmed_offering(confirmation_id,subject_id) VALUES(-1900000111,-1900000021)$q$);
SELECT set_config('app.offering_reason','Confirm for next semester.',true);
INSERT INTO public.confirmed_offering(confirmed_offering_id,confirmation_id,subject_id) VALUES(-1900000121,-1900000111,-1900000021),(-1900000122,-1900000111,-1900000022);
SELECT pg_temp.assert_uc20_true('confirm writes CONFIRM audit and bumps revision',
  (SELECT count(*)=2 FROM public.confirmed_offering_audit WHERE confirmation_id=-1900000111 AND action='CONFIRM' AND reason='Confirm for next semester.' AND recorded_by='__UC20_COORD')
  AND (SELECT revision>1 FROM public.offering_confirmation WHERE confirmation_id=-1900000111));
SELECT set_config('app.offering_reason','',true);
SELECT pg_temp.assert_uc20_rejected('withdraw without reason context',
  $q$UPDATE public.confirmed_offering SET status='WITHDRAWN' WHERE confirmed_offering_id=-1900000121$q$);
SELECT set_config('app.offering_reason','Withdraw: low demand.',true);
UPDATE public.confirmed_offering SET status='WITHDRAWN' WHERE confirmed_offering_id=-1900000121;
SELECT pg_temp.assert_uc20_true('withdraw audited with before/after',
  (SELECT count(*)=1 FROM public.confirmed_offering_audit WHERE subject_id=-1900000021 AND action='WITHDRAW' AND before_state->>'status'='CONFIRMED' AND after_state->>'status'='WITHDRAWN')
  AND (SELECT withdrawn_by='__UC20_COORD' FROM public.confirmed_offering WHERE confirmed_offering_id=-1900000121));
SELECT set_config('app.offering_reason','Re-confirm.',true);
UPDATE public.confirmed_offering SET status='CONFIRMED' WHERE confirmed_offering_id=-1900000121;
SELECT pg_temp.assert_uc20_true('re-confirming a withdrawn subject is allowed and clears withdrawal',
  (SELECT status='CONFIRMED' AND withdrawn_at IS NULL AND withdrawn_by IS NULL FROM public.confirmed_offering WHERE confirmed_offering_id=-1900000121));
SELECT pg_temp.assert_uc20_rejected('offering subject change',$q$UPDATE public.confirmed_offering SET subject_id=-1900000024 WHERE confirmed_offering_id=-1900000121$q$);
SELECT pg_temp.assert_uc20_rejected('offering delete',$q$DELETE FROM public.confirmed_offering WHERE confirmed_offering_id=-1900000121$q$);
SELECT pg_temp.assert_uc20_rejected('offering truncate',$q$TRUNCATE public.confirmed_offering$q$);

SELECT set_config('app.offering_reason','Move deadline.',true);
UPDATE public.offering_confirmation SET pick_deadline=pick_deadline+interval '3 days' WHERE confirmation_id=-1900000111;
SELECT pg_temp.assert_uc20_true('deadline change audited as SET_DEADLINE with before/after',
  (SELECT count(*)=1 FROM public.confirmed_offering_audit WHERE confirmation_id=-1900000111 AND action='SET_DEADLINE' AND before_state IS NOT NULL AND reason='Move deadline.'));
SELECT pg_temp.assert_uc20_rejected('confirmation scope change',$q$UPDATE public.offering_confirmation SET semester_id=-1900000042 WHERE confirmation_id=-1900000111$q$);
SELECT pg_temp.assert_uc20_rejected('confirmation delete',$q$DELETE FROM public.offering_confirmation WHERE confirmation_id=-1900000111$q$);
SELECT pg_temp.assert_uc20_rejected('confirmation truncate',$q$TRUNCATE public.offering_confirmation, public.confirmed_offering, public.confirmed_offering_audit$q$);

-- F. Audit is append-only and context-checked
SELECT pg_temp.assert_uc20_rejected('offering audit update',$q$UPDATE public.confirmed_offering_audit SET reason='MUTATED'$q$);
SELECT pg_temp.assert_uc20_rejected('offering audit delete',$q$DELETE FROM public.confirmed_offering_audit$q$);
SELECT pg_temp.assert_uc20_rejected('offering audit truncate',$q$TRUNCATE public.confirmed_offering_audit$q$);
SELECT pg_temp.assert_uc20_rejected('direct audit insert with mismatched actor',
  $q$INSERT INTO public.confirmed_offering_audit(confirmation_id,subject_id,action,after_state,reason,recorded_by) VALUES(-1900000111,-1900000021,'CONFIRM','{}','Move deadline.','someone_else')$q$);
SELECT pg_temp.assert_uc20_rejected('direct audit insert with invalid action',
  $q$INSERT INTO public.confirmed_offering_audit(confirmation_id,subject_id,action,after_state,reason,recorded_by) VALUES(-1900000111,-1900000021,'DELETE','{}','Move deadline.','__UC20_COORD')$q$);

-- G. Package A/B objects exist only once their own migration (0008 / 0009) is recorded
SELECT pg_temp.assert_uc20_true('no Package A/B objects were introduced by 0007',
  (EXISTS (SELECT 1 FROM migration_meta.schema_migrations WHERE version='0008')
    OR (NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_semester' AND column_name='is_current')
        AND to_regclass('public.coordinator_assignment') IS NULL AND to_regclass('public.faculty') IS NULL))
  AND (EXISTS (SELECT 1 FROM migration_meta.schema_migrations WHERE version='0009')
    OR (NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_profile' AND column_name='learning_centre_id')
        AND to_regclass('public.student_offering_pick') IS NULL)));

SELECT test_name,status FROM db_uc20_results ORDER BY test_name;
ROLLBACK;
