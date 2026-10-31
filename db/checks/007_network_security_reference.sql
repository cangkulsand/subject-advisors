-- Structural assertions only. Runner owns BEGIN READ ONLY / ROLLBACK.
DO $verify$
DECLARE
  display_type text;
  details_type text;
  display_not_null boolean;
  details_not_null boolean;
  display_default text;
  details_default text;
  imported_count integer;
  constraint_count integer;
BEGIN
  SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
    INTO display_type,display_not_null,display_default
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.curriculum_subject'::regclass AND a.attname='display_name' AND NOT a.attisdropped;
  IF NOT FOUND OR display_type<>'character varying(255)' OR display_not_null OR display_default IS NOT NULL THEN
    RAISE EXCEPTION 'curriculum_subject.display_name must be nullable varchar(255) with no default';
  END IF;

  SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
    INTO details_type,details_not_null,details_default
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.curriculum_subject'::regclass AND a.attname='prerequisite_details' AND NOT a.attisdropped;
  IF NOT FOUND OR details_type<>'jsonb' OR details_not_null OR details_default IS NOT NULL THEN
    RAISE EXCEPTION 'curriculum_subject.prerequisite_details must be nullable jsonb with no default';
  END IF;

  SELECT count(*) INTO constraint_count FROM pg_constraint
  WHERE conrelid='public.curriculum_subject'::regclass AND convalidated
    AND conname IN ('curriculum_subject_display_name_nonblank','curriculum_subject_prerequisite_details_shape')
    AND contype='c';
  IF constraint_count<>2 THEN RAISE EXCEPTION 'Missing validated curriculum_subject metadata checks'; END IF;

  IF to_regclass('migration_meta.reference_data_imports') IS NULL THEN
    RAISE EXCEPTION 'Missing private reference import receipt table';
  END IF;
  SELECT count(*) INTO imported_count FROM information_schema.columns
  WHERE table_schema='migration_meta' AND table_name='reference_data_imports';
  IF imported_count<>6 THEN RAISE EXCEPTION 'Unexpected reference_data_imports column inventory'; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='migration_meta' AND table_name='reference_data_imports' AND column_name='dataset_id' AND data_type='text' AND is_nullable='NO' AND column_default IS NULL)
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='migration_meta' AND table_name='reference_data_imports' AND column_name='curriculum_id' AND data_type='integer' AND is_nullable='NO' AND column_default IS NULL)
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='migration_meta' AND table_name='reference_data_imports' AND column_name='manifest_sha256' AND data_type='character' AND character_maximum_length=64 AND is_nullable='NO' AND column_default IS NULL)
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='migration_meta' AND table_name='reference_data_imports' AND column_name='manifest' AND data_type='jsonb' AND is_nullable='NO' AND column_default IS NULL)
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='migration_meta' AND table_name='reference_data_imports' AND column_name='receipt' AND data_type='jsonb' AND is_nullable='NO' AND column_default IS NULL)
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='migration_meta' AND table_name='reference_data_imports' AND column_name='imported_at' AND data_type='timestamp with time zone' AND is_nullable='NO' AND column_default LIKE 'now()%') THEN
    RAISE EXCEPTION 'reference_data_imports column contract mismatch';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='migration_meta.reference_data_imports'::regclass AND contype='p' AND convalidated AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='migration_meta.reference_data_imports'::regclass AND attname='dataset_id')]::smallint[])
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='migration_meta.reference_data_imports'::regclass AND contype='u' AND convalidated AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='migration_meta.reference_data_imports'::regclass AND attname='curriculum_id')]::smallint[])
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='migration_meta.reference_data_imports'::regclass AND contype='f' AND confrelid='public.curriculum'::regclass AND confdeltype='r') THEN
    RAISE EXCEPTION 'reference_data_imports key/foreign-key contract mismatch';
  END IF;
  SELECT count(*) INTO constraint_count FROM pg_constraint WHERE conrelid='migration_meta.reference_data_imports'::regclass AND contype='c' AND convalidated
    AND conname IN ('reference_data_imports_dataset_id_nonblank','reference_data_imports_manifest_sha256_format','reference_data_imports_manifest_object','reference_data_imports_receipt_object');
  IF constraint_count<>4 THEN RAISE EXCEPTION 'Missing validated reference_data_imports checks'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl
    WHERE n.nspname='migration_meta' AND acl.grantee=0 AND acl.privilege_type IN ('USAGE','CREATE')
  ) THEN RAISE EXCEPTION 'PUBLIC has migration_meta schema privileges'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
    WHERE n.nspname='migration_meta' AND c.relname='reference_data_imports' AND acl.grantee=0
      AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) THEN RAISE EXCEPTION 'PUBLIC has reference_data_imports table privileges'; END IF;
END $verify$;
