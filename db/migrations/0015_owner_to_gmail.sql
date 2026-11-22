-- S3-P004-033: one email domain per role. The protected owner moves from the graduate.utm.my account to the
-- gmail.com System Administrator, and the graduate account keeps STUDENT only.
-- Pinned to the owner's two Clerk IDs (read from Neon on 2026-11-21):
--   from user_3L9068HIQmPtA3AzFTo6bBpRAyO (sp-mohdsharhan.ag@graduate.utm.my, access_assignment_id 1)
--   to   user_3MPgmlCxY4NFIuYgPaypFquJ0l6 (sharhanarean@gmail.com, access_assignment_id 2671)
-- No-op when neither account exists (fresh and test databases) or when the move already happened.
-- Any other state aborts with nothing changed. The owner lock trigger (0004) is disabled only for the two owner
-- flag updates, which are audited by hand, and is enabled again before the revoke, which it audits itself.
DO $migration$
DECLARE
  from_account integer; to_account integer;
BEGIN
  SELECT access_assignment_id INTO from_account FROM public.user_access_assignment WHERE clerk_user_id='user_3L9068HIQmPtA3AzFTo6bBpRAyO';
  SELECT access_assignment_id INTO to_account FROM public.user_access_assignment WHERE clerk_user_id='user_3MPgmlCxY4NFIuYgPaypFquJ0l6';
  IF from_account IS NULL AND to_account IS NULL THEN
    RAISE NOTICE '0015 skipped: the pinned owner accounts are not in this database';
    RETURN;
  END IF;
  IF to_account IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=to_account AND app_role='SYSTEM_ADMIN' AND protected_owner) THEN
    RAISE NOTICE '0015 skipped: the gmail account is already the protected owner';
    RETURN;
  END IF;
  IF from_account IS NULL OR to_account IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=to_account AND app_role='SYSTEM_ADMIN')
     OR NOT EXISTS (SELECT 1 FROM public.user_access_assignment WHERE access_assignment_id=to_account AND access_status='ACTIVE')
     OR NOT EXISTS (SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=from_account AND app_role='SYSTEM_ADMIN' AND protected_owner) THEN
    RAISE EXCEPTION '0015 aborted: expected the graduate account to be the protected owner and the active gmail account to hold SYSTEM_ADMIN' USING ERRCODE='23514';
  END IF;

  ALTER TABLE public.user_role_assignment DISABLE TRIGGER user_role_audit_guard;
  UPDATE public.user_role_assignment SET protected_owner=false WHERE access_assignment_id=from_account AND app_role='SYSTEM_ADMIN';
  UPDATE public.user_role_assignment SET protected_owner=true WHERE access_assignment_id=to_account AND app_role='SYSTEM_ADMIN';
  INSERT INTO public.user_role_audit_log(access_assignment_id,app_role,action,performed_by_clerk_user_id,reason,old_email_policy,new_email_policy,grant_source,protected_owner)
  SELECT access_assignment_id,'SYSTEM_ADMIN','PROTECT_OWNER','__MIGRATION_0015__','Owner moved to gmail (S3-P004-033)',email_policy,email_policy,grant_source,protected_owner
  FROM public.user_role_assignment WHERE access_assignment_id IN (from_account,to_account) AND app_role='SYSTEM_ADMIN'
  ORDER BY protected_owner;
  ALTER TABLE public.user_role_assignment ENABLE TRIGGER user_role_audit_guard;

  PERFORM set_config('app.access_actor','__MIGRATION_0015__',true);
  PERFORM set_config('app.access_reason','Graduate account keeps STUDENT only (S3-P004-033)',true);
  DELETE FROM public.user_role_assignment WHERE access_assignment_id=from_account AND app_role IN ('SYSTEM_ADMIN','COORDINATOR');
  PERFORM set_config('app.access_actor','',true);
  PERFORM set_config('app.access_reason','',true);
END $migration$;
