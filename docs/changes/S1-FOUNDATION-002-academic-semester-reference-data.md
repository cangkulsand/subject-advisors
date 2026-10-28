# S1-FOUNDATION-002 — Academic semester reference data

- **Status:** COMPLETE — coordinator pre-write and post-write review passed; human review separate
- **Date:** 2026-10-28
- **Sprint:** Sprint 1
- **Owner:** FOUNDATION / Integration
- **Related UC / FR:** P002 UC08 reference data dependency
- **Target:** Neon development only — project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5` (`development`), database `neondb`
- **Reviewer:** Coordinator pre-write SQL and independent post-write verification passed

## 1. Plan

### Objective / problem
The local offerings screen has no configured semesters because the shared development database has no `academic_semester` rows for academic year 2026/2027. Add only the user-authorized reference rows so the existing selector can populate; do not change application code or schema.

### Authorized values
- Semester 1: `NORMAL`, maximum 3 subjects, 12 credits.
- Semester 2: `NORMAL`, maximum 3 subjects, 12 credits.
- Semester 3: `SHORT`, maximum 3 subjects, 6 credits.
- `start_date` and `end_date`: `NULL`.

### Scope and exclusions
- In scope: inspect the exact Neon development target, table schema and existing rows; prepare idempotent additive SQL that inserts missing rows and validates existing values.
- Out of scope: production or other branch changes, schema/DDL changes, migrations, application edits, other academic years/semesters, dates, subjects, student or offering data, and any overwrite of conflicting semester rows.

### Read-only inspection evidence
- `get_branch` and `list_branches` confirmed project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, branch name `development`, state `ready`.
- Read-only `information_schema.columns` inspection confirmed `academic_semester` uses generated integer identity `semester_id`; required `academic_year varchar(9)`, `semester_no smallint`, `semester_type varchar(10)`, `max_subjects smallint`, `max_credits smallint`; nullable `start_date date`, `end_date date`.
- Read-only query for `academic_year = '2026/2027'` returned no rows.
- Local migration constraints confirm unique `(academic_year, semester_no)`, semester 1/2 `NORMAL`, semester 3 `SHORT`, nonnegative configured maxima, and optional dates.
- Before insertion, the requested academic-year query returned no rows.

### Executed SQL

The following statement was executed through Neon `run_sql_transaction`, which provides the transaction boundary (no explicit nested `BEGIN`/`COMMIT`):

```sql
DO $$
DECLARE
  mismatches integer;
BEGIN
  INSERT INTO public.academic_semester
    (academic_year, semester_no, semester_type, max_subjects, max_credits, start_date, end_date)
  VALUES
    ('2026/2027', 1, 'NORMAL', 3, 12, NULL, NULL),
    ('2026/2027', 2, 'NORMAL', 3, 12, NULL, NULL),
    ('2026/2027', 3, 'SHORT',  3,  6, NULL, NULL)
  ON CONFLICT (academic_year, semester_no) DO NOTHING;

  SELECT count(*) INTO mismatches
  FROM (VALUES
    ('2026/2027', 1::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2026/2027', 2::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2026/2027', 3::smallint, 'SHORT',  3::smallint,  6::smallint)
  ) AS requested(academic_year, semester_no, semester_type, max_subjects, max_credits)
  LEFT JOIN public.academic_semester AS actual
    USING (academic_year, semester_no)
  WHERE actual.semester_id IS NULL
     OR actual.semester_type <> requested.semester_type
     OR actual.max_subjects <> requested.max_subjects
     OR actual.max_credits <> requested.max_credits
     OR actual.start_date IS NOT NULL
     OR actual.end_date IS NOT NULL;

  IF mismatches <> 0 THEN
    RAISE EXCEPTION 'Existing 2026/2027 semester configuration conflicts with approved values';
  END IF;
END $$;
```

The statement is additive and repeatable: it never updates a row; conflicting existing values abort the transaction, including any missing rows tentatively inserted by this run.

### Verification plan
- Before execution: coordinator reviewed and approved the target IDs, requested values, conflict behavior and SQL.
- Execution: the reviewed DO statement succeeded in Neon `run_sql_transaction` on the exact development target.
- Independent post-commit verification used `SELECT semester_id, academic_year, semester_no, semester_type, max_subjects, max_credits, start_date, end_date FROM public.academic_semester WHERE academic_year = '2026/2027' ORDER BY semester_no`.
- Read-back returned exactly three rows: IDs 1/2/3, semesters 1/2 `NORMAL` with 3 subjects/12 credits each, semester 3 `SHORT` with 3 subjects/6 credits; all start/end dates are NULL.
- No app/database tests, production checks, or student-data queries are needed for this reference-data change.

### Risks / assumptions / rollback
- Risk: user-provided maxima are reference configuration and may affect subsequent semester-choice display; the authorized values above are explicit.
- Assumption: no dates were requested, so both nullable date columns remain `NULL`.
- Rollback: no automated delete is proposed. If a correction is needed after insertion, stop and obtain reviewed exact-value instructions; do not overwrite or delete automatically.

## 2. Implementation

- **Status:** Reference rows inserted and independently verified
- **Files actually changed:** This change record; Neon `public.academic_semester` data on the authorized development branch.
- **Summary:** Inserted the three authorized 2026/2027 semester rows. No other records were changed.
- **Database changes:** `semester_id` 1, 2 and 3; values verified below.

## 3. Review

- **Self-review checklist:** Target IDs match the user-authorized development environment; schema and constraints were checked; executed SQL touches only the requested reference rows, does not specify identity IDs, never overwrites, and validates conflicts. Independent post-commit read-back matched all approved values.
- **Test evidence:** Neon branch verification succeeded; `run_sql_transaction` succeeded; independent `run_sql` SELECT returned the three expected rows.
- **Review outcome:** PASS — COORDINATOR PRE-WRITE SQL REVIEW AND POST-WRITE DATA VERIFICATION
- **Human reviewer / approval:** Pending

## 4. Changelog

- **Date:** 2026-10-28
- **Type:** Added / Reference data
- **Added / Changed / Fixed:** Added 2026/2027 semesters 1, 2 and 3 with user-authorized types and limits; dates are NULL.
- **Affected routes / tables / consumers:** `public.academic_semester`; offerings GET/semester selector reads these configured rows.
- **Breaking changes / migration steps:** None; data-only insert, no schema migration.
- **Verification summary:** Transaction succeeded; independent read-back returned IDs 1/2/3 and all requested values. No application, student, or offering rows were changed.
- **Outstanding blockers / follow-up:** Refresh the local app or sign out/in if its five-minute academic cache still contains the previous empty calendar. No production, auth/provider settings, schema or student data were changed.
- **Final status:** COORDINATOR REVIEW PASS — rows inserted and independently verified; human review separate
