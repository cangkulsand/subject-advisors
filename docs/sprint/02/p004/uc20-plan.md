# P004 Sprint 2 UC20 implementation plan

- **Owner:** P004 / Programmer 4
- **Module:** M6 Class Offering Forecast and Optimization
- **Use case:** UC20, Provide Academic Data and Generate Class Offering Forecast
- **Status:** PLANNED; feature implementation has not started in this change
- **Date:** 2026-11-01
- **Actors:** Academic Coordinator; System Administrator for configuration only
- **Change record:** [S2-P004-001](../../../changes/S2-P004-001-uc20-sprint-plan.md)
- **Updated 2026-11-01:** [S2-P004-006](../../../changes/S2-P004-006-confirmed-offerings-rule.md) adds coordinator offering confirmation (section 11). Earlier statements that offerings are never published or that UC20 ignores student data are superseded where they conflict with section 11.

UC20 provides a dated academic snapshot, generates an initial advisory forecast,
and supports review of proposed class sections. The forecast preserves its inputs,
rules, assumptions, quality warnings and decisions as the baseline for UC23.
A forecast, including a FINALIZED one, is advisory and publishes nothing. After review the Coordinator
separately CONFIRMS the offered subjects per programme + learning centre + target semester
(section 11); only that confirmation is what students see.

## 1. Existing foundation and scope

The repository already supplies guarded coordinator navigation, import and forecast
tables, append-only decision audits, and database protections for referenced
snapshots, capacity rules and finalized forecasts. The coordinator screens are
placeholders; these structures do not constitute an implemented UC20 workflow.
Decided 2026-11-02 (MT8): data provision has two sources. The main source is a frozen snapshot of the
students currently in the system (`student_profile` / `academic_record`, read-only; external reference
`PORTAL-<student_id>`); a CSV upload is the other source. Decided 2026-11-02 (MT9): the Coordinator chooses per forecast between "Students in the system" (default), "CSV import" and "Both" (one combined snapshot). Uploaded (CSV) cohort
members are identified only by source external references and do not need portal accounts.

Build on the existing contracts and protections:

- [Implementation workflow](../../../implementationguide.md)
- [Database data contracts](../../../database/data-contracts.md)
- [Database schema decisions](../../../database/schema-decisions.md)
- [Caching guideline](../../../cachingguide.md)

The current user-supplied UC20 definition governs this plan. CSV input, API paths
and detailed schema additions below are proposed implementation choices. Capacity
figures remain configurable examples until set in the catalogue/configuration.

The coordinator flow is degree/programme -> configured centre -> upload. An active
Coordinator may choose only a programme and learning centre within their admin-managed
assignment (faculty, degree, learning centre; decided 2026-11-01, supersedes the earlier
any-centre statement); outside it the server returns 403 `SCOPE_NOT_ASSIGNED`. The selected programme supplies the curriculum/subject
catalogue and rules; centre only scopes the cohort and forecast.

In scope are data provision and validation, subject-code reconciliation, dated
snapshots, conditional demand estimation, exclusions, capacity-based proposals,
quality warnings, justified review and finalization of the initial baseline.

Out of scope are UC23 updates and comparisons, historical accuracy validation
without real outcomes, timetabling, lecturer or room optimization, automatic or official
offering publication (coordinator confirmation is a separate step, section 11), LLM explanations, transcript extraction, and other owners' complete
eligibility or graduation engines.

## 2. Implementation sequence

| Order | Work package | Deliverable |
| --- | --- | --- |
| 1 | Contracts and policy | Import template, validation vocabulary, demand assumptions, capacity resolution and lifecycle |
| 2 | Persistence | Additive support for provenance, completeness, rule snapshots, uncertainty and adjustment audits |
| 3 | Data provision | Upload, correction report, reconciliation and acceptance of a separate dated snapshot |
| 4 | Demand estimation | Deterministic evaluation using shared curriculum and prerequisite rules |
| 5 | Section allocation | Balanced capacity-based proposals with minimum and break-even warnings |
| 6 | Review and finalization | Justified adjustments, atomic audits, concurrency checks and frozen finalized results |
| 7 | Integration and verification | Coordinator screens, configuration controls, acceptance evidence and handoff |

Each implementation package requires its own Plan, Implementation, Review and
Changelog record. Review each completed package before dependent work begins.

## 3. Academic data provision and validation

