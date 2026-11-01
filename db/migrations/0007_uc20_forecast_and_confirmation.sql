-- UC20 forecast persistence and coordinator offering confirmation (S2-P004-007 MT2).
-- Additive only: nullable columns, new tables, new guard triggers. No historical rows
-- are updated, renamed or deleted. It deliberately does NOT reference coordinator_assignment,
-- faculty, academic_semester.is_current or student_profile.learning_centre_id, and adds no
-- student pick tables or profile columns.
--
-- Capacity (OP14: LAB 35, LECTURE 45, optimal 25) needs no schema change: class_capacity_rule
-- already carries class_type, minimum_enrollment, break_even_target (optimal), normal_maximum
-- and exception_maximum, and referenced rules are immutable. The values are configuration
-- rows, not seeds; the engine reads the active rule per class_type and stores the values it
-- used in forecast_run.rule_snapshot.

-- A. Programme scope, import provenance and acceptance freeze ---------------------------
ALTER TABLE public.academic_import_batch ADD COLUMN programme_id integer REFERENCES public.programme(programme_id) ON DELETE RESTRICT;
ALTER TABLE public.academic_import_batch ADD COLUMN target_semester_id integer REFERENCES public.academic_semester(semester_id) ON DELETE RESTRICT;
ALTER TABLE public.academic_import_batch ADD COLUMN source_fingerprint varchar(64);
ALTER TABLE public.academic_import_batch ADD COLUMN validation_summary jsonb;
ALTER TABLE public.academic_import_batch ADD COLUMN accepted_at timestamptz;
ALTER TABLE public.academic_import_batch ADD COLUMN accepted_by varchar(255);
ALTER TABLE public.academic_import_batch ADD CONSTRAINT academic_import_batch_fingerprint_rule
  CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$');
ALTER TABLE public.academic_import_batch ADD CONSTRAINT academic_import_batch_validation_rule
  CHECK (validation_summary IS NULL OR jsonb_typeof(validation_summary) = 'object');
ALTER TABLE public.academic_import_batch ADD CONSTRAINT academic_import_batch_accepted_by_rule
  CHECK (accepted_by IS NULL OR length(btrim(accepted_by)) > 0);
ALTER TABLE public.academic_import_batch ADD CONSTRAINT academic_import_batch_accepted_pair_rule
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL));
ALTER TABLE public.academic_import_batch ADD CONSTRAINT academic_import_batch_accepted_rule
  CHECK ((import_status = 'ACCEPTED') = (accepted_at IS NOT NULL)
    AND (import_status <> 'ACCEPTED' OR (programme_id IS NOT NULL AND target_semester_id IS NOT NULL
      AND source_fingerprint IS NOT NULL AND validation_summary IS NOT NULL)));
CREATE INDEX academic_import_batch_programme_id_idx ON public.academic_import_batch(programme_id) WHERE programme_id IS NOT NULL;
CREATE INDEX academic_import_batch_target_semester_id_idx ON public.academic_import_batch(target_semester_id) WHERE target_semester_id IS NOT NULL;

ALTER TABLE public.imported_student ADD COLUMN history_completeness varchar(20);
ALTER TABLE public.imported_student ADD CONSTRAINT imported_student_history_completeness_rule
  CHECK (history_completeness IS NULL OR history_completeness IN ('COMPLETE','PARTIAL','UNKNOWN'));
ALTER TABLE public.imported_student ADD COLUMN student_name varchar(255);
ALTER TABLE public.imported_student ADD CONSTRAINT imported_student_name_rule
  CHECK (student_name IS NULL OR (length(btrim(student_name)) > 0 AND length(student_name) <= 255));
ALTER TABLE public.imported_subject_record ADD COLUMN recognized_credits integer;
ALTER TABLE public.imported_subject_record ADD CONSTRAINT imported_subject_record_credits_rule
  CHECK (recognized_credits IS NULL OR recognized_credits >= 0);

