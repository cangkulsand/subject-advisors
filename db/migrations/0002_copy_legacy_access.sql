-- Integer SRS IDs replace UUID IDs only in the new canonical domain table.
-- Original UUID rows and old->new key mappings are retained in private technical metadata.
CREATE TABLE migration_meta.legacy_access_id_map (
 legacy_access_assignment_id uuid PRIMARY KEY,
 canonical_access_assignment_id integer NOT NULL UNIQUE REFERENCES public.user_access_assignment(access_assignment_id)
);
REVOKE ALL ON migration_meta.legacy_access_id_map FROM PUBLIC;
DO $copy$
DECLARE original_count bigint; copied_count bigint;
BEGIN
 IF to_regclass('migration_meta.legacy_user_access_assignment') IS NULL THEN RETURN; END IF;
 INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status,created_at,updated_at)
 SELECT clerk_user_id,app_role,access_status,created_at,updated_at
 FROM migration_meta.legacy_user_access_assignment ORDER BY created_at,clerk_user_id;
 INSERT INTO migration_meta.legacy_access_id_map
 SELECT old.access_assignment_id,current.access_assignment_id
 FROM migration_meta.legacy_user_access_assignment old
 JOIN public.user_access_assignment current USING(clerk_user_id);
 SELECT count(*) INTO original_count FROM migration_meta.legacy_user_access_assignment;
 SELECT count(*) INTO copied_count FROM migration_meta.legacy_access_id_map;
 IF original_count<>copied_count OR EXISTS(
  SELECT clerk_user_id,app_role::text,access_status::text,created_at,updated_at FROM migration_meta.legacy_user_access_assignment
  EXCEPT SELECT clerk_user_id,app_role::text,access_status::text,created_at,updated_at FROM public.user_access_assignment
 ) THEN RAISE EXCEPTION 'Legacy access preservation verification failed'; END IF;
END $copy$;