**Two sources (decided 2026-11-02, MT8).** "Use students in the system" is the main option: `POST /api/coordinator/forecast-imports/system-snapshots` selects students of the programme (curriculum), of the requested centre (via the scope provider; interim KL for all), with ACTIVE access and the STUDENT role, and stores an ACCEPTED snapshot with a coverage report. Student-entered records are COMPLETE history; no records means UNKNOWN. WITHDRAWN is stored as FAILED. The CSV flow below is the second option.

**Three data sources, chosen per forecast (decided 2026-11-02, MT9).** The Coordinator picks the source on `/coordinator/imports` (radio group, default "Students in the system", remembered in the URL `source=csv|both`); it is not an admin setting. "CSV import" is the flow below. "Both" builds ONE combined snapshot (one forecast): the system students plus the CSV students who are not already in the system, via `POST /api/coordinator/forecast-imports/combined-snapshots` (multipart, same fields as the CSV upload). Duplicate rule: the SYSTEM record wins; a CSV student is skipped when its `external_reference` equals a system student's `matric_no` (trimmed, case-insensitive, only when non-empty and unique among the selected system students) or the system `PORTAL-<id>` reference; same name with a different reference is kept and reported as a `POSSIBLE_DUPLICATE_STUDENT` warning, never merged on name. The CSV part is validated exactly like the CSV flow (422 + ETag + `If-Match`, existing `subset-acceptances`); the batch source is `COMBINED`, every student carries a source (`SYSTEM` or `CSV`), the fingerprint covers the CSV bytes plus the system data, and the coverage report lists system, CSV and combined figures. Generate, review, finalize and confirm are unchanged. See [S2-P004-009](../../../changes/S2-P004-009-uc20-data-source-toggle.md).

Provide one downloadable CSV template as the initial input format. Support an explicit
student row even when no subject history is supplied, so missing histories do not
make students disappear from coverage reporting. The exact header and status mapping
are settled in the first work package. Select programme and centre before upload;
capture selected programme, centre, target semester, source date and source label with
the import. Student rows carry an external reference, cohort status, history completeness
and curriculum version. A blank version is valid only when exactly one configured
version exists for the selected programme; otherwise require an explicit per-student
version. The selected programme's configured `curriculum_subject`/`subject` catalogue
provides curriculum membership, subjects, prerequisite conditions and exclusions. List
excluded FYP/Industrial Training subjects with their configured reasons; never create a
new subject from the upload. Uploaded students do not tie to portal profiles/accounts.

Capture the learning centre, target semester, source date and source label. Student
data includes an external reference, curriculum, cohort status and whether history
is complete, partial or unknown. Subject histories include subject code, academic
status, semester when known and synthetic-data indicators. Avoid collecting names
or other identifying fields unless the agreed workflow requires them.

Validate structure, required fields, supported values, duplicate students, duplicate
or conflicting subject attempts, curriculum membership and subject codes. Repeated
attempts in different semesters must not be rejected merely because the subject
appears more than once.

Classify findings as:

- **File errors:** malformed structure or missing required columns.
- **Record errors:** invalid values, conflicting duplicates, unknown curriculum or
  unmatched subject codes.
- **Warnings:** missing histories, incomplete coverage, synthetic records and stale
  source dates.

Use the shared catalogue and approved code aliases. Ambiguous matches require
correction; do not silently use fuzzy matches or create new master subjects.
Return a correction report with the row, field, problem and required action.

Reject malformed files and affected invalid records. If a coordinator accepts a
valid subset, preserve rejected-record counts, the acceptance decision and resulting
coverage warnings. Rejected history must not make a student appear to have complete
records or verified eligibility.

Acceptance creates a separate, immutable dated snapshot. Corrected data creates
another snapshot. Never overwrite StudentProfile, AcademicRecord or student offering picks. M6 must work without imported students having portal accounts.
Source staleness uses an explicit configurable policy and warns about deferred or
changed enrollments.

## 4. Persistence and reproducibility

Reuse `academic_import_batch`, `imported_student`, `imported_subject_record`,
`class_capacity_rule`, `forecast_run`, `forecast_subject_demand`,
`proposed_class_section` and `forecast_decision_audit_log`.

