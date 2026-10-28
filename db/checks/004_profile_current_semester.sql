-- Forward extension registered by migration 0003. Runner owns READ ONLY / ROLLBACK.
DO $extension$
DECLARE field record; relation_oid oid := 'public.student_profile'::regclass;
BEGIN
  SELECT a.atttypid, a.attnotnull, a.attidentity, a.atthasdef
  INTO field
  FROM pg_attribute a
  WHERE a.attrelid = relation_oid AND a.attname = 'current_semester_id' AND NOT a.attisdropped;
  IF NOT FOUND OR field.atttypid <> 'integer'::regtype OR field.attnotnull OR field.attidentity <> '' OR field.atthasdef THEN
    RAISE EXCEPTION '0003 extension current_semester_id must be nullable integer without identity/default';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='student_profile') <> 10 THEN
    RAISE EXCEPTION 'student_profile contains an unregistered column extension';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid=relation_oid AND contype='f') <> 2 THEN
    RAISE EXCEPTION 'student_profile FK count differs from baseline plus registered extension';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint k
    WHERE k.conrelid=relation_oid AND k.conname='student_profile_current_semester_id_fkey'
      AND k.contype='f' AND k.convalidated AND k.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=relation_oid AND a.attname='current_semester_id'
      )]::smallint[]
      AND k.confrelid='public.academic_semester'::regclass
      AND k.confkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a WHERE a.attrelid='public.academic_semester'::regclass AND a.attname='semester_id'
      )]::smallint[] AND k.confdeltype='r'
  ) THEN RAISE EXCEPTION '0003 profile semester FK target or delete rule mismatch'; END IF;
END $extension$;
