-- Structural verification of migration 0010 (Department between faculty and programme). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('department table exists', to_regclass('public.department') IS NOT NULL),
  ('department has exactly the five expected columns', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='department')=5),
  ('department.faculty_id is required integer', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='department' AND column_name='faculty_id' AND data_type='integer' AND is_nullable='NO')),
  ('department.is_active is required boolean defaulting true', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='department' AND column_name='is_active' AND data_type='boolean' AND is_nullable='NO' AND column_default='true')),
  ('programme.department_id is nullable integer without default', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='programme' AND column_name='department_id' AND data_type='integer' AND is_nullable='YES' AND column_default IS NULL)),
  ('department code is unique', EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND k.conkey=ARRAY[a.attnum]::smallint[]
     WHERE k.contype='u' AND k.conrelid=to_regclass('public.department') AND a.attname='department_code')),
  ('department code and name reject blank values', (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('public.department') AND conname IN ('department_code_nonblank','department_name_nonblank') AND contype='c' AND convalidated)=2),
  ('department.faculty_id references faculty with RESTRICT', EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND k.conkey=ARRAY[a.attnum]::smallint[]
     WHERE k.contype='f' AND k.convalidated AND k.confdeltype='r' AND k.conrelid=to_regclass('public.department') AND a.attname='faculty_id' AND k.confrelid=to_regclass('public.faculty'))),
  ('programme.department_id references department with RESTRICT', EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND k.conkey=ARRAY[a.attnum]::smallint[]
     WHERE k.contype='f' AND k.convalidated AND k.confdeltype='r' AND k.conrelid=to_regclass('public.programme') AND a.attname='department_id' AND k.confrelid=to_regclass('public.department'))),
  ('department context, reference guard and audit triggers are enabled', (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.department') AND tgenabled='O' AND (
     (tgname='academic_department_context' AND tgfoid=to_regprocedure('public.db_academic_setup_context_trigger()')) OR
     (tgname='academic_department_reference_guard' AND tgfoid=to_regprocedure('public.db_academic_department_guard()')) OR
     (tgname='academic_department_audit' AND tgfoid=to_regprocedure('public.db_academic_setup_audit()'))))=3),
  ('department delete and truncate are rejected', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.department') AND tgname='no_academic_department_delete' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_immutable()'))),
  ('programme department guard is enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.programme') AND tgname='academic_programme_department_guard' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_academic_programme_department_guard()'))),
  ('programme audit trigger still enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.programme') AND tgname='academic_programme_audit' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_academic_setup_audit()'))),
  ('department has no PUBLIC privileges', NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid=to_regclass('public.department') AND a.grantee=0)),
  ('department guard functions have no PUBLIC execute', NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid IN (to_regprocedure('public.db_academic_department_guard()'),to_regprocedure('public.db_academic_programme_department_guard()')) AND a.grantee=0))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
