-- S3-P004-040: a coordinator may cover a whole faculty at a learning centre. A row with programme_id NULL covers every
-- active programme of faculty_id (read live, so programmes added to the faculty later are covered). Programme rows are
-- unchanged. Additive: the column becomes nullable, faculty rows get their own one-live-row index, and the insert guard
-- skips the programme checks for faculty rows. The programme reference guard (0008) only looks at programme rows, so a
-- programme covered only by faculty rows may still move to another faculty; its coverage follows it.
-- Rollback: end every faculty row (deletes are blocked), then
--   DROP INDEX public.coordinator_assignment_one_live_faculty_idx;
--   restore the 0008 body of public.db_academic_setup_assignment_guard();
--   ALTER TABLE public.coordinator_assignment ALTER COLUMN programme_id SET NOT NULL;  -- only once no NULL rows remain
ALTER TABLE public.coordinator_assignment ALTER COLUMN programme_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coordinator_assignment_one_live_faculty_idx
  ON public.coordinator_assignment(access_assignment_id, faculty_id, learning_centre_id) WHERE programme_id IS NULL AND ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.db_academic_setup_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE programme_faculty integer; programme_status varchar(20);
BEGIN
  PERFORM public.db_academic_setup_context();
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'ended_at') IS DISTINCT FROM (to_jsonb(OLD)-'ended_at') OR
       OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
      RAISE EXCEPTION 'ACADEMIC_SETUP:ASSIGNMENT_ENDED' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:INVALID_REQUEST' USING ERRCODE='23514';
  END IF;
  -- SHARE blocks non-key status/reference updates and membership deletion until commit.
  PERFORM 1 FROM public.user_access_assignment a
    WHERE a.access_assignment_id=NEW.access_assignment_id AND a.access_status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:ACCOUNT_INACTIVE' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.user_role_assignment r
    WHERE r.access_assignment_id=NEW.access_assignment_id AND r.app_role='COORDINATOR' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:COORDINATOR_ROLE_REQUIRED' USING ERRCODE='23514';
  END IF;
  -- A faculty row (programme_id NULL) has no programme to check; a programme row must be active and in the faculty.
  IF NEW.programme_id IS NOT NULL THEN
    SELECT faculty_id,status INTO programme_faculty,programme_status
      FROM public.programme WHERE programme_id=NEW.programme_id FOR SHARE;
    IF NOT FOUND OR coalesce(upper(programme_status),'ACTIVE')<>'ACTIVE' THEN
      RAISE EXCEPTION 'ACADEMIC_SETUP:REFERENCE_INACTIVE' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM 1 FROM public.faculty WHERE faculty_id=NEW.faculty_id AND is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:REFERENCE_INACTIVE' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.learning_centre WHERE learning_centre_id=NEW.learning_centre_id AND is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:REFERENCE_INACTIVE' USING ERRCODE='23514';
  END IF;
  IF NEW.programme_id IS NOT NULL AND programme_faculty IS DISTINCT FROM NEW.faculty_id THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:PROGRAMME_FACULTY_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.db_academic_setup_assignment_guard() FROM PUBLIC;
