-- Structural verification of migration 0011 (admin-controlled student programme change). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('programme change context table exists', to_regclass('migration_meta.programme_change_context') IS NOT NULL),
  ('programme change context has no PUBLIC privileges', NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid=to_regclass('migration_meta.programme_change_context') AND a.grantee=0)),
  ('programme change context is keyed by backend pid and transaction', EXISTS (SELECT 1 FROM pg_constraint k WHERE k.contype='p' AND k.conrelid=to_regclass('migration_meta.programme_change_context') AND cardinality(k.conkey)=2)),
  ('db_change_student_programme exists and returns integer', EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.db_change_student_programme(integer,integer)') AND p.prorettype='integer'::regtype)),
  ('db_change_student_programme has no PUBLIC execute', NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=to_regprocedure('public.db_change_student_programme(integer,integer)') AND a.grantee=0)),
  ('preserve membership guard honours the programme change context', (SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.db_preserve_membership()')) LIKE '%programme_change_context%'),
  ('student curriculum preservation trigger is still enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.student_profile') AND tgname='preserve_student_curriculum' AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_preserve_membership()'))),
  ('academic setup audit log stays append-only', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.academic_setup_audit_log') AND tgname='immutable_academic_audit_row' AND tgenabled='O'))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
