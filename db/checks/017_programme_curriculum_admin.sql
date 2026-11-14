-- Structural verification of migration 0012 (admin programme and curriculum maintenance). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('programme audit trigger exists and is enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.programme') AND tgname='academic_programme_audit' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_academic_setup_audit()'))),
  ('curriculum audit trigger exists and is enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.curriculum') AND tgname='academic_curriculum_audit' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_academic_setup_audit()'))),
  ('curriculum programme guard trigger exists and is enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.curriculum') AND tgname='academic_curriculum_guard' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_academic_curriculum_guard()'))),
  ('curriculum guard has no PUBLIC execute', NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=to_regprocedure('public.db_academic_curriculum_guard()') AND a.grantee=0)),
  ('academic setup audit function keys curriculum rows by curriculum_id', (SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.db_academic_setup_audit()')) LIKE '%''curriculum_id''%'),
  ('no curriculum has a NULL status', NOT EXISTS (SELECT 1 FROM public.curriculum WHERE status IS NULL))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
