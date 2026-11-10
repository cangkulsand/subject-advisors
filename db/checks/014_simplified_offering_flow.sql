-- Structural verification of migration 0009 (simplified UC20 offering flow). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('offering_decision table exists', to_regclass('public.offering_decision') IS NOT NULL),
  ('offering_decision_audit table exists', to_regclass('public.offering_decision_audit') IS NOT NULL),
  ('offering_pick_withdrawal table exists', to_regclass('public.offering_pick_withdrawal') IS NOT NULL),
  ('academic_semester.selection_opens_at is nullable timestamptz', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_semester' AND column_name='selection_opens_at' AND data_type='timestamp with time zone' AND is_nullable='YES')),
  ('academic_semester.selection_closes_at is nullable timestamptz', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_semester' AND column_name='selection_closes_at' AND data_type='timestamp with time zone' AND is_nullable='YES')),
  ('student_profile.learning_centre_id is nullable integer', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_profile' AND column_name='learning_centre_id' AND data_type='integer' AND is_nullable='YES')),
  ('academic_semester_selection_window_rule is a validated check', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.academic_semester') AND conname='academic_semester_selection_window_rule' AND contype='c' AND convalidated)),
  ('offering_decision scope/subject is unique', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.offering_decision') AND conname='offering_decision_scope_subject_unique' AND contype='u' AND convalidated)),
  ('decision audit rejects update and delete', (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.offering_decision_audit') AND tgname IN ('immutable_offering_decision_audit','immutable_offering_decision_audit_truncate') AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_immutable()'))=2),
  ('pick withdrawal rejects update and delete', (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.offering_pick_withdrawal') AND tgname IN ('immutable_offering_pick_withdrawal','immutable_offering_pick_withdrawal_truncate') AND tgenabled='O' AND tgfoid=to_regprocedure('public.db_immutable()'))=2),
  ('new tables have no PUBLIC privileges', NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid IN (to_regclass('public.offering_decision'),to_regclass('public.offering_decision_audit'),to_regclass('public.offering_pick_withdrawal')) AND a.grantee=0)),
  ('new foreign keys are ON DELETE RESTRICT', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confdeltype<>'r'
     AND conrelid IN (to_regclass('public.offering_decision'),to_regclass('public.offering_decision_audit'),to_regclass('public.offering_pick_withdrawal'))))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
