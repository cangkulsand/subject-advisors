-- Additive multi-role authority. user_access_assignment remains the stable
-- account/suspension row and legacy app_role remains a read-only projection.
CREATE TABLE public.user_role_assignment (
  access_assignment_id integer NOT NULL REFERENCES public.user_access_assignment(access_assignment_id) ON DELETE RESTRICT,
  app_role varchar(20) NOT NULL,
  email_policy varchar(40) NOT NULL,
  grant_source varchar(20) NOT NULL,
  protected_owner boolean NOT NULL DEFAULT false,
  granted_by_clerk_user_id varchar(255) NOT NULL,
  grant_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (access_assignment_id, app_role),
  CONSTRAINT user_role_assignment_role_rule CHECK (app_role IN ('STUDENT','COORDINATOR','SYSTEM_ADMIN')),
  CONSTRAINT user_role_assignment_policy_rule CHECK (
    email_policy IN ('ROLE_DOMAIN','OWNER_STUDENT_COORDINATOR')),
  CONSTRAINT user_role_assignment_source_rule CHECK (grant_source IN ('MIGRATION_COMPAT','LEGACY_INIT','OPERATOR')),
  CONSTRAINT user_role_assignment_owner_exception_rule CHECK (
    email_policy <> 'OWNER_STUDENT_COORDINATOR' OR app_role = 'COORDINATOR'),
  CONSTRAINT user_role_assignment_protected_admin_rule CHECK (NOT protected_owner OR app_role = 'SYSTEM_ADMIN'),
  CONSTRAINT user_role_assignment_actor_rule CHECK (length(btrim(granted_by_clerk_user_id)) > 0),
  CONSTRAINT user_role_assignment_reason_rule CHECK (length(btrim(grant_reason)) > 0)
);
CREATE INDEX user_role_assignment_role_idx ON public.user_role_assignment(app_role, access_assignment_id);
CREATE UNIQUE INDEX user_role_assignment_one_protected_owner_idx ON public.user_role_assignment(protected_owner) WHERE protected_owner;

CREATE TABLE public.user_role_audit_log (
  user_role_audit_log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  access_assignment_id integer NOT NULL REFERENCES public.user_access_assignment(access_assignment_id) ON DELETE RESTRICT,
  app_role varchar(20) NOT NULL,
  action varchar(20) NOT NULL,
  performed_by_clerk_user_id varchar(255) NOT NULL,
  reason text NOT NULL,
  old_email_policy varchar(40),
  new_email_policy varchar(40),
  grant_source varchar(20) NOT NULL,
  protected_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_role_audit_role_rule CHECK (app_role IN ('STUDENT','COORDINATOR','SYSTEM_ADMIN')),
  CONSTRAINT user_role_audit_action_rule CHECK (action IN ('GRANT','REVOKE','POLICY_CHANGE','PROTECT_OWNER')),
  CONSTRAINT user_role_audit_actor_rule CHECK (length(btrim(performed_by_clerk_user_id)) > 0),
  CONSTRAINT user_role_audit_reason_rule CHECK (length(btrim(reason)) > 0),
  CONSTRAINT user_role_audit_old_policy_rule CHECK (old_email_policy IS NULL OR old_email_policy IN ('ROLE_DOMAIN','OWNER_STUDENT_COORDINATOR')),
  CONSTRAINT user_role_audit_new_policy_rule CHECK (new_email_policy IS NULL OR new_email_policy IN ('ROLE_DOMAIN','OWNER_STUDENT_COORDINATOR')),
  CONSTRAINT user_role_audit_source_rule CHECK (grant_source IN ('MIGRATION_COMPAT','LEGACY_INIT','OPERATOR'))
);
CREATE INDEX user_role_audit_target_time_idx ON public.user_role_audit_log(access_assignment_id, created_at);

-- Every historical role is preserved as a compatibility grant. This does not
-- infer email eligibility or authorize an OWNER exception.
INSERT INTO public.user_role_assignment(access_assignment_id, app_role, email_policy, grant_source, granted_by_clerk_user_id, grant_reason, created_at)
SELECT access_assignment_id, app_role, 'ROLE_DOMAIN', 'MIGRATION_COMPAT', '__MIGRATION_0004__',
       'Backfilled from legacy app_role; verified identity policy must be reconciled before staff authorization.', created_at
FROM public.user_access_assignment;
INSERT INTO public.user_role_audit_log(access_assignment_id, app_role, action, performed_by_clerk_user_id, reason, new_email_policy, grant_source, created_at)
SELECT access_assignment_id, app_role, 'GRANT', '__MIGRATION_0004__',
       'Historical role preserved from legacy app_role; email eligibility must be checked at runtime.', 'ROLE_DOMAIN', 'MIGRATION_COMPAT', created_at
