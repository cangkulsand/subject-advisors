-- Structural verification of migration 0018 (curriculum audit). Runner owns BEGIN READ ONLY / ROLLBACK.
WITH triggers(tbl, name) AS (VALUES
  ('public.subject','curriculum_subject_catalogue_audit'), ('public.curriculum_subject','curriculum_mapping_audit'),
  ('public.subject_prerequisite','curriculum_prerequisite_audit'), ('public.subject_semester_rule','curriculum_semester_rule_audit'),
  ('public.simulation_subject','curriculum_scenario_clear_audit')
), expected(test_name, ok) AS (
  SELECT 'curriculum audit trigger '||name||' is enabled and calls db_curriculum_audit',
    EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass(tbl) AND t.tgname=name AND t.tgenabled='O'
      AND t.tgfoid=to_regprocedure('public.db_curriculum_audit()'))
  FROM triggers
  UNION ALL
  SELECT 'db_curriculum_audit only writes under an actor context', EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.db_curriculum_audit()')
    AND prosrc LIKE '%app.access_actor%' AND prosrc LIKE '%app.access_reason%' AND prosrc LIKE '%before_row=after_row%')
  UNION ALL
  SELECT 'db_curriculum_audit has no PUBLIC execute', NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=to_regprocedure('public.db_curriculum_audit()') AND a.grantee=0 AND a.privilege_type='EXECUTE')
)
SELECT test_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM expected;
