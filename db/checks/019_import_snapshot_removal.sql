-- Structural verification of migration 0014 (snapshot removal). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH expected(test_name, ok) AS (VALUES
  ('academic_import_batch_removal exists with import_batch_id as primary key', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.academic_import_batch_removal') AND contype='p')),
  ('removal references academic_import_batch with ON DELETE RESTRICT', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.academic_import_batch_removal') AND contype='f' AND confrelid=to_regclass('public.academic_import_batch') AND confdeltype='r')),
  ('removed_by and removed_at are required', (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.academic_import_batch_removal') AND attname IN ('removed_by','removed_at') AND attnotnull AND NOT attisdropped)=2),
  ('only accepted snapshots can be removed (insert guard enabled)', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.academic_import_batch_removal') AND tgname='import_batch_removal_guard' AND tgenabled='O')),
  ('removal rows are immutable', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.academic_import_batch_removal') AND tgname='immutable_import_batch_removal' AND tgenabled='O')
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.academic_import_batch_removal') AND tgname='no_import_batch_removal_truncate' AND tgenabled='O')),
  ('snapshot freeze triggers are unchanged', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.academic_import_batch') AND tgname='import_batch_lifecycle' AND tgenabled='O')),
  ('academic_import_batch_removal has no PUBLIC privileges', NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid=to_regclass('public.academic_import_batch_removal') AND a.grantee=0))
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
