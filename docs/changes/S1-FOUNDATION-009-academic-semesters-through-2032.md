# S1-FOUNDATION-009 — Extend academic semesters through 2031/2032

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-11-09
- **Sprint:** Sprint 1
- **Owner:** FOUNDATION / Integration
- **Related UC / FR:** P002 UC08 reference data dependency
- **Branch / PR:** `main` / not created
- **Reviewer:** Coordinator pre-write SQL review and independent post-write review passed; human peer review pending

## 1. Plan

### Objective / problem
Extend the academic-semester reference calendar in the Neon development database from the existing 2026/2027 year through 2031/2032 inclusive so the semester selector can offer future years.

### Scope and requirements
- In scope: add semesters 1, 2 and 3 for academic years 2027/2028, 2028/2029, 2029/2030, 2030/2031 and 2031/2032.
- Semester 1 and 2 use `NORMAL`, maximum 3 subjects and 12 credits. Semester 3 uses `SHORT`, maximum 3 subjects and 6 credits.
- New rows have NULL start/end dates and `is_current = false`.
- Preserve every existing row, including the current semester marker and configured dates.
- Out of scope: production or other branches, schema/DDL/migrations, app changes, earlier years, dates, and changes to subjects, students or offerings.

### Proposed implementation
- Expected files: this change record only.
- APIs / database / interfaces: additive inserts into `public.academic_semester` on the exact Neon development target below. No schema or application interface changes.
- Dependencies / shared-file impact: P002 UC08 consumes the semester reference rows. No shared source files are planned.
- Target: Neon project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5` (`development`), database `neondb`.
- Reviewed transaction SQL (execute both statements together through Neon `run_sql_transaction`):

```sql
SELECT set_config('app.access_actor', 'codex:luna-development-seed', true),
       set_config('app.access_reason', 'User-requested development academic semesters 2027/2028 through 2031/2032', true);
