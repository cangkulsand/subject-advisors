-- S2-P004-026: admin-controlled student programme change (students may not change their programme once their profile exists).
-- Additive: one migration_meta context table, one function, and a replaced preserve-membership guard that honours the context.
-- No public table is added; the change is audited in the existing append-only public.academic_setup_audit_log.
CREATE TABLE migration_meta.programme_change_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  student_id integer NOT NULL,
  PRIMARY KEY (backend_pid,transaction_id)
);
REVOKE ALL ON migration_meta.programme_change_context FROM PUBLIC;

-- Same body as 0001, except that the student_profile curriculum guard stands aside inside db_change_student_programme().
CREATE OR REPLACE FUNCTION public.db_preserve_membership() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_TABLE_NAME='student_profile' THEN
    IF NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id AND NOT EXISTS (
      SELECT 1 FROM migration_meta.programme_change_context c
      WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.student_id=OLD.student_id) AND (
      EXISTS (SELECT 1 FROM public.academic_record WHERE student_id=OLD.student_id) OR
      EXISTS (SELECT 1 FROM public.semester_offering WHERE student_id=OLD.student_id) OR
      EXISTS (SELECT 1 FROM public.academic_plan WHERE student_id=OLD.student_id) OR
      EXISTS (SELECT 1 FROM public.simulation_scenario WHERE student_id=OLD.student_id)) THEN
      RAISE EXCEPTION 'Controlled curriculum reconciliation required' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='academic_plan' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'Plan ownership is immutable' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='simulation_scenario' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'Scenario ownership is immutable' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='curriculum_subject' THEN
    IF NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id OR NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
      RAISE EXCEPTION 'Curriculum mapping identity is immutable; create a new mapping' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='subject' THEN
    IF NEW.credit_hours IS DISTINCT FROM OLD.credit_hours AND (
      EXISTS(SELECT 1 FROM public.academic_record WHERE subject_id=OLD.subject_id) OR
      EXISTS(SELECT 1 FROM public.imported_subject_record WHERE subject_id=OLD.subject_id)) THEN
      RAISE EXCEPTION 'Recorded subject credits require controlled reconciliation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

-- Moves a student to another active curriculum (programme + version). Needs the trusted audit context
-- (app.access_actor / app.access_reason). Academic records stay (they reference subject_id). Saved semester picks
-- of semesters after the current one whose selection window has not closed belong to the old curriculum and are removed.
-- Returns the number of removed picks. Rule violations are RAISE EXCEPTION 'PROGRAMME_CHANGE:<CODE>' (23514).
CREATE FUNCTION public.db_change_student_programme(target_student_id integer, target_curriculum_id integer) RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE old_curriculum integer; old_programme integer; new_programme integer; removed_subjects integer[]; removed_count integer;
BEGIN
  PERFORM public.db_academic_setup_context();
  SELECT curriculum_id INTO old_curriculum FROM public.student_profile WHERE student_id=target_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRAMME_CHANGE:STUDENT_NOT_FOUND' USING ERRCODE='23514';
  END IF;
  SELECT g.programme_id INTO new_programme FROM public.curriculum c JOIN public.programme g USING(programme_id)
    WHERE c.curriculum_id=target_curriculum_id AND coalesce(upper(c.status),'ACTIVE')='ACTIVE' AND coalesce(upper(g.status),'ACTIVE')='ACTIVE';
  IF new_programme IS NULL THEN
    RAISE EXCEPTION 'PROGRAMME_CHANGE:CURRICULUM_UNAVAILABLE' USING ERRCODE='23514';
  END IF;
  IF old_curriculum IS NOT DISTINCT FROM target_curriculum_id THEN
    RAISE EXCEPTION 'PROGRAMME_CHANGE:UNCHANGED' USING ERRCODE='23514';
  END IF;
  SELECT programme_id INTO old_programme FROM public.curriculum WHERE curriculum_id=old_curriculum;
  WITH removed AS (
    DELETE FROM public.semester_offering o USING public.curriculum_subject cs, public.academic_semester s
    WHERE o.student_id=target_student_id AND cs.curriculum_subject_id=o.curriculum_subject_id AND cs.curriculum_id<>target_curriculum_id
      AND s.semester_id=o.semester_id AND (s.selection_closes_at IS NULL OR s.selection_closes_at>now())
      AND NOT EXISTS (SELECT 1 FROM public.academic_semester cur WHERE cur.is_current AND (s.academic_year,s.semester_no)<=(cur.academic_year,cur.semester_no))
    RETURNING cs.subject_id
  ) SELECT coalesce(array_agg(subject_id ORDER BY subject_id),'{}'::integer[]), count(*)::integer INTO removed_subjects, removed_count FROM removed;
  INSERT INTO migration_meta.programme_change_context(backend_pid,transaction_id,student_id) VALUES (pg_backend_pid(),txid_current(),target_student_id);
  UPDATE public.student_profile SET curriculum_id=target_curriculum_id WHERE student_id=target_student_id;
  DELETE FROM migration_meta.programme_change_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
  INSERT INTO public.academic_setup_audit_log(entity_type,entity_id,action,actor,reason,before_data,after_data)
  VALUES ('student_programme',target_student_id,'CHANGE_PROGRAMME',btrim(current_setting('app.access_actor',true)),btrim(current_setting('app.access_reason',true)),
    jsonb_build_object('curriculumId',old_curriculum,'programmeId',old_programme),
    jsonb_build_object('curriculumId',target_curriculum_id,'programmeId',new_programme,'removedPicks',removed_count,'removedSubjectIds',to_jsonb(removed_subjects)));
  RETURN removed_count;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.db_change_student_programme(integer,integer) FROM PUBLIC;