| Current gap | Planned support |
| --- | --- |
| Import context | Programme, centre, target semester, source fingerprint, validation summary and acceptance metadata |
| Programme scope | Selected programme on imports and forecasts; uniqueness by programme, centre, semester and version |
| History completeness | Per-student completeness and quality flags |
| Accepted-snapshot freeze | Freeze imported rows when accepted, not only after a forecast references the batch; corrections create another snapshot |
| Reproducible rules | Actual curriculum, prerequisites/conditional rules, semester rules, exclusions and capacity values used, with assumptions and engine version |
| Uncertain demand | Separate uncertainty counts and reason codes |
| Evidence gaps | Recognized-credit evidence and quality state where prerequisite rules require it |
| Forecast namespace | Initial baseline unique by programme + centre + target semester; replace centre-only version key |
| Manual adjustments | Original proposal plus before/after values for decisions, section counts and allocations |
| Subject-specific capacities | Explicit policy resolution for approved exceptions such as selected 35-student labs |

Choose minimal additive fields or structures after reviewing the canonical schema.
Do not create parallel copies of existing domain tables or modify historical
migrations. Coordinate migration and manifest changes with DATABASE_FOUNDATION.

A foreign key to a mutable catalogue row is insufficient to reproduce a forecast.
Preserve the actual rules used. Generate from one consistent source and rule view;
save the run, quality results, demands and proposals atomically. On failure, expose
no successful partial forecast.

## 5. Demand estimation

Implement a deterministic engine without an LLM. For each imported student and
curriculum subject:

1. Determine whether the student's cohort status is supported by the stated
   forecasting assumptions.
2. Resolve completed and exempted subjects under the agreed outcome and retake
   policy, counting each student once per subject.
3. Apply curriculum membership and configured semester restrictions (the Normal/Short
   offering rule, see below).
4. Evaluate mandatory prerequisites from supplied evidence. Recommended prior
   knowledge remains advisory; corequisites remain distinct.
5. Mark unsupported history, credit or corequisite conditions uncertain rather than
   inventing a satisfied or failed requirement.
6. Apply subject-level forecast exclusions.

**Normal/Short offering rule (product owner decision 2026-11-02).** The rule from
[S1-P002-006](../../../changes/S1-P002-006-guided-offerings.md) is an official offering rule stored as data in
`subject_semester_rule` (one NORMAL or SHORT row per curriculum subject): Short (semester 3) runs 2-credit or
Elective U1/U2 subjects except Project I; Normal (1/2) runs the rest plus Project I. Explicit additions: SECD3761
is Short-only; paired lecture/lab subjects (SECR2242/SECR2941, SECR3242/SECR3941) run in Normal. The stored rows are
authoritative; no code special cases. A subject is **not offered in the target semester type** when every
curriculum that contains it has rule rows for it and none is the target type; it then gets no demand, no sections,
is not counted in totals, stays visible with "Runs only in Short semesters" / "Runs only in Normal semesters", and
is persisted as `configuration_status = 'EXCLUDED'`, `forecast_count` NULL, with `semesterTypeExcluded` and the
reason in `scenario_assumptions.subjects` (distinct from catalogue exclusions; no migration change). A subject with
**no** rule rows is unrestricted. The rule snapshot carries the curriculum fingerprints (which include the rules)
and `semesterTypeExclusions`; the engine version is `uc20-engine-1.1.0`. Projek Sarjana Muda 1/2, Latihan Industri
(SECJ3032, SECJ4134, SECJ4114, SECJ4118, SECR3032, SECR4134, SECR4114, SECR4118) and UKQT3001 are excluded in the
catalogue (`include_in_offering_forecast = false`) and are never forecast or confirmed.

Return supported eligibility, uncertain eligibility, estimated demand under the
selected assumptions, supported graduation-critical counts, and exclusions with
reason codes.

Eligible students form a potential demand pool, not confirmed enrollment. The initial
estimator may use that pool as a clearly labelled planning assumption, explaining
that student preferences and semester workloads can reduce actual demand. Do not
present the sum of all eligible subjects as each student's feasible semester plan.
The assumption must be explicit and preserved with the forecast.

Use the supported eligible pool as the default advisory demand assumption, labelled
as potential demand, not confirmed registration or a feasible semester workload; save
that assumption with the forecast. No administrator approval screen is required for
this default. Missing/ambiguous retake, credit or corequisite evidence marks only the
affected student's subject result uncertain; it does not block the cohort forecast.
Missing evidence produces `PRELIMINARY` or `INSUFFICIENT_DATA`, rather than a
misleading verified-eligibility claim. Unknown counts remain separate and do not
silently increase supported demand.