```

```sql
DO $$
DECLARE mismatches integer;
BEGIN
  INSERT INTO public.academic_semester
    (academic_year, semester_no, semester_type, max_subjects, max_credits, start_date, end_date, is_current)
  VALUES
    ('2027/2028', 1, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2027/2028', 2, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2027/2028', 3, 'SHORT',  3,  6, NULL, NULL, false),
    ('2028/2029', 1, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2028/2029', 2, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2028/2029', 3, 'SHORT',  3,  6, NULL, NULL, false),
    ('2029/2030', 1, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2029/2030', 2, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2029/2030', 3, 'SHORT',  3,  6, NULL, NULL, false),
    ('2030/2031', 1, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2030/2031', 2, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2030/2031', 3, 'SHORT',  3,  6, NULL, NULL, false),
    ('2031/2032', 1, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2031/2032', 2, 'NORMAL', 3, 12, NULL, NULL, false),
    ('2031/2032', 3, 'SHORT',  3,  6, NULL, NULL, false)
  ON CONFLICT (academic_year, semester_no) DO NOTHING;

  SELECT count(*) INTO mismatches
  FROM (VALUES
    ('2027/2028', 1::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2027/2028', 2::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2027/2028', 3::smallint, 'SHORT',  3::smallint,  6::smallint),
    ('2028/2029', 1::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2028/2029', 2::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2028/2029', 3::smallint, 'SHORT',  3::smallint,  6::smallint),
    ('2029/2030', 1::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2029/2030', 2::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2029/2030', 3::smallint, 'SHORT',  3::smallint,  6::smallint),
    ('2030/2031', 1::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2030/2031', 2::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2030/2031', 3::smallint, 'SHORT',  3::smallint,  6::smallint),
    ('2031/2032', 1::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2031/2032', 2::smallint, 'NORMAL', 3::smallint, 12::smallint),
    ('2031/2032', 3::smallint, 'SHORT',  3::smallint,  6::smallint)
  ) AS requested(academic_year, semester_no, semester_type, max_subjects, max_credits)
  LEFT JOIN public.academic_semester AS actual USING (academic_year, semester_no)
  WHERE actual.semester_id IS NULL
     OR actual.semester_type <> requested.semester_type
     OR actual.max_subjects <> requested.max_subjects
     OR actual.max_credits <> requested.max_credits
     OR actual.start_date IS NOT NULL
     OR actual.end_date IS NOT NULL
     OR actual.is_current IS DISTINCT FROM false;

  IF mismatches <> 0 THEN
    RAISE EXCEPTION 'Existing 2027/2028–2031/2032 semester configuration conflicts with approved values';
  END IF;
END $$;
```

The operation is additive and idempotent: it inserts missing keys, does not update conflicts, and raises an exception if any requested key does not match the approved configuration. The transaction-local audit context is required by the live insert triggers.

### Acceptance criteria
- [x] Exactly 15 new semester keys exist for academic years 2027/2028 through 2031/2032, semesters 1–3.
- [x] Semester 1 and 2 rows have `NORMAL`, 3 subjects, 12 credits; semester 3 has `SHORT`, 3 subjects, 6 credits.
- [x] All new rows have NULL `start_date` and `end_date`, and `is_current = false`.
- [x] Existing 2026/2027 rows, dates, and current marker remain unchanged; semester 1 remains current.
- [x] No duplicate year/semester keys exist; audit rows reflect only the 15 INSERT operations.

### Verification plan
- Before execution, coordinator reviews the exact SQL and target identifiers.
- Executed the two statements atomically with Neon `run_sql_transaction` on project `still-waterfall-91972583`, branch `br-shy-cherry-azuzy9v5`, database `neondb`; the transaction succeeded once.
- Coordinator independently read back `semester_id`, year, number, type, limits, dates and current marker for 2026/2027 through 2031/2032. Verification passed: 18 total rows, all 15 future rows match, IDs 4–18; original IDs 1–3 are JSON-identical to baseline; no duplicate year/semester keys.
- Coordinator verified uniqueness/counts and exactly 15 audit INSERTs (audit IDs 10–24, entity IDs 4–18), with the expected actor/reason, NULL before_data, and after_data matching inserted rows. Application tests were not run because this was reference-data-only.

### Risk / assumptions / rollback
- Risks: incorrect reference limits could affect semester selection. The limits explicitly follow the existing 2026/2027 semester type configuration.
- Assumptions: no dates were supplied, so new dates remain NULL; new rows are not current.
- Baseline observed read-only on 2026-11-09: the exact development branch is ready; `academic_semester` has unique `(academic_year, semester_no)`, checks for year/semester/type/nonnegative maxima/date order, identity `semester_id`, required `is_current`, and audit/context plus immutable-delete triggers. Existing rows are IDs 1, 2 and 3 for 2026/2027; ID 1 is current. Semester 1 dates are 2026-10-01 through 2027-02-06, semester 2 dates are 2027-03-01 through 2027-08-01, and semester 3 dates are NULL. The latest existing academic setup audit ID was 9. Preserve all these values.
- Rollback: no automated delete or overwrite. If execution encounters conflicting rows or another error, the transaction must abort; stop and obtain reviewed instructions rather than deleting or updating data.

## 2. Implementation

- **Status:** COMPLETE
- **Files actually changed:** This change record only.
- **Summary:** Added and verified 15 future semester reference rows on the authorized Neon development branch. Existing rows were preserved.
- **Decisions / deviations from plan:** None.
- **Migrations / env / shared contracts:** No schema migration, environment change or shared contract change was made.

## 3. Review

- **Self-review checklist:** Reviewed the recorded SQL against the authorized scope; coordinator independently verified row values, unchanged baseline, uniqueness and audit entries.
- **Test evidence:** Neon transaction succeeded; coordinator read-only verification passed all 9 checks. Application tests were not run for this reference-data-only change.
- **Manual checks:** Read-only Neon target/schema/baseline inspection, transaction result, and independent post-write readback completed.
- **Defects found and fixes:** None.
- **Review outcome:** PASS — coordinator pre-write SQL review and independent post-write verification.
- **Human reviewer / approval:** Pending; separate from coordinator review.

## 4. Changelog

- **Date:** 2026-11-09
- **Type:** Added / Reference data
- **Added / Changed / Fixed:** Added 15 future academic semester reference rows for 2027/2028 through 2031/2032.
- **Affected routes / tables / consumers:** `public.academic_semester`; P002 UC08 semester selector.
- **Breaking changes / migration steps:** None; additive data-only operation, no schema migration.
- **Verification summary:** One atomic Neon transaction succeeded. Coordinator independently verified 18 rows through 2031/2032, correct values/dates/current flags, unchanged original rows, no duplicate keys, and 15 expected audit INSERTs.
- **Outstanding blockers / follow-up:** Human peer review remains separate; no database follow-up is pending.
- **Final status:** READY_FOR_REVIEW