-- Lifecycle for batches that carry a programme (new UC20 imports). Legacy batches without
-- programme_id keep their free-form import_status and the 0001 guards only.
--   UPLOADED -> VALIDATED | REJECTED;  VALIDATED -> ACCEPTED | REJECTED;  ACCEPTED/REJECTED are terminal.
CREATE FUNCTION public.db_import_batch_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.import_status IN ('ACCEPTED','REJECTED') THEN
      RAISE EXCEPTION 'Accepted or rejected import snapshots are immutable' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.programme_id IS NULL THEN
      RAISE EXCEPTION 'Import batch requires a programme' USING ERRCODE='23514';
    END IF;
    IF NEW.import_status NOT IN ('UPLOADED','VALIDATED') THEN
      RAISE EXCEPTION 'Import batch must start UPLOADED or VALIDATED' USING ERRCODE='23514';
    END IF;
    IF NEW.import_status = 'VALIDATED' AND (NEW.source_fingerprint IS NULL OR NEW.validation_summary IS NULL) THEN
      RAISE EXCEPTION 'Validated import requires source fingerprint and validation summary' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.import_status IN ('ACCEPTED','REJECTED') THEN
    RAISE EXCEPTION 'Accepted or rejected import snapshots are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.programme_id IS NULL THEN
    IF NEW.programme_id IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy import batches cannot be adopted into a programme' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.programme_id IS DISTINCT FROM OLD.programme_id OR NEW.learning_centre_id IS DISTINCT FROM OLD.learning_centre_id
     OR NEW.snapshot_date IS DISTINCT FROM OLD.snapshot_date OR NEW.provided_by IS DISTINCT FROM OLD.provided_by
     OR NEW.provided_at IS DISTINCT FROM OLD.provided_at THEN
    RAISE EXCEPTION 'Import scope and provenance are immutable' USING ERRCODE='23514';
  END IF;
  IF NOT (NEW.import_status = OLD.import_status
       OR (OLD.import_status = 'UPLOADED' AND NEW.import_status IN ('VALIDATED','REJECTED'))
       OR (OLD.import_status = 'VALIDATED' AND NEW.import_status IN ('ACCEPTED','REJECTED'))) THEN
    RAISE EXCEPTION 'Invalid import status transition % -> %', OLD.import_status, NEW.import_status USING ERRCODE='23514';
  END IF;
  IF NEW.import_status IN ('VALIDATED','ACCEPTED') AND (NEW.source_fingerprint IS NULL OR NEW.validation_summary IS NULL) THEN
    RAISE EXCEPTION 'Validated import requires source fingerprint and validation summary' USING ERRCODE='23514';
  END IF;
  IF NEW.import_status = 'ACCEPTED' THEN
    IF NEW.accepted_by IS NULL OR NEW.target_semester_id IS NULL THEN
      RAISE EXCEPTION 'Acceptance requires accepted_by and target semester' USING ERRCODE='23514';
    END IF;
    NEW.accepted_at := clock_timestamp(); -- database clock; callers cannot backdate
  ELSIF NEW.accepted_at IS NOT NULL OR NEW.accepted_by IS NOT NULL THEN
    RAISE EXCEPTION 'Only accepted imports carry acceptance metadata' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER import_batch_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON public.academic_import_batch
FOR EACH ROW EXECUTE FUNCTION public.db_import_batch_lifecycle();

-- Locks the batch and returns its programme; rejects writes once the snapshot is frozen.
CREATE FUNCTION public.db_open_import_batch(batch integer) RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE state varchar; programme integer;
BEGIN
  SELECT import_status, programme_id INTO state, programme FROM public.academic_import_batch WHERE import_batch_id = batch FOR UPDATE;
  IF state IN ('ACCEPTED','REJECTED') THEN
    RAISE EXCEPTION 'Accepted or rejected import snapshot rows are immutable; upload a corrected snapshot' USING ERRCODE='23514';
  END IF;
  RETURN programme;
