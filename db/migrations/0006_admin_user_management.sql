-- Admin user management support (S2-P004-004 MT2). Additive only:
--   A. audit every access_status change on user_access_assignment;
--   B. pending-invitation table for people who have not signed in yet.
-- No existing rows are updated, renamed or deleted.

-- A. Access-status audit. Runs AFTER the row update so the legacy
-- legacy_access_compatibility BEFORE trigger (advisory lock + last-admin guard)
-- has already accepted the change; a rejected change therefore never audits.
-- Trusted actor/reason context is mandatory, matching the 0004 role audit.
CREATE FUNCTION public.db_user_access_status_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE actor text; reason text;
BEGIN
  actor := nullif(btrim(current_setting('app.access_actor', true)), '');
  reason := nullif(btrim(current_setting('app.access_reason', true)), '');
  IF actor IS NULL OR reason IS NULL THEN
    RAISE EXCEPTION 'Access status change requires trusted actor and reason context' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.user_access_audit_log(access_assignment_id,performed_by_clerk_user_id,change_type,old_value,new_value,reason)
  VALUES (NEW.access_assignment_id,actor,'ACCESS_STATUS_CHANGE',OLD.access_status,NEW.access_status,reason);
  RETURN NULL;
END $fn$;
CREATE TRIGGER user_access_status_audit AFTER UPDATE OF access_status ON public.user_access_assignment
FOR EACH ROW WHEN (OLD.access_status IS DISTINCT FROM NEW.access_status)
EXECUTE FUNCTION public.db_user_access_status_audit();

-- B. Pending invitations. Invitations only record intended roles; they can
-- never grant protected_owner (no such column) and roles are still granted
-- through user_role_assignment, whose own trigger enforces that rule.
CREATE TABLE public.admin_user_invitation (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL,
  roles varchar(20)[] NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  clerk_invitation_id varchar(255),
  invited_by_clerk_user_id varchar(255) NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_access_assignment_id integer REFERENCES public.user_access_assignment(access_assignment_id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by_clerk_user_id varchar(255),
  CONSTRAINT admin_user_invitation_email_rule CHECK (
    email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254 AND position('@' IN email) > 1),
  CONSTRAINT admin_user_invitation_roles_rule CHECK (
    array_ndims(roles) = 1 AND cardinality(roles) BETWEEN 1 AND 3
    AND roles <@ ARRAY['STUDENT','COORDINATOR','SYSTEM_ADMIN']::varchar(20)[]),
  CONSTRAINT admin_user_invitation_status_rule CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  CONSTRAINT admin_user_invitation_clerk_id_rule CHECK (clerk_invitation_id IS NULL OR length(btrim(clerk_invitation_id)) > 0),
  CONSTRAINT admin_user_invitation_inviter_rule CHECK (length(btrim(invited_by_clerk_user_id)) > 0),
  CONSTRAINT admin_user_invitation_reason_rule CHECK (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 500),
  CONSTRAINT admin_user_invitation_expiry_rule CHECK (expires_at > created_at),
  CONSTRAINT admin_user_invitation_revoker_rule CHECK (revoked_by_clerk_user_id IS NULL OR length(btrim(revoked_by_clerk_user_id)) > 0),
  CONSTRAINT admin_user_invitation_status_columns_rule CHECK (
    (status IN ('PENDING','EXPIRED') AND accepted_at IS NULL AND accepted_access_assignment_id IS NULL
       AND revoked_at IS NULL AND revoked_by_clerk_user_id IS NULL)
    OR (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND accepted_access_assignment_id IS NOT NULL
       AND revoked_at IS NULL AND revoked_by_clerk_user_id IS NULL)
    OR (status = 'REVOKED' AND revoked_at IS NOT NULL AND revoked_by_clerk_user_id IS NOT NULL
       AND accepted_at IS NULL AND accepted_access_assignment_id IS NULL))
);
CREATE UNIQUE INDEX admin_user_invitation_one_pending_email_idx ON public.admin_user_invitation(email) WHERE status = 'PENDING';
CREATE INDEX admin_user_invitation_status_created_idx ON public.admin_user_invitation(status, created_at);
CREATE INDEX admin_user_invitation_accepted_assignment_idx ON public.admin_user_invitation(accepted_access_assignment_id)
  WHERE accepted_access_assignment_id IS NOT NULL;

-- Creation needs a trusted actor equal to invited_by and a PENDING row with no
-- duplicate roles. Updates may only set clerk_invitation_id once (NULL -> value)
-- and/or move PENDING to a terminal status; terminal rows are frozen.
CREATE FUNCTION public.db_admin_user_invitation_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE actor text;
BEGIN
  actor := nullif(btrim(current_setting('app.access_actor', true)), '');
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Invitation mutation requires trusted actor context' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Invitations must be created PENDING' USING ERRCODE='23514';
    END IF;
    IF NEW.invited_by_clerk_user_id IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'Invitation inviter must match trusted audit context' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(DISTINCT r) FROM unnest(NEW.roles) r) <> cardinality(NEW.roles) THEN
      RAISE EXCEPTION 'Invitation roles must not contain duplicates' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Terminal invitation (%) cannot be changed', OLD.status USING ERRCODE='23514';
  END IF;
  IF NEW.invitation_id IS DISTINCT FROM OLD.invitation_id OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.roles IS DISTINCT FROM OLD.roles OR NEW.invited_by_clerk_user_id IS DISTINCT FROM OLD.invited_by_clerk_user_id
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Invitation creation fields are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.clerk_invitation_id IS DISTINCT FROM OLD.clerk_invitation_id AND OLD.clerk_invitation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Clerk invitation id can only be set once' USING ERRCODE='23514';
  END IF;
  -- Use the database clock: a caller-supplied accepted_at could be backdated.
  IF NEW.status = 'ACCEPTED' AND (clock_timestamp() > OLD.expires_at OR NEW.accepted_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'Expired invitation cannot be accepted' USING ERRCODE='23514';
  END IF;
  IF NEW.status = 'REVOKED' AND NEW.revoked_by_clerk_user_id IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Invitation revoker must match trusted audit context' USING ERRCODE='23514';
  END IF;
  IF NEW.status = 'EXPIRED' AND OLD.expires_at > clock_timestamp() THEN
    RAISE EXCEPTION 'Invitation has not expired yet' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER admin_user_invitation_guard BEFORE INSERT OR UPDATE ON public.admin_user_invitation
FOR EACH ROW EXECUTE FUNCTION public.db_admin_user_invitation_guard();
CREATE TRIGGER no_admin_user_invitation_delete BEFORE DELETE ON public.admin_user_invitation
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER no_admin_user_invitation_truncate BEFORE TRUNCATE ON public.admin_user_invitation
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

REVOKE ALL ON public.admin_user_invitation FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_user_access_status_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_admin_user_invitation_guard() FROM PUBLIC;
