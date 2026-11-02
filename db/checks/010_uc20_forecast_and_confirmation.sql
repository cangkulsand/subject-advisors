-- Structural verification of migration 0007 (UC20 forecast and offering confirmation). Runner owns BEGIN READ ONLY / ROLLBACK.
DO $check$
DECLARE
  tbl text;
  cols int;
  trg record;
BEGIN
  -- New tables, column counts and no PUBLIC privileges.
  FOR tbl, cols IN SELECT * FROM (VALUES
    ('forecast_adjustment_audit',9),('offering_confirmation',11),('confirmed_offering',9),('confirmed_offering_audit',9)) v(a,b) LOOP
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl) <> cols THEN
      RAISE EXCEPTION 'Unexpected column count for %', tbl;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
               WHERE c.oid=('public.'||tbl)::regclass AND a.grantee=0) THEN
      RAISE EXCEPTION 'PUBLIC has privileges on %', tbl;
    END IF;
  END LOOP;

  -- Added nullable columns.
  IF (SELECT count(*) FROM pg_attribute a WHERE a.attnum>0 AND NOT a.attisdropped AND NOT a.attnotnull AND
        (a.attrelid,a.attname) IN (
          ('public.academic_import_batch'::regclass,'programme_id'),('public.academic_import_batch'::regclass,'target_semester_id'),
          ('public.academic_import_batch'::regclass,'source_fingerprint'),('public.academic_import_batch'::regclass,'validation_summary'),
          ('public.academic_import_batch'::regclass,'accepted_at'),('public.academic_import_batch'::regclass,'accepted_by'),
          ('public.imported_student'::regclass,'history_completeness'),('public.imported_student'::regclass,'student_name'),('public.imported_subject_record'::regclass,'recognized_credits'),
          ('public.forecast_run'::regclass,'programme_id'),('public.forecast_run'::regclass,'rule_snapshot'),
          ('public.forecast_run'::regclass,'engine_version'),('public.forecast_run'::regclass,'original_recommendations'),
          ('public.forecast_subject_demand'::regclass,'uncertain_count'),('public.forecast_subject_demand'::regclass,'uncertainty_reasons'),
          ('public.forecast_subject_demand'::regclass,'configuration_status'))) <> 16 THEN
    RAISE EXCEPTION 'Missing 0007 nullable columns';
  END IF;

  -- Unique namespaces.
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.forecast_run_programme_scope_version_key') AND indisvalid AND indisunique AND indpred IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.forecast_run_legacy_centre_version_key') AND indisvalid AND indisunique AND indpred IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.forecast_adjustment_audit_one_finalize_idx') AND indisvalid AND indisunique AND indpred IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.forecast_adjustment_audit_one_start_review_idx') AND indisvalid AND indisunique AND indpred IS NOT NULL)
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.forecast_run'::regclass AND conname='forecast_run_rule_1') THEN
    RAISE EXCEPTION 'Forecast run namespace indexes are wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.offering_confirmation'::regclass AND conname='offering_confirmation_scope_key' AND contype='u' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.confirmed_offering'::regclass AND conname='confirmed_offering_subject_key' AND contype='u' AND convalidated) THEN
    RAISE EXCEPTION 'Offering unique keys are missing';
  END IF;

  -- Foreign keys are RESTRICT; no planned Package A/B object is created.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confdeltype<>'r'
        AND conrelid IN ('public.forecast_adjustment_audit'::regclass,'public.offering_confirmation'::regclass,'public.confirmed_offering'::regclass,'public.confirmed_offering_audit'::regclass)) THEN
    RAISE EXCEPTION '0007 foreign keys must be ON DELETE RESTRICT';
  END IF;
  -- Package A (0008) and Package B (0009) objects may exist only once their own migration is recorded.
  IF (NOT EXISTS (SELECT 1 FROM migration_meta.schema_migrations WHERE version='0008')
        AND (to_regclass('public.coordinator_assignment') IS NOT NULL OR to_regclass('public.faculty') IS NOT NULL
          OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_semester' AND column_name='is_current')))
     OR (NOT EXISTS (SELECT 1 FROM migration_meta.schema_migrations WHERE version='0009')
        AND (to_regclass('public.student_offering_pick') IS NOT NULL
          OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_profile' AND column_name='learning_centre_id'))) THEN
    RAISE EXCEPTION 'Package A/B objects must not be created by 0007';
  END IF;

  -- Triggers present and enabled.
  FOR trg IN SELECT * FROM (VALUES
    ('academic_import_batch','import_batch_lifecycle'),('imported_student','imported_student_freeze'),('imported_subject_record','imported_record_freeze'),
    ('forecast_run','forecast_run_scope'),('forecast_adjustment_audit','forecast_adjustment_guard'),
    ('forecast_adjustment_audit','immutable_forecast_adjustment_audit'),('forecast_adjustment_audit','immutable_forecast_adjustment_audit_truncate'),
    ('confirmed_offering_audit','offering_audit_guard'),('confirmed_offering_audit','immutable_confirmed_offering_audit'),
    ('confirmed_offering_audit','immutable_confirmed_offering_audit_truncate'),
    ('offering_confirmation','offering_confirmation_guard'),('offering_confirmation','offering_confirmation_audit'),
    ('offering_confirmation','no_offering_confirmation_delete'),('offering_confirmation','no_offering_confirmation_truncate'),
    ('confirmed_offering','confirmed_offering_guard'),('confirmed_offering','confirmed_offering_audit'),
    ('confirmed_offering','no_confirmed_offering_delete'),('confirmed_offering','no_confirmed_offering_truncate')) v(t,n) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||trg.t)::regclass AND tgname=trg.n AND tgenabled='O') THEN
      RAISE EXCEPTION 'Missing/disabled trigger % on %', trg.n, trg.t;
    END IF;
  END LOOP;

  -- Functions are not executable by PUBLIC.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='public' AND a.grantee=0 AND p.proname IN ('db_import_batch_lifecycle','db_open_import_batch','db_import_rows_freeze',
      'db_forecast_run_scope','db_forecast_adjustment_guard','db_offering_context','db_offering_audit_guard','db_offering_confirmation_guard',
      'db_offering_confirmation_audit','db_confirmed_offering_guard','db_confirmed_offering_audit')
  ) THEN RAISE EXCEPTION 'PUBLIC can execute UC20 integrity functions'; END IF;
END $check$;
SELECT 'PASS' AS uc20_forecast_and_confirmation_verification;