END $fn$;
CREATE FUNCTION public.db_import_rows_freeze() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE batch integer; programme integer;
BEGIN
  IF TG_TABLE_NAME = 'imported_student' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM public.db_open_import_batch(OLD.import_batch_id); END IF;
    IF TG_OP <> 'DELETE' THEN
      programme := public.db_open_import_batch(NEW.import_batch_id);
      IF programme IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.curriculum WHERE curriculum_id = NEW.curriculum_id AND programme_id = programme) THEN
        RAISE EXCEPTION 'Imported student curriculum is outside the import programme' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT import_batch_id INTO batch FROM public.imported_student WHERE imported_student_id = OLD.imported_student_id;
      PERFORM public.db_open_import_batch(batch);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT import_batch_id INTO batch FROM public.imported_student WHERE imported_student_id = NEW.imported_student_id;
      PERFORM public.db_open_import_batch(batch);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER imported_student_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.imported_student
FOR EACH ROW EXECUTE FUNCTION public.db_import_rows_freeze();
CREATE TRIGGER imported_record_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.imported_subject_record
FOR EACH ROW EXECUTE FUNCTION public.db_import_rows_freeze();

-- B. Forecast run scope, reproducibility and demand detail -------------------------------
ALTER TABLE public.forecast_run ADD COLUMN programme_id integer REFERENCES public.programme(programme_id) ON DELETE RESTRICT;
ALTER TABLE public.forecast_run ADD COLUMN rule_snapshot jsonb;
ALTER TABLE public.forecast_run ADD COLUMN engine_version varchar(50);
ALTER TABLE public.forecast_run ADD COLUMN original_recommendations jsonb;
ALTER TABLE public.forecast_run ADD CONSTRAINT forecast_run_rule_snapshot_rule
  CHECK (rule_snapshot IS NULL OR jsonb_typeof(rule_snapshot) = 'object');
ALTER TABLE public.forecast_run ADD CONSTRAINT forecast_run_engine_version_rule
  CHECK (engine_version IS NULL OR length(btrim(engine_version)) > 0);
ALTER TABLE public.forecast_run ADD CONSTRAINT forecast_run_original_recommendations_rule
  CHECK (original_recommendations IS NULL OR jsonb_typeof(original_recommendations) = 'array');
CREATE INDEX forecast_run_programme_id_idx ON public.forecast_run(programme_id) WHERE programme_id IS NOT NULL;

-- The 0001 centre-only version key would stop two programmes sharing a centre/semester/version.
-- Keep it for legacy programme-less runs (partial index) and add the programme namespace.
ALTER TABLE public.forecast_run DROP CONSTRAINT forecast_run_rule_1;
CREATE UNIQUE INDEX forecast_run_legacy_centre_version_key
  ON public.forecast_run(learning_centre_id, target_semester_id, version_number) WHERE programme_id IS NULL;
CREATE UNIQUE INDEX forecast_run_programme_scope_version_key
  ON public.forecast_run(programme_id, learning_centre_id, target_semester_id, version_number) WHERE programme_id IS NOT NULL;

ALTER TABLE public.forecast_subject_demand ADD COLUMN uncertain_count integer;
ALTER TABLE public.forecast_subject_demand ADD COLUMN uncertainty_reasons jsonb;
ALTER TABLE public.forecast_subject_demand ADD COLUMN configuration_status varchar(30);
ALTER TABLE public.forecast_subject_demand ADD CONSTRAINT forecast_subject_demand_uncertain_rule
  CHECK (uncertain_count IS NULL OR uncertain_count >= 0);
ALTER TABLE public.forecast_subject_demand ADD CONSTRAINT forecast_subject_demand_reasons_rule
  CHECK (uncertainty_reasons IS NULL OR jsonb_typeof(uncertainty_reasons) = 'array');
ALTER TABLE public.forecast_subject_demand ADD CONSTRAINT forecast_subject_demand_configuration_rule
  CHECK (configuration_status IS NULL OR configuration_status IN ('CONFIGURED','CONFIGURATION_REQUIRED','EXCLUDED'));

