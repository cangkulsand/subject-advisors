-- Structural verification of migration 0013 (graduation confirmation timestamps). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('fees_cleared_confirmed_at is a nullable timestamptz without default', EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.student_profile') AND a.attname='fees_cleared_confirmed_at' AND NOT a.attisdropped AND a.atttypid='timestamptz'::regtype AND NOT a.attnotnull AND NOT a.atthasdef)),
  ('muet_confirmed_at is a nullable timestamptz without default', EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.student_profile') AND a.attname='muet_confirmed_at' AND NOT a.attisdropped AND a.atttypid='timestamptz'::regtype AND NOT a.attnotnull AND NOT a.atthasdef)),
  ('student_profile has no PUBLIC privileges', NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid=to_regclass('public.student_profile') AND a.grantee=0)),
  ('preserve_student_curriculum trigger is still enabled', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.student_profile') AND tgname='preserve_student_curriculum' AND tgenabled='O'))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