Graduation-critical status should consume an agreed graduation-evaluation contract
when available. Otherwise, allow a documented coordinator designation with evidence
and label it as such; do not claim that graduation eligibility was verified.
Synthetic fixtures establish calculation behavior, not real demand accuracy.

## 6. Capacity-based section proposals

Resolve the administrator-configured policy for each subject. For supported demand
`D > 0` and normal capacity `C`, propose `ceil(D / C)` sections. Distribute demand
evenly while preserving the total and respecting capacity limits.

| Example using provisional policies | Proposal |
| --- | --- |
| 14 students; minimum 15 | One section flagged for review |
| 46 students; lecture maximum 45 | Two sections, 23 and 23 |
| 71 students; lab maximum 35 | Three sections, approximately 24, 24 and 23 |
| Zero supported demand with unresolved histories | Preserve the insufficient-data indication where applicable |

Flag sections below minimum enrollment and below the break-even reference
separately. Neither condition automatically cancels an offering. Graduation-critical
low enrollment requires documented exceptional review and any institutional approval.

Normal capacity is the allocation default. Exceeding it requires a justified exception
within the configured maximum; do not automatically fill to the exception maximum.
Missing or ambiguous capacity produces `CONFIGURATION_REQUIRED` for affected sections,
not an invented value or a whole-cohort block. Missing staleness thresholds produce a
warning, not a cohort-wide block.

Use subject configuration to exclude FYP1, FYP2 and Industrial Training from
classroom recommendations. Keep the excluded subjects visible with their reasons.
Decided 2026-11-01: two class types, LAB and non-lab (LECTURE); maximum per class LAB 35 and
LECTURE 45; optimal class size 25 (the break-even target). These replace the earlier 40 / 30 /
35 examples and are administrator-configurable values, entered as configuration. The minimum
of 15 remains a provisional example.

## 7. Review, decisions and finalization

Use `DRAFT -> UNDER_REVIEW -> FINALIZED` for the initial baseline. Coordinators may
adjust section proposals and decisions only in Draft or Under Review. Require
justification for manual changes, low-enrollment exceptions and capacity exceptions.
Preserve the original recommendation alongside each adjustment.

Save decisions and append-only audit entries in one transaction. Record the verified
actor, timestamp, old and new values, reason, and relevant approval reference. Use
concurrency checks so overlapping reviews cannot silently overwrite each other.

Finalization validates that required reviews are resolved, preserves external
institutional approval references where needed, and records the final actor and
timestamp. Save the final audit entries before freezing the run in the same
transaction, consistent with existing database protections.

Finalized results and decisions are read-only through both API and database paths.
Finalization records an advisory result; it does not publish or confirm offerings or grant
institutional approval. Confirmation is a later, separate coordinator step (section 11). UC20 creates the initial baseline. Changes to generated
source inputs or assumptions, and later version comparison, belong to UC23.

## 8. Screens, interfaces and access

Activate existing coordinator destinations for imports, data quality, forecasts,
decisions and audit. The "Offering Decisions" page (`/coordinator/decisions`) is the planned
home of the confirmation screen (section 11). Version updates and comparisons remain under UC23. Provide
loading, empty, correction, forbidden and retryable failure states, with keyboard
and responsive behavior consistent with the shared staff shell.

Expected implementation areas:

- `apps/api/src/modules/forecasting/`
- `apps/web/src/features/coordinator/`
- `packages/shared/src/forecasting/`
- Canonical database migrations, checks and feature verification tooling.

The API covers validation, snapshot acceptance, initial forecast generation,
forecast retrieval, review decisions, finalization and audit retrieval. Exact paths
and request/response types are settled before implementation. Generation needs
idempotency protection, plus transactional version allocation, so retries or
concurrent requests cannot create duplicate initial baselines.

Every endpoint enforces current backend authorization. Only an active, authorized
Coordinator accesses uploaded cohorts and forecasts, and only for programmes and centres
within the Coordinator's assignment (decided 2026-11-01). System Administrators receive configuration access only.
A selected centre in a browser request is not proof of authorization. Provide a
Coordinator-only catalogue/context operation for configured programmes, centres,
semesters and the selected programme's curriculum versions, subjects, conditions and
exclusion reasons. Superseded 2026-11-02: the system-students snapshot reads student profiles and records (read-only, frozen
snapshot) as the main data source. Outside that snapshot the student-derived data a Coordinator sees is the pick read in section 11 (pick counts and the
pickers' name and profile/record fields, within the Coordinator's assignment only).

