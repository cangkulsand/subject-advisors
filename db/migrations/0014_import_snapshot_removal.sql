-- S3-P004-022: a coordinator can remove (hide) a student data snapshot. Snapshots stay frozen: this migration does not touch
-- academic_import_batch, its rows or their freeze triggers. A removal is one immutable row recording who removed which snapshot and when;
-- the API leaves removed snapshots out of the list, the detail view, re-use by fingerprint and new forecasts.
-- Rollback: DROP TABLE public.academic_import_batch_removal;
CREATE TABLE public.academic_import_batch_removal (
  import_batch_id integer PRIMARY KEY REFERENCES public.academic_import_batch(import_batch_id) ON DELETE RESTRICT,
  removed_by varchar(255) NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_import_batch_removal_by_rule CHECK (length(btrim(removed_by)) > 0)
);
-- Only accepted (frozen) snapshots can be removed; uploads still being validated are not listed anywhere.
CREATE FUNCTION public.db_import_batch_removal_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.academic_import_batch WHERE import_batch_id = NEW.import_batch_id AND import_status = 'ACCEPTED') THEN
    RAISE EXCEPTION 'Only accepted import snapshots can be removed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER import_batch_removal_guard BEFORE INSERT ON public.academic_import_batch_removal
FOR EACH ROW EXECUTE FUNCTION public.db_import_batch_removal_guard();
CREATE TRIGGER immutable_import_batch_removal BEFORE UPDATE OR DELETE ON public.academic_import_batch_removal
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER no_import_batch_removal_truncate BEFORE TRUNCATE ON public.academic_import_batch_removal
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();
REVOKE ALL ON public.academic_import_batch_removal FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_import_batch_removal_guard() FROM PUBLIC;
