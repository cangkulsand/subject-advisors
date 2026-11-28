-- S3-P004-041: curriculum changes are audited. Coordinators may now edit subjects in their scope, and every change
-- (admin or coordinator) carries a reason. Under an actor context (app.access_actor and app.access_reason, the 0012
-- convention), each insert, update or delete on subject, curriculum_subject, subject_prerequisite and subject_semester_rule
-- writes one academic_setup_audit_log row; clearing what-if scenario rows (simulation_subject) on subject removal is logged
-- too. Writes without a context (importers) stay unaudited. A no-op update writes nothing.
-- Additive: one function and five triggers. Rollback: DROP the five triggers below, then DROP FUNCTION public.db_curriculum_audit().
CREATE OR REPLACE FUNCTION public.db_curriculum_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE before_row jsonb; after_row jsonb; key_name text; entity_key integer;
BEGIN
  IF nullif(btrim(current_setting('app.access_actor',true)),'') IS NULL
     OR nullif(btrim(current_setting('app.access_reason',true)),'') IS NULL THEN
    RETURN NULL;
  END IF;
  before_row := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  after_row := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  IF TG_OP='UPDATE' AND before_row=after_row THEN RETURN NULL; END IF;
  key_name := CASE TG_TABLE_NAME
    WHEN 'subject' THEN 'subject_id'
    WHEN 'curriculum_subject' THEN 'curriculum_subject_id'
    WHEN 'subject_prerequisite' THEN 'prerequisite_id'
    WHEN 'subject_semester_rule' THEN 'rule_id'
    ELSE 'simulation_subject_id' END;
  entity_key := (coalesce(after_row,before_row)->>key_name)::integer;
  INSERT INTO public.academic_setup_audit_log(entity_type,entity_id,action,actor,reason,before_data,after_data)
  VALUES (TG_TABLE_NAME,entity_key,TG_OP,btrim(current_setting('app.access_actor',true)),
          btrim(current_setting('app.access_reason',true)),before_row,after_row);
  RETURN NULL;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.db_curriculum_audit() FROM PUBLIC;

CREATE TRIGGER curriculum_subject_catalogue_audit AFTER INSERT OR UPDATE OR DELETE ON public.subject
  FOR EACH ROW EXECUTE FUNCTION public.db_curriculum_audit();
CREATE TRIGGER curriculum_mapping_audit AFTER INSERT OR UPDATE OR DELETE ON public.curriculum_subject
  FOR EACH ROW EXECUTE FUNCTION public.db_curriculum_audit();
CREATE TRIGGER curriculum_prerequisite_audit AFTER INSERT OR UPDATE OR DELETE ON public.subject_prerequisite
  FOR EACH ROW EXECUTE FUNCTION public.db_curriculum_audit();
CREATE TRIGGER curriculum_semester_rule_audit AFTER INSERT OR UPDATE OR DELETE ON public.subject_semester_rule
  FOR EACH ROW EXECUTE FUNCTION public.db_curriculum_audit();
CREATE TRIGGER curriculum_scenario_clear_audit AFTER DELETE ON public.simulation_subject
  FOR EACH ROW EXECUTE FUNCTION public.db_curriculum_audit();