FROM public.user_access_assignment;

CREATE FUNCTION public.db_user_role_audit_and_last_admin() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE actor text; reason text; old_policy text; new_policy text;
BEGIN
  PERFORM pg_advisory_xact_lock(260002,1);
  actor := nullif(btrim(current_setting('app.access_actor', true)), '');
  reason := nullif(btrim(current_setting('app.access_reason', true)), '');
  IF actor IS NULL OR reason IS NULL THEN
    RAISE EXCEPTION 'Role mutation requires trusted actor and reason context' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=NEW.access_assignment_id AND app_role=NEW.app_role) THEN
      RAISE EXCEPTION 'Role already assigned; use an explicit policy update' USING ERRCODE='23505';
    END IF;
    IF NEW.protected_owner AND current_setting('app.protected_owner_bootstrap',true) IS DISTINCT FROM 'VERIFIED_CLERK_ID' THEN
      RAISE EXCEPTION 'Protected owner creation requires verified bootstrap context' USING ERRCODE='23514';
    END IF;
    IF NEW.granted_by_clerk_user_id IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'Role grant actor must match trusted audit context' USING ERRCODE='23514';
    END IF;
    IF NEW.email_policy='OWNER_STUDENT_COORDINATOR' AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=NEW.access_assignment_id AND app_role='SYSTEM_ADMIN' AND protected_owner
    ) THEN
      RAISE EXCEPTION 'Student-domain coordinator exception requires the protected owner identity' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.user_role_audit_log(access_assignment_id,app_role,action,performed_by_clerk_user_id,reason,new_email_policy,grant_source,protected_owner)
    VALUES (NEW.access_assignment_id,NEW.app_role,'GRANT',actor,reason,NEW.email_policy,NEW.grant_source,NEW.protected_owner);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.protected_owner THEN
      RAISE EXCEPTION 'Protected owner administrator membership cannot be changed' USING ERRCODE='23514';
    END IF;
    IF NEW.protected_owner IS DISTINCT FROM OLD.protected_owner THEN
      IF NOT NEW.protected_owner OR NEW.app_role <> 'SYSTEM_ADMIN'
         OR current_setting('app.protected_owner_bootstrap',true) IS DISTINCT FROM 'VERIFIED_CLERK_ID'
         OR NEW.access_assignment_id<>OLD.access_assignment_id OR NEW.app_role<>OLD.app_role
         OR NEW.email_policy<>OLD.email_policy OR NEW.grant_source<>OLD.grant_source
         OR NEW.granted_by_clerk_user_id<>OLD.granted_by_clerk_user_id OR NEW.grant_reason<>OLD.grant_reason
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Protected owner status requires a separate verified owner bootstrap' USING ERRCODE='23514';
      END IF;
      INSERT INTO public.user_role_audit_log(access_assignment_id,app_role,action,performed_by_clerk_user_id,reason,old_email_policy,new_email_policy,grant_source,protected_owner)
      VALUES (OLD.access_assignment_id,OLD.app_role,'PROTECT_OWNER',actor,reason,OLD.email_policy,NEW.email_policy,OLD.grant_source,true);
      RETURN NEW;
    END IF;
    IF NEW.access_assignment_id <> OLD.access_assignment_id OR NEW.app_role <> OLD.app_role THEN
      RAISE EXCEPTION 'Role identity is immutable; revoke and grant explicitly' USING ERRCODE='23514';
    END IF;
    IF NEW.grant_source IS DISTINCT FROM OLD.grant_source
       OR NEW.granted_by_clerk_user_id IS DISTINCT FROM OLD.granted_by_clerk_user_id
       OR NEW.grant_reason IS DISTINCT FROM OLD.grant_reason OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Role grant provenance is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.email_policy='OWNER_STUDENT_COORDINATOR' AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=NEW.access_assignment_id AND app_role='SYSTEM_ADMIN' AND protected_owner
    ) THEN
      RAISE EXCEPTION 'Student-domain coordinator exception requires the protected owner identity' USING ERRCODE='23514';
    END IF;
    old_policy := OLD.email_policy; new_policy := NEW.email_policy;
    INSERT INTO public.user_role_audit_log(access_assignment_id,app_role,action,performed_by_clerk_user_id,reason,old_email_policy,new_email_policy,grant_source)
    VALUES (OLD.access_assignment_id,OLD.app_role,'POLICY_CHANGE',actor,reason,old_policy,new_policy,OLD.grant_source);
    RETURN NEW;
  END IF;
  IF OLD.protected_owner THEN
    RAISE EXCEPTION 'Protected owner administrator membership cannot be removed' USING ERRCODE='23514';
  END IF;
  IF OLD.app_role='SYSTEM_ADMIN' AND EXISTS (
    SELECT 1 FROM public.user_access_assignment a WHERE a.access_assignment_id=OLD.access_assignment_id AND a.access_status='ACTIVE'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id)
    WHERE r.app_role='SYSTEM_ADMIN' AND r.access_assignment_id<>OLD.access_assignment_id AND a.access_status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Cannot remove the last active System Administrator' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.user_role_audit_log(access_assignment_id,app_role,action,performed_by_clerk_user_id,reason,old_email_policy,grant_source)
  VALUES (OLD.access_assignment_id,OLD.app_role,'REVOKE',actor,reason,OLD.email_policy,OLD.grant_source);
  RETURN OLD;