-- Programme-scoped runs must come from an ACCEPTED snapshot of the same programme, centre and
-- semester and must carry the rule snapshot and engine version. Scope and snapshot are
-- immutable; FINALIZED runs are additionally frozen by the 0001 triggers (run, demand, sections).
CREATE FUNCTION public.db_forecast_run_scope() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE batch public.academic_import_batch%ROWTYPE; parent_programme integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.programme_id IS DISTINCT FROM OLD.programme_id OR NEW.rule_snapshot IS DISTINCT FROM OLD.rule_snapshot
       OR NEW.engine_version IS DISTINCT FROM OLD.engine_version
       OR NEW.original_recommendations IS DISTINCT FROM OLD.original_recommendations THEN
      RAISE EXCEPTION 'Forecast programme, rule snapshot and engine version are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.programme_id IS NULL THEN
    RAISE EXCEPTION 'Forecast run requires a programme' USING ERRCODE='23514';
  END IF;
  IF NEW.rule_snapshot IS NULL OR NEW.engine_version IS NULL THEN
    RAISE EXCEPTION 'Forecast run requires rule snapshot and engine version' USING ERRCODE='23514';
  END IF;
  SELECT * INTO batch FROM public.academic_import_batch WHERE import_batch_id = NEW.import_batch_id FOR SHARE;
  IF batch.import_batch_id IS NULL OR batch.import_status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Forecast requires an ACCEPTED import snapshot' USING ERRCODE='23514';
  END IF;
  IF batch.programme_id IS DISTINCT FROM NEW.programme_id OR batch.target_semester_id IS DISTINCT FROM NEW.target_semester_id THEN
    RAISE EXCEPTION 'Forecast programme or target semester does not match the import snapshot' USING ERRCODE='23514';
  END IF;
  IF NEW.parent_forecast_run_id IS NOT NULL THEN
    SELECT programme_id INTO parent_programme FROM public.forecast_run WHERE forecast_run_id = NEW.parent_forecast_run_id;
    IF parent_programme IS DISTINCT FROM NEW.programme_id THEN
      RAISE EXCEPTION 'Forecast parent programme mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER forecast_run_scope BEFORE INSERT OR UPDATE ON public.forecast_run
FOR EACH ROW EXECUTE FUNCTION public.db_forecast_run_scope();

-- C. Decision / adjustment audit (append-only; legacy forecast_decision_audit_log is kept) ---
-- The legacy table is keyed by proposed_section_id and its action list lacks REPLACE_ALLOCATION,
-- so it cannot record subject-level or allocation changes without altering its constraints.
CREATE TABLE public.forecast_adjustment_audit (
  adjustment_audit_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  forecast_run_id integer NOT NULL REFERENCES public.forecast_run(forecast_run_id) ON DELETE RESTRICT,
  demand_id integer REFERENCES public.forecast_subject_demand(demand_id) ON DELETE RESTRICT,
  action varchar(30) NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reason text NOT NULL,
  recorded_by varchar(255) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forecast_adjustment_audit_action_rule CHECK (action IN ('REVIEW','APPROVE','DEFER','REPLACE_ALLOCATION','REOPEN','FINALIZE','START_REVIEW')),
  CONSTRAINT forecast_adjustment_audit_target_rule CHECK ((action IN ('FINALIZE','START_REVIEW')) = (demand_id IS NULL)),
  CONSTRAINT forecast_adjustment_audit_state_rule CHECK (jsonb_typeof(before_state) = 'object' AND jsonb_typeof(after_state) = 'object'),
  CONSTRAINT forecast_adjustment_audit_reason_rule CHECK (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 500),
  CONSTRAINT forecast_adjustment_audit_actor_rule CHECK (length(btrim(recorded_by)) > 0)
);
CREATE INDEX forecast_adjustment_audit_run_time_idx ON public.forecast_adjustment_audit(forecast_run_id, recorded_at);
CREATE INDEX forecast_adjustment_audit_demand_idx ON public.forecast_adjustment_audit(demand_id) WHERE demand_id IS NOT NULL;
CREATE UNIQUE INDEX forecast_adjustment_audit_one_finalize_idx ON public.forecast_adjustment_audit(forecast_run_id) WHERE action = 'FINALIZE';
CREATE UNIQUE INDEX forecast_adjustment_audit_one_start_review_idx ON public.forecast_adjustment_audit(forecast_run_id) WHERE action = 'START_REVIEW';

