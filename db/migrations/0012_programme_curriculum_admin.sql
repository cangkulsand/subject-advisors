-- S2-P001-005 (UC25 / FR-B9, built by P004): admin programme and curriculum maintenance. Sets NULL curriculum
-- status to ACTIVE, audits every programme/curriculum change made under an admin actor context, and guards
-- curriculum creation under inactive programmes. Importer writes without actor context stay unaudited and unguarded
-- (except the pre-existing programme faculty/department rule). No table or column is added.
UPDATE public.curriculum SET status='ACTIVE' WHERE status IS NULL;

CREATE OR REPLACE FUNCTION public.db_academic_setup_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE key_name text; before_row jsonb; after_row jsonb; entity_key integer; action_name text;
  has_context boolean := nullif(btrim(current_setting('app.access_actor',true)),'') IS NOT NULL
    AND nullif(btrim(current_setting('app.access_reason',true)),'') IS NOT NULL;
BEGIN
  IF TG_TABLE_NAME='programme' THEN
    IF (TG_OP='INSERT' AND (NEW.faculty_id IS NOT NULL OR NEW.department_id IS NOT NULL))
       OR (TG_OP='UPDATE' AND (NEW.faculty_id IS DISTINCT FROM OLD.faculty_id OR NEW.department_id IS DISTINCT FROM OLD.department_id)) THEN
      NULL; -- faculty/department changes always require context (checked below)
    ELSE
      IF NOT has_context THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='curriculum' AND NOT has_context THEN RETURN NEW; END IF;
  PERFORM public.db_academic_setup_context();
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='academic_semester' THEN
    IF TG_OP='UPDATE' THEN
      IF NEW.is_current IS DISTINCT FROM OLD.is_current AND EXISTS (
        SELECT 1 FROM migration_meta.academic_switch_context c
        WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  key_name := CASE TG_TABLE_NAME
    WHEN 'learning_centre' THEN 'learning_centre_id'
    WHEN 'faculty' THEN 'faculty_id'
    WHEN 'department' THEN 'department_id'
    WHEN 'programme' THEN 'programme_id'
    WHEN 'curriculum' THEN 'curriculum_id'
    WHEN 'academic_semester' THEN 'semester_id'
    ELSE 'assignment_id' END;
  before_row := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  after_row := to_jsonb(NEW);
  entity_key := (after_row->>key_name)::integer;
  action_name := CASE
    WHEN TG_TABLE_NAME='coordinator_assignment' AND TG_OP='UPDATE' THEN 'END_ASSIGNMENT'
    WHEN TG_TABLE_NAME='academic_semester' AND TG_OP='UPDATE' AND (before_row->>'is_current') IS DISTINCT FROM (after_row->>'is_current') THEN 'SET_CURRENT'
    ELSE TG_OP END;
  INSERT INTO public.academic_setup_audit_log(entity_type,entity_id,action,actor,reason,before_data,after_data)
  VALUES (TG_TABLE_NAME,entity_key,action_name,btrim(current_setting('app.access_actor',true)),
          btrim(current_setting('app.access_reason',true)),before_row,after_row);
  RETURN NEW;
END $fn$;

DROP TRIGGER academic_programme_audit ON public.programme;
CREATE TRIGGER academic_programme_audit AFTER INSERT OR UPDATE ON public.programme
  FOR EACH ROW EXECUTE FUNCTION public.db_academic_setup_audit();
CREATE TRIGGER academic_curriculum_audit AFTER INSERT OR UPDATE ON public.curriculum
  FOR EACH ROW EXECUTE FUNCTION public.db_academic_setup_audit();

-- Under an actor context a curriculum may only be created in (or moved to) an existing active programme.
CREATE FUNCTION public.db_academic_curriculum_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE programme_status varchar(20);
BEGIN
  IF nullif(btrim(current_setting('app.access_actor',true)),'') IS NULL
     OR nullif(btrim(current_setting('app.access_reason',true)),'') IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.programme_id IS NOT DISTINCT FROM OLD.programme_id THEN RETURN NEW; END IF;
  END IF;
  SELECT status INTO programme_status FROM public.programme WHERE programme_id=NEW.programme_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:NOT_FOUND' USING ERRCODE='23514';
  END IF;
  IF coalesce(upper(programme_status),'ACTIVE')<>'ACTIVE' THEN
    RAISE EXCEPTION 'ACADEMIC_SETUP:REFERENCE_INACTIVE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER academic_curriculum_guard BEFORE INSERT OR UPDATE OF programme_id ON public.curriculum
  FOR EACH ROW EXECUTE FUNCTION public.db_academic_curriculum_guard();

REVOKE EXECUTE ON FUNCTION public.db_academic_curriculum_guard() FROM PUBLIC;
