-- Structural verification of migration 0017 (coordinator faculty scope). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('coordinator_assignment.programme_id is nullable (NULL = whole faculty)', EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.coordinator_assignment')
     AND a.attname='programme_id' AND NOT a.attisdropped AND NOT a.attnotnull)),
  ('one live faculty row per account, faculty and centre', EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.coordinator_assignment_one_live_faculty_idx')
     AND i.indrelid='public.coordinator_assignment'::regclass AND i.indisunique AND i.indisvalid AND i.indnatts=3
     AND pg_get_expr(i.indpred,i.indrelid) ILIKE '%programme_id IS NULL%' AND pg_get_expr(i.indpred,i.indrelid) ILIKE '%ended_at IS NULL%')),
  ('the programme one-live-row index is still in place', to_regclass('public.coordinator_assignment_one_live_scope_idx') IS NOT NULL),
  ('the assignment guard skips programme checks for faculty rows', EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.db_academic_setup_assignment_guard()')
     AND prosrc LIKE '%NEW.programme_id IS NOT NULL%' AND prosrc LIKE '%PROGRAMME_FACULTY_MISMATCH%' AND prosrc LIKE '%COORDINATOR_ROLE_REQUIRED%')),
  ('the programme reference guard only looks at programme rows', EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.db_academic_setup_reference_guard()')
     AND prosrc LIKE '%programme_id=NEW.programme_id%')),
  ('assignment rows still cannot be deleted', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.coordinator_assignment') AND tgname='no_academic_assignment_delete' AND tgenabled='O'))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