-- Decisions need an editable run; the single START_REVIEW entry is written while the run is still DRAFT (same transaction as the
-- DRAFT -> UNDER_REVIEW update); the single FINALIZE entry may be written just before or just
-- after the run itself becomes FINALIZED.
CREATE FUNCTION public.db_forecast_adjustment_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE state varchar; demand_run integer;
BEGIN
  IF NEW.demand_id IS NOT NULL THEN
    SELECT forecast_run_id INTO demand_run FROM public.forecast_subject_demand WHERE demand_id = NEW.demand_id;
    IF demand_run IS DISTINCT FROM NEW.forecast_run_id THEN
      RAISE EXCEPTION 'Adjustment subject belongs to a different forecast run' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.action = 'FINALIZE' THEN
    SELECT status INTO state FROM public.forecast_run WHERE forecast_run_id = NEW.forecast_run_id FOR UPDATE;
    IF state IS NULL OR state NOT IN ('DRAFT','UNDER_REVIEW','FINALIZED') THEN
      RAISE EXCEPTION 'Forecast cannot be finalized from state %', coalesce(state,'missing') USING ERRCODE='23514';
    END IF;
  ELSIF NEW.action = 'START_REVIEW' THEN
    SELECT status INTO state FROM public.forecast_run WHERE forecast_run_id = NEW.forecast_run_id FOR UPDATE;
    IF state IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Review can only be started from DRAFT, not %', coalesce(state,'missing') USING ERRCODE='23514';
    END IF;
  ELSE
    PERFORM public.db_lock_editable_forecast(NEW.forecast_run_id);
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER forecast_adjustment_guard BEFORE INSERT ON public.forecast_adjustment_audit
FOR EACH ROW EXECUTE FUNCTION public.db_forecast_adjustment_guard();
CREATE TRIGGER immutable_forecast_adjustment_audit BEFORE UPDATE OR DELETE ON public.forecast_adjustment_audit
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER immutable_forecast_adjustment_audit_truncate BEFORE TRUNCATE ON public.forecast_adjustment_audit
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

-- D. Coordinator offering confirmation (S2-P004-006) ------------------------------------
-- Mutations require trusted context: SELECT set_config('app.offering_actor', ..., true) and
-- set_config('app.offering_reason', ..., true) inside the transaction. Audit rows are written
-- by triggers from that context, so a mutation can never skip its audit entry.
CREATE TABLE public.offering_confirmation (
  confirmation_id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  programme_id integer NOT NULL REFERENCES public.programme(programme_id) ON DELETE RESTRICT,
  learning_centre_id integer NOT NULL REFERENCES public.learning_centre(learning_centre_id) ON DELETE RESTRICT,
  semester_id integer NOT NULL REFERENCES public.academic_semester(semester_id) ON DELETE RESTRICT,
  forecast_run_id integer NOT NULL REFERENCES public.forecast_run(forecast_run_id) ON DELETE RESTRICT,
  pick_deadline timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_by varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(255) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_confirmation_scope_key UNIQUE (programme_id, learning_centre_id, semester_id),
  CONSTRAINT offering_confirmation_revision_rule CHECK (revision >= 1),
  CONSTRAINT offering_confirmation_actor_rule CHECK (length(btrim(created_by)) > 0 AND length(btrim(updated_by)) > 0)
);
CREATE INDEX offering_confirmation_forecast_run_idx ON public.offering_confirmation(forecast_run_id);
CREATE INDEX offering_confirmation_centre_idx ON public.offering_confirmation(learning_centre_id);
CREATE INDEX offering_confirmation_semester_idx ON public.offering_confirmation(semester_id);

