-- Forward-only preservation of the recognized P004-only UUID schema.
-- Runner allows this path only with explicit legacy-adoption approval.
DO $legacy$
DECLARE actual jsonb; expected jsonb := '{"access_assignment_id":"uuid","clerk_user_id":"text","app_role":"text","access_status":"text","created_at":"timestamp with time zone","updated_at":"timestamp with time zone"}';
BEGIN
 IF to_regclass('public.user_access_assignment') IS NULL THEN RETURN; END IF;
 IF to_regclass('migration_meta.legacy_user_access_assignment') IS NOT NULL THEN
  RAISE EXCEPTION 'Ambiguous legacy history; manual reconciliation required';
 END IF;
 SELECT jsonb_object_agg(column_name,data_type) INTO actual FROM information_schema.columns
 WHERE table_schema='public' AND table_name='user_access_assignment';
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unrecognized legacy access schema'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.user_access_assignment'::regclass) THEN
  RAISE EXCEPTION 'Legacy access references need an approved reconciliation';
 END IF;
 ALTER TABLE public.user_access_assignment SET SCHEMA migration_meta;
 ALTER TABLE migration_meta.user_access_assignment RENAME TO legacy_user_access_assignment;
 REVOKE ALL ON migration_meta.legacy_user_access_assignment FROM PUBLIC;
END $legacy$;