END $fn$;
CREATE TRIGGER user_role_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_role_assignment
FOR EACH ROW EXECUTE FUNCTION public.db_user_role_audit_and_last_admin();
CREATE TRIGGER no_user_role_truncate BEFORE TRUNCATE ON public.user_role_assignment
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

-- Parent account inserts from old registration code seed only the legacy initial
-- role. Any old app_role update is rejected; it cannot become a grant path.
CREATE FUNCTION public.db_legacy_access_compatibility() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE previous_actor text; previous_reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.app_role <> 'STUDENT' THEN
      RAISE EXCEPTION 'Legacy account creation may initialize STUDENT only' USING ERRCODE='23514';
    END IF;
    previous_actor := current_setting('app.access_actor',true);
    previous_reason := current_setting('app.access_reason',true);
    PERFORM set_config('app.access_actor',NEW.clerk_user_id,true);
    PERFORM set_config('app.access_reason','Initial STUDENT membership for legacy registration compatibility.',true);
    INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
    VALUES (NEW.access_assignment_id,'STUDENT','ROLE_DOMAIN','LEGACY_INIT',NEW.clerk_user_id,'Initial STUDENT membership; backend must verify exact institutional email.');
    PERFORM set_config('app.access_actor',coalesce(previous_actor,''),true);
    PERFORM set_config('app.access_reason',coalesce(previous_reason,''),true);
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id THEN
    RAISE EXCEPTION 'Account Clerk identity is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    RAISE EXCEPTION 'Legacy app_role is immutable; mutate explicit role memberships' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.access_status IS DISTINCT FROM OLD.access_status THEN
    PERFORM pg_advisory_xact_lock(260002,1);
    IF OLD.access_status='ACTIVE' AND NEW.access_status='SUSPENDED'
       AND EXISTS(SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=OLD.access_assignment_id AND app_role='SYSTEM_ADMIN')
       AND NOT EXISTS (
         SELECT 1 FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id)
         WHERE r.app_role='SYSTEM_ADMIN' AND r.access_assignment_id<>OLD.access_assignment_id AND a.access_status='ACTIVE'
       ) THEN
      RAISE EXCEPTION 'Cannot suspend the last active System Administrator' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN
    PERFORM pg_advisory_xact_lock(260002,1);
    IF OLD.access_status='ACTIVE'
       AND EXISTS(SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=OLD.access_assignment_id AND app_role='SYSTEM_ADMIN')
       AND NOT EXISTS (
         SELECT 1 FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id)
         WHERE r.app_role='SYSTEM_ADMIN' AND r.access_assignment_id<>OLD.access_assignment_id AND a.access_status='ACTIVE'
       ) THEN
      RAISE EXCEPTION 'Cannot delete the last active System Administrator account' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER legacy_access_seed_student AFTER INSERT ON public.user_access_assignment
FOR EACH ROW EXECUTE FUNCTION public.db_legacy_access_compatibility();
CREATE TRIGGER legacy_access_compatibility BEFORE UPDATE OR DELETE ON public.user_access_assignment
FOR EACH ROW EXECUTE FUNCTION public.db_legacy_access_compatibility();
-- Replace the legacy single-role guard; the new trigger checks memberships.
DROP TRIGGER preserve_last_admin ON public.user_access_assignment;
CREATE TRIGGER no_user_access_truncate_multi_role BEFORE TRUNCATE ON public.user_access_assignment
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

CREATE TRIGGER immutable_user_role_audit BEFORE UPDATE OR DELETE ON public.user_role_audit_log
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER immutable_user_role_audit_truncate BEFORE TRUNCATE ON public.user_role_audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

REVOKE ALL ON public.user_role_assignment FROM PUBLIC;
REVOKE ALL ON public.user_role_audit_log FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.user_role_audit_log_user_role_audit_log_id_seq FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_user_role_audit_and_last_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_legacy_access_compatibility() FROM PUBLIC;