Keep raw cohorts out of browser persistence, shared caches and application logs.
Minimize identifying fields and define source access, retention, expiry and deletion
or anonymization procedures. Existing referenced-snapshot immutability must be
reconciled with the approved retention process without granting runtime services
permission to disable integrity protections. Use backend-authorized no-store
responses for private data, and document any narrow in-memory caching separately.

Administrative controls cover only the forecast configuration needed by UC20,
including capacities, exclusions and stale-source policy. Reuse shared catalogue
configuration instead of rebuilding M2 or the complete M7 dashboard. Keep raw
cohorts external-reference-only; retention duration remains an operational decision,
not an extra Coordinator workflow approval step.

## 9. Dependencies and decisions

- **P001 / M2:** Shared curriculum, subject, prerequisite, semester and requirement
  contracts; approved reference data and configuration ownership.
- **P002:** Reuse an agreed pure eligibility contract where compatible. The forecast
  calculation stays independent of student-profile participation; student pick counts are
  displayed beside it and are never a calculation input (section 11).
- **P003:** Graduation-critical evidence can consume the agreed graduation contract
  when available. The documented manual designation provides an honest fallback.
- **P004 / FOUNDATION:** Current authentication and role checks, programme-scoped
  import/forecast migration and acceptance-time snapshot freeze,
  canonical migration review, runtime permissions and retention design.

Before implementation with real data, settle the CSV/outcome mappings, cohort-status
interpretation, retake precedence, capacity values/precedence and exceptional-review
authority, stale-source threshold and retention obligations. Use the advisory eligible
pool as the default assumption without an approval screen. Centre access follows the
Coordinator's admin-managed assignment (decided 2026-11-01); the assignment model is a
dependency, not an unresolved policy. Unavailable evidence stays uncertain for affected students or marks affected
sections `CONFIGURATION_REQUIRED`; do not invent an institutional rule or block unrelated
supported forecast results.

## 10. Acceptance and verification

- [ ] Invalid records produce a correction report; incomplete histories stay uncertain.
- [ ] Accepted snapshots are separate and dated; portal records remain unchanged.
- [ ] Identical accepted inputs, rule snapshots and engine versions produce identical calculations.
- [ ] Excluded subjects receive no classroom sections and retain an exclusion reason.
- [ ] Section allocations preserve supported demand and respect configured capacity.
- [ ] Below-minimum and graduation-critical cases require appropriate human review.
- [ ] Adjustments preserve justification, actor and before/after audit values atomically.
- [ ] Finalized results reject edits through both API and database protections.
- [ ] Unauthorized users and dataset scopes are denied, including direct-ID requests.
- [ ] Retries, concurrent generation and conflicting reviews cannot duplicate or silently overwrite work.
- [ ] Changes to the shared catalogue do not alter a saved forecast's meaning.
- [ ] Source provenance and retention controls are documented and exercised appropriately.
- [ ] No student records are modified by the workflow, and forecast generation/finalization publishes nothing; only an explicit coordinator confirmation (section 11) makes subjects visible to students.
- [ ] Synthetic tests are labelled and make no real demand-accuracy claim.

