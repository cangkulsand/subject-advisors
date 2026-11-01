-- Structural verification of migration 0006 (admin user management). Runner owns BEGIN READ ONLY / ROLLBACK.
DO $check$
DECLARE invitation oid := 'public.admin_user_invitation'::regclass;
DECLARE accounts oid := 'public.user_access_assignment'::regclass;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_user_invitation') <> 13 THEN
    RAISE EXCEPTION 'Unexpected admin_user_invitation columns';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=invitation AND attname='invitation_id' AND atttypid='uuid'::regtype AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=invitation AND attname='roles' AND atttypid='character varying[]'::regtype AND attnotnull AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=invitation AND attname='clerk_invitation_id' AND NOT attnotnull AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=invitation AND attname='accepted_access_assignment_id' AND NOT attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'admin_user_invitation column shapes are wrong';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid=invitation AND contype='c' AND convalidated
        AND conname IN ('admin_user_invitation_email_rule','admin_user_invitation_roles_rule','admin_user_invitation_status_rule',
          'admin_user_invitation_clerk_id_rule','admin_user_invitation_inviter_rule','admin_user_invitation_reason_rule',
          'admin_user_invitation_expiry_rule','admin_user_invitation_revoker_rule','admin_user_invitation_status_columns_rule')) <> 9
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=invitation AND contype='p' AND convalidated) THEN
    RAISE EXCEPTION 'Missing or invalid invitation constraints';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=invitation AND contype='f' AND convalidated
        AND confrelid=accounts AND confdeltype='r') THEN
    RAISE EXCEPTION 'Invitation accepted-account foreign key must be ON DELETE RESTRICT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.admin_user_invitation_one_pending_email_idx')
        AND i.indisvalid AND i.indisunique AND i.indpred IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.admin_user_invitation_status_created_idx') AND indisvalid)
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.admin_user_invitation_accepted_assignment_idx') AND indisvalid) THEN
    RAISE EXCEPTION 'Missing/invalid invitation indexes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=invitation AND tgname='admin_user_invitation_guard' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=invitation AND tgname='no_admin_user_invitation_delete' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=invitation AND tgname='no_admin_user_invitation_truncate' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=accounts AND tgname='user_access_status_audit' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=accounts AND tgname='legacy_access_compatibility' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Missing/disabled admin user management triggers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid=invitation AND a.grantee=0
  ) THEN RAISE EXCEPTION 'PUBLIC has invitation table privileges'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='public' AND p.proname IN ('db_user_access_status_audit','db_admin_user_invitation_guard') AND a.grantee=0
  ) THEN RAISE EXCEPTION 'PUBLIC can execute admin user management integrity functions'; END IF;
END $check$;
SELECT 'PASS' AS admin_user_management_verification;
