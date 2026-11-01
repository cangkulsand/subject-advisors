-- Forward engineering extension for P004 multi-role access. Baseline 26 tables
-- remain verified independently by 001; this checks only the registered add-on.
DO $check$
DECLARE membership oid := 'public.user_role_assignment'::regclass;
DECLARE audit_log oid := 'public.user_role_audit_log'::regclass;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')) <> 28 THEN
    RAISE EXCEPTION 'Expected 26 baseline tables and two registered multi-role tables';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='user_role_assignment') <> 8 THEN
    RAISE EXCEPTION 'Unexpected user_role_assignment columns';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='user_role_audit_log') <> 11 THEN
    RAISE EXCEPTION 'Unexpected user_role_audit_log columns';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=membership AND conname='user_role_assignment_role_rule' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=membership AND conname='user_role_assignment_policy_rule' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=membership AND conname='user_role_assignment_owner_exception_rule' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=membership AND conname='user_role_assignment_protected_admin_rule' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=membership AND contype='p' AND convalidated) THEN
    RAISE EXCEPTION 'Missing or invalid membership constraints';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.user_role_assignment_one_protected_owner_idx') AND indisvalid AND indisunique)
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.user_role_audit_target_time_idx') AND indisvalid) THEN
    RAISE EXCEPTION 'Missing/invalid role indexes';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid IN (membership,audit_log) AND contype='f'
      AND confrelid='public.user_access_assignment'::regclass AND convalidated) <> 2 THEN
    RAISE EXCEPTION 'Role extension account foreign keys are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=membership AND tgname='user_role_audit_guard' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=membership AND tgname='no_user_role_truncate' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=audit_log AND tgname='immutable_user_role_audit' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=audit_log AND tgname='immutable_user_role_audit_truncate' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_access_assignment'::regclass AND tgname='legacy_access_compatibility' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_access_assignment'::regclass AND tgname='legacy_access_seed_student' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_access_assignment'::regclass AND tgname='no_user_access_truncate_multi_role' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Missing/disabled multi-role integrity triggers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE n.nspname='public' AND c.oid IN (membership,audit_log) AND a.grantee=0
  ) THEN RAISE EXCEPTION 'PUBLIC has multi-role table privileges'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='public' AND p.proname IN ('db_user_role_audit_and_last_admin','db_legacy_access_compatibility') AND a.grantee=0
  ) THEN RAISE EXCEPTION 'PUBLIC can execute multi-role integrity functions'; END IF;
END $check$;