Run focused engine, API, database and browser tests for these behaviors, followed by
the existing repository checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:local
npm.cmd run check:cloudflare
```

The Cloudflare check is a build and deployment dry-run, not publication. Database
verification must use the reviewed migration workflow and an approved test target.
Record executed commands and actual outcomes in each implementation change record;
distinguish mocks, live checks and human review.

Rollback of future implementation should disable the new entry points and revert
feature code while preserving accepted snapshots, forecasts and audits. Review
migration recovery separately; do not delete live records as a routine rollback.

## 11. Offering confirmation (product owner decision 2026-11-01)

Change record: [S2-P004-006](../../../changes/S2-P004-006-confirmed-offerings-rule.md). SRS wording:
[amendment](../../../requirements/srs-amendment-2026-11-01-confirmed-offerings.md). This section is
planned work; nothing here is implemented yet.

- **Step after review.** After import and forecast, the Coordinator confirms which subjects
  will be offered for programme + learning centre + target semester. It is deliberate (never
  automatic) and audited (actor, time, reason). It is allowed from a FINALIZED run for the same
  scope; the run is stored as provenance. Excluded subjects (Projek Sarjana Muda 1/2, Latihan Industri, UKQT3001) and subjects that do not run
  in the target semester type (Normal/Short rule, 422 `SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE`) cannot
  be confirmed.
- **Lifecycle.** A subject is `CONFIRMED` or `WITHDRAWN`. Confirm adds or re-confirms, withdraw
  removes it from the student list, both with a reason and an append-only audit entry. The
  **latest confirmation for programme + centre + semester is authoritative.**
- **Target semester.** The confirmation is for the NEXT semester after the system current
  semester. The System Administrator advances the system current semester in the Academic
  Semesters module (not students); a planned admin-managed current-semester marker is a
  P004/admin follow-up (`academic_semester` has no such flag today). The student profile
  current semester remains the student's own setup value.
- **Pick deadline.** Confirming sets a pick deadline for the scope (replaces the Google Form
  practice). Students pick or change picks only until it; afterwards picks are closed
  (read-only). The Coordinator may change it (audited, `SET_DEADLINE`).
- **Limits.** Picks respect `academic_semester.max_subjects` / `max_credits` (enforced on save);
  already-passed subjects are hidden; prerequisites stay a display aid (UC09 owns eligibility).
- **Scope of access.** Only within the Coordinator's assignments (faculty, degree, centre).
- **Cycle end.** The cycle ends when students have picked and the Coordinator sees the counts:
  no class sections from picks, no registration, no timetable. Pick counts show the implied
  number of classes (`ceil(picks / max)`; LAB 35, LECTURE 45) against the optimal 25 as a
  display aid only.
- **Dependencies.** Coordinator-assignment model, admin-managed current-semester marker, and a
  future admin reference-data module (learning centres, degrees, faculties, degree subjects);
  `forecast_run.programme_id` (Package 2) is required. Planned migrations target the
  development database only.
- **Students.** The semester offerings page shows only these confirmed subjects for the
  student's programme + learning centre + next semester, labelled "Confirmed by coordinator".
  If none are confirmed: "Offerings not yet confirmed by the coordinator", no picking. Students
  pick from the confirmed list only.
- **Coordinator view.** The forecast and the student pick counts and pickers (per subject,
  assigned scope only) are shown side by side so the Coordinator can decide which
  subjects to make available next semester. Pick counts are display only and are NOT an input
  to the forecast calculation. This partially reverses the old rule that UC20 is independent of
  student portal participation: the calculation remains independent; the display is not.
- **Pickers (decided 2026-11-01, reverses "counts only").** For each subject the coordinator sees the pick count AND the list of students who picked it (name, matric number, current semester, credits completed, and intake once recorded), only for students whose profile programme + learning centre fall within the coordinator's assignment (403 `SCOPE_NOT_ASSIGNED` otherwise). No small-number suppression. Students never see other students' picks. This replaces the old process of importing names and untaken subjects from the student management system. Fields: name, matric number, current semester and credits completed exist today (credits derived from the records); intake semester is a planned addition (P001). Seniority (decided 2026-11-01, OP16): credits completed toward the student's curriculum, highest first; tie-break the earliest intake, then the current semester. A display aid only: the coordinator decides and nothing is allocated automatically. The ordering is the display-aid policy, version 1, implemented in ONE shared helper (`SENIORITY_POLICY_VERSION`, `compareBySeniority`, `sortPickers` in `packages/shared/src/forecasting/confirmed-offerings.ts`) and is revisable: a later change needs a new change record plus an update to that helper. It needs no database migration because the ordering is computed and never stored.
- **Wording.** No claim of official registration or a guaranteed timetable (SRS BR8 updated).
- **Interfaces.** Operations are in `docs/api/forecasting-uc20.openapi.json` (tag "Offering
  confirmation"): list/confirm/withdraw confirmed offerings, audit, and pick counts. Shared
  types: `packages/shared/src/forecasting/confirmed-offerings.ts`.
- **Data (planned, P004 with P001/P002).** `confirmed_offering` and `confirmed_offering_audit`
  (P004), `student_offering_pick` (P002), `student_profile.learning_centre_id` (P001). Migration
  order and owners are in the change record.
- **Forecast versions (UC23), decided.** A new forecast run or version never changes, invalidates
  or requires re-confirmation of offerings already confirmed; the forecast is a guide only. The
  confirmation keeps its source `forecastRunId` for provenance. The coordinator changes offerings
  only by explicitly confirming or withdrawing. Optional display aid: an informational "newer
  forecast available" notice when a newer run exists for the same programme + centre + semester;
  no automatic effect.