CREATE TABLE public.confirmed_offering (
  confirmed_offering_id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  confirmation_id integer NOT NULL REFERENCES public.offering_confirmation(confirmation_id) ON DELETE RESTRICT,
  subject_id integer NOT NULL REFERENCES public.subject(subject_id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'CONFIRMED',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by varchar(255) NOT NULL,
  withdrawn_at timestamptz,
  withdrawn_by varchar(255),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT confirmed_offering_subject_key UNIQUE (confirmation_id, subject_id),
  CONSTRAINT confirmed_offering_status_rule CHECK (status IN ('CONFIRMED','WITHDRAWN')),
  CONSTRAINT confirmed_offering_actor_rule CHECK (length(btrim(confirmed_by)) > 0),
  CONSTRAINT confirmed_offering_withdrawal_rule CHECK (
    (status = 'CONFIRMED' AND withdrawn_at IS NULL AND withdrawn_by IS NULL)
    OR (status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND length(btrim(withdrawn_by)) > 0))
);
CREATE INDEX confirmed_offering_subject_idx ON public.confirmed_offering(subject_id);

CREATE TABLE public.confirmed_offering_audit (
  audit_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  confirmation_id integer NOT NULL REFERENCES public.offering_confirmation(confirmation_id) ON DELETE RESTRICT,
  subject_id integer REFERENCES public.subject(subject_id) ON DELETE RESTRICT,
  action varchar(20) NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text NOT NULL,
  recorded_by varchar(255) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT confirmed_offering_audit_action_rule CHECK (action IN ('CONFIRM','WITHDRAW','SET_DEADLINE')),
  CONSTRAINT confirmed_offering_audit_target_rule CHECK ((action = 'SET_DEADLINE') = (subject_id IS NULL)),
  CONSTRAINT confirmed_offering_audit_after_rule CHECK (after_state IS NOT NULL AND jsonb_typeof(after_state) = 'object'
    AND (before_state IS NULL OR jsonb_typeof(before_state) = 'object')),
  CONSTRAINT confirmed_offering_audit_reason_rule CHECK (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 500),
  CONSTRAINT confirmed_offering_audit_actor_rule CHECK (length(btrim(recorded_by)) > 0)
);
CREATE INDEX confirmed_offering_audit_confirmation_time_idx ON public.confirmed_offering_audit(confirmation_id, recorded_at);
CREATE INDEX confirmed_offering_audit_subject_idx ON public.confirmed_offering_audit(subject_id) WHERE subject_id IS NOT NULL;

-- Shared context reader. Raises when the trusted actor or reason is missing.
CREATE FUNCTION public.db_offering_context(OUT actor text, OUT reason text) LANGUAGE plpgsql AS $fn$
BEGIN
  actor := nullif(btrim(current_setting('app.offering_actor', true)), '');
  reason := nullif(btrim(current_setting('app.offering_reason', true)), '');
  IF actor IS NULL OR reason IS NULL THEN
    RAISE EXCEPTION 'Offering confirmation change requires trusted actor and reason context' USING ERRCODE='23514';
  END IF;
  IF length(reason) > 500 THEN
    RAISE EXCEPTION 'Offering confirmation reason is limited to 500 characters' USING ERRCODE='23514';
  END IF;
END $fn$;

CREATE FUNCTION public.db_offering_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ctx record;
BEGIN
  SELECT * INTO ctx FROM public.db_offering_context();
  IF NEW.recorded_by IS DISTINCT FROM ctx.actor OR NEW.reason IS DISTINCT FROM ctx.reason THEN
    RAISE EXCEPTION 'Offering audit actor and reason must match trusted context' USING ERRCODE='23514';
  END IF;
  NEW.recorded_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER offering_audit_guard BEFORE INSERT ON public.confirmed_offering_audit
FOR EACH ROW EXECUTE FUNCTION public.db_offering_audit_guard();
CREATE TRIGGER immutable_confirmed_offering_audit BEFORE UPDATE OR DELETE ON public.confirmed_offering_audit
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER immutable_confirmed_offering_audit_truncate BEFORE TRUNCATE ON public.confirmed_offering_audit
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

-- Header: the source run must be FINALIZED for the same programme + centre + semester. Every
-- UPDATE bumps revision (optimistic concurrency for the API's baseRevision).
CREATE FUNCTION public.db_offering_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ctx record; run public.forecast_run%ROWTYPE;
BEGIN
  SELECT * INTO ctx FROM public.db_offering_context();
  IF TG_OP = 'INSERT' OR NEW.forecast_run_id IS DISTINCT FROM OLD.forecast_run_id THEN
    SELECT * INTO run FROM public.forecast_run WHERE forecast_run_id = NEW.forecast_run_id FOR SHARE;
    IF run.forecast_run_id IS NULL OR run.status <> 'FINALIZED' OR run.programme_id IS DISTINCT FROM NEW.programme_id
       OR run.learning_centre_id <> NEW.learning_centre_id OR run.target_semester_id <> NEW.semester_id THEN
      RAISE EXCEPTION 'Confirmation requires a FINALIZED forecast run for the same programme, centre and semester' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    NEW.created_by := ctx.actor; NEW.created_at := clock_timestamp();
    NEW.updated_by := ctx.actor; NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;
  IF NEW.confirmation_id IS DISTINCT FROM OLD.confirmation_id OR NEW.programme_id IS DISTINCT FROM OLD.programme_id
     OR NEW.learning_centre_id IS DISTINCT FROM OLD.learning_centre_id OR NEW.semester_id IS DISTINCT FROM OLD.semester_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Confirmation scope and creation fields are immutable' USING ERRCODE='23514';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.updated_by := ctx.actor; NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER offering_confirmation_guard BEFORE INSERT OR UPDATE ON public.offering_confirmation
FOR EACH ROW EXECUTE FUNCTION public.db_offering_confirmation_guard();

CREATE FUNCTION public.db_offering_confirmation_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ctx record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.pick_deadline IS NOT DISTINCT FROM OLD.pick_deadline
     AND NEW.forecast_run_id IS NOT DISTINCT FROM OLD.forecast_run_id THEN
    RETURN NULL; -- revision touch caused by an offering change (already audited there)
  END IF;
  SELECT * INTO ctx FROM public.db_offering_context();
  INSERT INTO public.confirmed_offering_audit(confirmation_id, subject_id, action, before_state, after_state, reason, recorded_by)
  VALUES (NEW.confirmation_id, NULL, 'SET_DEADLINE',
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('pickDeadline', OLD.pick_deadline, 'forecastRunId', OLD.forecast_run_id) END,
    jsonb_build_object('pickDeadline', NEW.pick_deadline, 'forecastRunId', NEW.forecast_run_id),
    ctx.reason, ctx.actor);
  RETURN NULL;
END $fn$;
CREATE TRIGGER offering_confirmation_audit AFTER INSERT OR UPDATE ON public.offering_confirmation
FOR EACH ROW EXECUTE FUNCTION public.db_offering_confirmation_audit();

-- Offerings: only forecastable subjects that appear in the source run can become CONFIRMED.
CREATE FUNCTION public.db_confirmed_offering_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ctx record; header public.offering_confirmation%ROWTYPE; included boolean; finalized timestamptz;
BEGIN
  SELECT * INTO ctx FROM public.db_offering_context();
  SELECT * INTO header FROM public.offering_confirmation WHERE confirmation_id = NEW.confirmation_id FOR UPDATE;
  IF header.confirmation_id IS NULL THEN
    RAISE EXCEPTION 'Offering confirmation missing' USING ERRCODE='23503';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'CONFIRMED' THEN
      RAISE EXCEPTION 'Offerings are created CONFIRMED' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.confirmed_offering_id IS DISTINCT FROM OLD.confirmed_offering_id OR NEW.confirmation_id IS DISTINCT FROM OLD.confirmation_id
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    RAISE EXCEPTION 'Confirmed offering identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status = 'CONFIRMED' AND (TG_OP = 'INSERT' OR OLD.status <> 'CONFIRMED') THEN
    SELECT include_in_offering_forecast INTO included FROM public.subject WHERE subject_id = NEW.subject_id;
    IF included IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Subject is excluded from offering confirmation' USING ERRCODE='23514';
    END IF;
    SELECT finalized_at INTO finalized FROM public.forecast_run WHERE forecast_run_id = header.forecast_run_id;
    IF finalized IS NULL THEN
      RAISE EXCEPTION 'Confirmation source run is not finalized' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.forecast_subject_demand WHERE forecast_run_id = header.forecast_run_id AND subject_id = NEW.subject_id) THEN
      RAISE EXCEPTION 'Subject is not part of the source forecast run' USING ERRCODE='23514';
    END IF;
    NEW.confirmed_at := clock_timestamp(); NEW.confirmed_by := ctx.actor;
    NEW.withdrawn_at := NULL; NEW.withdrawn_by := NULL;
  ELSIF NEW.status = 'WITHDRAWN' AND OLD.status = 'CONFIRMED' THEN
    NEW.withdrawn_at := clock_timestamp(); NEW.withdrawn_by := ctx.actor;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    NEW.confirmed_at := OLD.confirmed_at; NEW.confirmed_by := OLD.confirmed_by;
    NEW.withdrawn_at := OLD.withdrawn_at; NEW.withdrawn_by := OLD.withdrawn_by;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER confirmed_offering_guard BEFORE INSERT OR UPDATE ON public.confirmed_offering
FOR EACH ROW EXECUTE FUNCTION public.db_confirmed_offering_guard();

CREATE FUNCTION public.db_confirmed_offering_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ctx record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NULL; END IF;
  SELECT * INTO ctx FROM public.db_offering_context();
  INSERT INTO public.confirmed_offering_audit(confirmation_id, subject_id, action, before_state, after_state, reason, recorded_by)
  VALUES (NEW.confirmation_id, NEW.subject_id,
    CASE WHEN NEW.status = 'CONFIRMED' THEN 'CONFIRM' ELSE 'WITHDRAW' END,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('status', OLD.status) END,
    jsonb_build_object('status', NEW.status), ctx.reason, ctx.actor);
  -- Bump the header revision so concurrent editors see the offering set changed.
  UPDATE public.offering_confirmation SET updated_at = clock_timestamp() WHERE confirmation_id = NEW.confirmation_id;
  RETURN NULL;
END $fn$;
CREATE TRIGGER confirmed_offering_audit AFTER INSERT OR UPDATE ON public.confirmed_offering
FOR EACH ROW EXECUTE FUNCTION public.db_confirmed_offering_audit();

-- Nothing here is ever deleted or truncated.
CREATE TRIGGER no_offering_confirmation_delete BEFORE DELETE ON public.offering_confirmation
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER no_offering_confirmation_truncate BEFORE TRUNCATE ON public.offering_confirmation
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER no_confirmed_offering_delete BEFORE DELETE ON public.confirmed_offering
FOR EACH ROW EXECUTE FUNCTION public.db_immutable();
CREATE TRIGGER no_confirmed_offering_truncate BEFORE TRUNCATE ON public.confirmed_offering
FOR EACH STATEMENT EXECUTE FUNCTION public.db_immutable();

-- E. Privileges ---------------------------------------------------------------------------
REVOKE ALL ON public.forecast_adjustment_audit FROM PUBLIC;
REVOKE ALL ON public.offering_confirmation FROM PUBLIC;
REVOKE ALL ON public.confirmed_offering FROM PUBLIC;
REVOKE ALL ON public.confirmed_offering_audit FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_import_batch_lifecycle() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_open_import_batch(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_import_rows_freeze() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_forecast_run_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_forecast_adjustment_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_offering_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_offering_audit_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_offering_confirmation_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_offering_confirmation_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_confirmed_offering_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.db_confirmed_offering_audit() FROM PUBLIC;
