-- Structural verification of migration 0016 (student intake year). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('intake_year is a nullable smallint without default', EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.student_profile') AND a.attname='intake_year' AND NOT a.attisdropped AND a.atttypid='int2'::regtype AND NOT a.attnotnull AND NOT a.atthasdef)),
  ('intake_year is limited to 1990..2200', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.student_profile') AND conname='student_profile_intake_year_range' AND contype='c' AND convalidated)),
  ('student_profile has no PUBLIC privileges', NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid=to_regclass('public.student_profile') AND a.grantee=0)),
  ('preserve_student_curriculum trigger is still enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.student_profile') AND tgname='preserve_student_curriculum' AND tgenabled='O'))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
